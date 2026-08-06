"""面试回合：流式事件消费者（开场 / 常规回合 / 手动收尾）。

从 :class:`app.services.interview.runner.InterviewRunner` 拆出，职责单一：
- 以 AsyncIterator 形式产出 :class:`StreamEvent`（token / turn_done / error）；
- 聚合 :class:`PromptAssembler` 组装消息、:class:`ToolRoundRunner` 执行工具轮次、
  :class:`InterviewAgent` 推进状态并持久化。
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession
from app.services.interview.agent import (
    INTERVIEW_COMPLETE_MARKER,
    InterviewAgent,
    detect_emotion,
    strip_markers,
)
from app.services.interview.events import StreamEvent
from app.services.interview.followup import analyze as analyze_followup
from app.services.interview.prompt_assembler import PromptAssembler
from app.services.interview.tool_round_runner import ToolRoundRunner
from app.services.llm.client import LLMClient
from app.services.rag.company_rag import CompanyKnowledgeRAG

logger = logging.getLogger(__name__)


class StreamingConsumer:
    """面试回合流式执行器（每会话一个）。"""

    _CLOSING_BY_PERSONALITY: dict[str, str] = {
        "gentle": "语气温暖鼓励，肯定准备与态度，温和指出 1-2 个可改进点。",
        "professional": "语气专业克制，给出结构化口头评价（优势/待提升），感谢配合。",
        "pressure": "保持一定锐利但不刻薄，点出扛压表现与薄弱处，仍须正式致谢。",
        "hr": "侧重软技能与文化匹配感受，鼓励后续沟通，致谢。",
        "expert": "从技术深度点评亮点与缺口，专业致谢。",
    }

    def __init__(
        self,
        session: InterviewSession,
        llm: LLMClient,
        agent: InterviewAgent,
        rag: CompanyKnowledgeRAG | None = None,
    ) -> None:
        self.session = session
        self.llm = llm
        self.agent = agent
        self.rag = rag
        self.prompter = PromptAssembler(session, agent)
        self.tools = ToolRoundRunner(session, llm, agent, rag)

    # ------------------------------------------------------------------
    # 开场
    # ------------------------------------------------------------------

    async def stream_opening(self, db: Session) -> AsyncIterator[StreamEvent]:
        """启动面试，返回流式开场白。"""
        try:
            # 重建系统 prompt
            self.agent.reset_messages()
            system_prompt = self.agent.build_opening_prompt(db)
            self.agent.messages = [{"role": "system", "content": system_prompt}]
            context_window = self.prompter.get_context_window(db)
            if context_window:
                from app.services.context.manager import compress_messages

                self.agent.messages = compress_messages(
                    self.agent.messages, context_window
                )

            opening_messages = list(self.agent.messages) + [
                {"role": "user", "content": "面试开始，请按照当前阶段开始提问。"},
            ]
            # 工具循环（GitHub 核验等）→ 再流式生成开场白
            opening_messages, early = await self.tools.run_tool_rounds(
                opening_messages, db, temperature=0.8
            )

            content_buf = ""
            if early:
                content_buf = early
                yield StreamEvent.make_token(early)
            else:
                # 最终流式：只带 retrieval 类 tools，避免再触发 function 循环
                stream_tools = self.tools.collect_chat_tools(include_function_tools=False)
                async for token in self.llm.chat_stream(
                    opening_messages, temperature=0.8, tools=stream_tools
                ):
                    content_buf += token
                    yield StreamEvent.make_token(token)

            self.agent.record_assistant_text(content_buf)
            self.agent.set_questions_in_phase(1)
            self.agent.mark_active()
            self.agent.save_state(db)

            yield StreamEvent.make_turn_done(
                content=strip_markers(content_buf),
                phase_id=self.agent.current_phase().id,
                is_complete=False,
                phase_changed=False,
                emotion=detect_emotion(content_buf),
            )
        except Exception as e:
            logger.exception("开场回合失败: %s", e)
            yield StreamEvent.make_error("面试官服务暂时不可用，请稍后重试")

    # ------------------------------------------------------------------
    # 常规回合
    # ------------------------------------------------------------------

    async def stream_turn(
        self,
        user_text: str,
        db: Session,
        *,
        face: dict[str, Any] | None = None,
        image_b64: str | None = None,
        followup_probe: str | None = None,
    ) -> AsyncIterator[StreamEvent]:
        """处理候选人回答，输出流式事件。

        Args:
            user_text: 候选人发言文本
            db: 数据库 Session
            face: 候选人当前面部分析
            image_b64: 摄像头截图（多模态）
            followup_probe: 来自结构化追问分析器的引导（注入 system prompt）
        """
        if self.session.status == "completed":
            yield StreamEvent.make_error("面试已结束")
            return

        try:
            # 1. 写入 user 原文（占位，稍后会被覆盖为带面部分析提示的完整版）
            self.agent.record_user_text(user_text)

            # 2. 结构化追问分析（基于最近一轮 LLM 问题与候选人回答）
            last_question = self.prompter.last_assistant_question()
            tech_domains = self.prompter.get_tech_domains(db)
            signal = analyze_followup(
                user_text,
                question=last_question,
                tech_domains=tech_domains,
                phase_id=self.agent.current_phase().id,
            )
            if signal.needs_followup:
                self.agent.messages.append({
                    "role": "system",
                    "content": (
                        f"[追问引导：{signal.category}] "
                        f"{signal.suggested_probe}"
                    ),
                })
                # 追问触发即记录薄弱线索，供自我成长与去重使用
                self.agent.note_weak_point(
                    f"[{signal.category}] {signal.suggested_probe}"
                )
                # 记录真实追问类别（区别于 tool_trace 的工具名统计）
                clues = self.agent.agent_state.setdefault("followup_clues", [])
                clues.append(signal.category)
                if len(clues) > 60:
                    del clues[:-60]
                # 不再原样打印 user_text，避免 PII 进入日志
                logger.info(
                    "追问信号: session=%s cat=%s len=%d",
                    self.session.id, signal.category, len(user_text),
                )

            # 2.5 刷新 system prompt 中的结构化记忆段落：
            # 使 asked_questions / weak_points / github_findings 反映最新值，
            # 避免长会话压缩后重复提问、丢失薄弱点追踪。
            self.agent.refresh_system_memory()

            # 2.6 RAG 检索：从企业知识库检索与当前问题/回答相关的文档片段
            rag_msg = await self.tools.maybe_retrieve_rag(
                query=f"{last_question} {user_text}".strip(),
            )
            if rag_msg:
                self.agent.messages.append(rag_msg)

            # 3. 重新计算包含面部分析提示的 user content。
            # 追问引导与 RAG（若存在）追加在 user 之后，不能被覆盖 —— 因此先 pop
            # 末尾追加的辅助消息，再替换 user，最后按顺序追加回去。
            # 防御性上限：最多 pop 5 条 system 消息，防止匹配前缀误判时无限循环。
            trailing_msgs: list[dict[str, Any]] = []
            for _ in range(5):
                if not self.agent.messages:
                    break
                tail = self.agent.messages[-1]
                if tail.get("role") != "system":
                    break
                content = tail.get("content", "")
                if not (isinstance(content, str) and (
                    content.startswith("[追问引导") or content.startswith("## 企业知识库")
                )):
                    break
                trailing_msgs.append(self.agent.messages.pop())
            trailing_msgs.reverse()

            user_content = self.prompter.build_user_content(user_text, face)
            self.agent.messages[-1] = {"role": "user", "content": user_content}
            for m in trailing_msgs:
                self.agent.messages.append(m)

            context_window = self.prompter.get_context_window(db)
            api_messages = self.prompter.build_api_messages(
                user_text, face, image_b64, context_window=context_window
            )

            # 工具循环：GitHub / 公司 / 简历核验后再流式发言
            api_messages, early = await self.tools.run_tool_rounds(
                api_messages, db, temperature=0.75
            )

            content_buf = ""
            if early:
                content_buf = early
                yield StreamEvent.make_token(early)
            else:
                stream_tools = self.tools.collect_chat_tools(include_function_tools=False)
                async for token in self.llm.chat_stream(
                    api_messages, temperature=0.75, tools=stream_tools
                ):
                    content_buf += token
                    yield StreamEvent.make_token(token)

            # 收尾处理
            self.agent.record_assistant_text(content_buf)
            is_complete = INTERVIEW_COMPLETE_MARKER in content_buf
            phase_changed = self.agent.advance_phase_if_needed(content_buf)

            if is_complete:
                self.agent.mark_completed()
            self.agent.save_state(db)

            yield StreamEvent.make_turn_done(
                content=strip_markers(content_buf),
                phase_id=self.agent.current_phase().id,
                is_complete=is_complete,
                phase_changed=phase_changed,
                emotion=detect_emotion(content_buf),
            )
        except Exception as e:
            logger.exception("回合执行失败: %s", e)
            yield StreamEvent.make_error("面试官服务暂时不可用，请稍后重试")

    # ------------------------------------------------------------------
    # 手动结束：个性化口头收尾
    # ------------------------------------------------------------------

    async def stream_closing(self, db: Session) -> AsyncIterator[StreamEvent]:
        """候选人主动结束：面试官口头致谢 + 个性化小结，并标记完成。"""
        if self.session.status == "completed":
            yield StreamEvent.make_error("面试已结束")
            return

        try:
            personality = (self.session.personality or "professional").lower()
            style_hint = self._CLOSING_BY_PERSONALITY.get(
                personality, self._CLOSING_BY_PERSONALITY["professional"]
            )
            phases = self.agent.workflow.phases
            summary_idx = next(
                (i for i, ph in enumerate(phases) if ph.id == "summary"),
                max(0, len(phases) - 1),
            )
            if self.agent.current_phase_idx < summary_idx:
                self.agent.current_phase_idx = summary_idx
                self.agent.questions_in_phase = 0
                self.session.current_phase = phases[summary_idx].id

            nl = "\n"
            closing_system = (
                "候选人主动点击了「结束面试」。请立刻做口头收尾，不要再提问、不要开启新考察。"
                + nl
                + "要求："
                + nl
                + "1. 感谢候选人参加本次模拟面试；"
                + nl
                + "2. 结合本场已聊内容，用 3–6 句给出个性化口头总结与评价"
                + "（至少各提一点优势与待改进）；若对话很少，也可基于态度与表达作简要评价；"
                + nl
                + f"3. 人设与语气：{style_hint}"
                + nl
                + "4. 不要输出 JSON、表格或报告标题；不要捏造未提及的项目细节；"
                + nl
                + "5. 结尾单独一行写：[INTERVIEW_COMPLETE]"
            )
            self.agent.messages.append({"role": "system", "content": closing_system})
            self.agent.refresh_system_memory()

            context_window = self.prompter.get_context_window(db)
            api_messages = list(self.agent.messages)
            if context_window:
                from app.services.context.manager import compress_messages

                api_messages = compress_messages(api_messages, context_window)
            api_messages = api_messages + [
                {"role": "user", "content": "（系统）请按指示完成口头收尾与评价。"},
            ]

            content_buf = ""
            stream_tools = self.tools.collect_chat_tools(include_function_tools=False)
            async for token in self.llm.chat_stream(
                api_messages, temperature=0.7, tools=stream_tools
            ):
                content_buf += token
                yield StreamEvent.make_token(token)

            if INTERVIEW_COMPLETE_MARKER not in content_buf:
                content_buf = content_buf.rstrip() + "\n" + INTERVIEW_COMPLETE_MARKER

            self.agent.record_assistant_text(content_buf)
            self.agent.mark_completed()
            self.agent.save_state(db)

            yield StreamEvent.make_turn_done(
                content=strip_markers(content_buf),
                phase_id=self.agent.current_phase().id,
                is_complete=True,
                phase_changed=True,
                emotion=detect_emotion(content_buf) or "smile",
            )
        except Exception as e:
            logger.exception("收尾发言失败: %s", e)
            yield StreamEvent.make_error("面试官服务暂时不可用，请稍后重试")


__all__ = ["StreamingConsumer"]
