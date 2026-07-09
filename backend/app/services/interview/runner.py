"""面试回合执行器：唯一的面试流转入口。

设计目标：
- ws_handler / HTTP API / tests 都通过 :class:`InterviewRunner` 与面试流程交互。
- 内部聚合 LLM 流式调用、句子切分、人脸分析提示、追问引导、阶段推进、状态保存。
- 状态推进接口在 :class:`InterviewAgent` 上以 public 暴露，禁止跨包访问私有字段。
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession, LLMSettings
from app.services.context.manager import compress_messages, estimate_messages_tokens
from app.services.interview.agent import (
    INTERVIEW_COMPLETE_MARKER,
    PHASE_COMPLETE_MARKER,
    InterviewAgent,
    detect_emotion,
    strip_markers,
)
from app.services.interview.events import EventKind, StreamEvent
from app.services.interview.followup import analyze as analyze_followup
from app.services.llm.client import LLMClient
from app.services.rag.company_rag import CompanyKnowledgeRAG, format_context as format_rag_context
from app.core.constants import RAGBackendKind

logger = logging.getLogger(__name__)


class InterviewRunner:
    """面试回合执行器（每会话一个）。"""

    def __init__(
        self,
        session: InterviewSession,
        llm: LLMClient,
        agent: InterviewAgent | None = None,
        rag: CompanyKnowledgeRAG | None = None,
    ):
        self.session = session
        self.llm = llm
        self.agent = agent or InterviewAgent(session, llm)
        self.rag = rag

    # ------------------------------------------------------------------
    # 工具方法
    # ------------------------------------------------------------------

    @staticmethod
    def _build_user_content(
        text: str,
        face: dict[str, Any] | None,
    ) -> str:
        """组装最终发送给 LLM 的 user 文本（含面部分析提示）。"""
        content = text
        if face:
            hints: list[str] = []
            if not face.get("face_detected", True):
                hints.append("画面中未检测到人脸")
            elif face.get("looking_away"):
                hints.append("候选人似乎没有看镜头")
            nervousness = face.get("nervousness", 0)
            if isinstance(nervousness, (int, float)) and nervousness > 0.5:
                hints.append("候选人看起来比较紧张")
            if hints:
                content += f"\n[面部分析：{'; '.join(hints)}]"
        return content

    def _build_api_messages(
        self,
        text: str,
        face: dict[str, Any] | None,
        image_b64: str | None,
        context_window: int | None = None,
    ) -> list[dict[str, Any]]:
        """构造 LLM API 调用的 messages 列表（必要时附加图像模态 + 上下文压缩）。

        调用方需确保 ``self.agent.messages`` 末尾已经是当前回合的 user 消息（已被
        :meth:`stream_turn` 设置）。本方法不再追加额外的 user 消息。
        """
        messages = list(self.agent.messages)
        if image_b64:
            user_content = self._build_user_content(text, face)
            messages[-1] = {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_content},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            }

        if context_window:
            compressed = compress_messages(messages, context_window)
            if len(compressed) < len(messages):
                logger.info(
                    "上下文压缩: session=%s %d->%d (budget=%d)",
                    self.session.id, len(messages), len(compressed), context_window,
                )
            return compressed
        return messages

    def _last_assistant_question(self) -> str:
        """取消息历史中最近一条面试官发言，用于追问信号分析。"""
        for m in reversed(self.agent.messages):
            if m.get("role") == "assistant":
                content = m.get("content", "")
                if isinstance(content, str):
                    return content
        return ""

    def _get_tech_domains(self, db: Session) -> list[str]:
        """从候选人 profile 读取技术领域列表。"""
        profile = self.agent.get_user_profile(db)
        if profile is None:
            return []
        return profile.tech_domains_list or []

    def _get_context_window(self, db: Session) -> int:
        """读取当前 LLM 设置中的 context window。

        0 或未设置视为无限制（不压缩）。
        """
        row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
        if not row or not row.context_window:
            return 0
        return int(row.context_window)

    async def _maybe_retrieve_rag(
        self,
        query: str,
        *,
        top_k: int = 3,
    ) -> dict[str, str] | None:
        """如有 RAG 实例则检索；返回可注入 messages 的 system 消息或 None。

        - 若未配置 RAG、索引为空或 API 失败：返回 None（不影响主流程）
        - 检索失败时记录 warning，不抛出
        """
        if self.rag is None or not query:
            return None
        # StepFun 后端不返回本地命中片段（真实检索在 chat 时由 StepFun 服务端完成），
        # 此处直接返回 None，让 :meth:`_collect_chat_tools` 负责注入 retrieval tool。
        if getattr(self.rag, "kind", None) == RAGBackendKind.STEPFUN:
            return None
        try:
            company_id = self.session.company or None
            hits = await self.rag.query_for_company(
                query, company_id, top_k=top_k
            ) if company_id else await self.rag.query(query, top_k=top_k)
        except Exception as e:
            logger.warning("RAG 检索失败: %s", e)
            return None

        if not hits:
            return None

        # 过滤距离过大的弱匹配
        hits = [h for h in hits if h.get("distance", 1.0) < 0.5]
        if not hits:
            return None

        logger.info(
            "RAG 命中: session=%s company=%s hits=%d",
            self.session.id, self.session.company, len(hits),
        )
        return {
            "role": "system",
            "content": format_rag_context(hits),
        }

    def _collect_chat_tools(self) -> list[dict[str, Any]] | None:
        """收集当前 LLM 调用应注入的 tools。

        目前唯一来源是 :class:`StepFunRetrievalRAG` 的 retrieval tool。
        其他 RAG 后端走本地注入路径,无需在此处拼装。
        """
        if self.rag is None:
            return None
        builder = getattr(self.rag, "build_retrieval_tool", None)
        if builder is None:
            return None
        tool = builder()
        return [tool] if tool else None

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
            context_window = self._get_context_window(db)
            if context_window:
                self.agent.messages = compress_messages(
                    self.agent.messages, context_window
                )
            opening_messages = list(self.agent.messages) + [
                {"role": "user", "content": "面试开始，请按照当前阶段开始提问。"},
            ]

            content_buf = ""
            async for token in self.llm.chat_stream(
                opening_messages, temperature=0.8, tools=self._collect_chat_tools()
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
            yield StreamEvent.make_error(str(e))

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
            last_question = self._last_assistant_question()
            tech_domains = self._get_tech_domains(db)
            signal = analyze_followup(
                user_text,
                question=last_question,
                tech_domains=tech_domains,
            )
            if signal.needs_followup:
                self.agent.messages.append({
                    "role": "system",
                    "content": (
                        f"[追问引导：{signal.category}] "
                        f"{signal.suggested_probe}"
                    ),
                })
                # 不再原样打印 user_text，避免 PII 进入日志
                logger.info(
                    "追问信号: session=%s cat=%s len=%d",
                    self.session.id, signal.category, len(user_text),
                )

            # 2.5 RAG 检索：从企业知识库检索与当前问题/回答相关的文档片段
            rag_msg = await self._maybe_retrieve_rag(
                query=f"{last_question} {user_text}".strip(),
            )
            if rag_msg:
                self.agent.messages.append(rag_msg)

            # 3. 重新计算包含面部分析提示的 user content。
            # 追问引导与 RAG（若存在）追加在 user 之后，不能被覆盖 —— 因此先 pop
            # 末尾追加的辅助消息，再替换 user，最后按顺序追加回去。
            trailing_msgs: list[dict[str, Any]] = []
            while self.agent.messages and self.agent.messages[-1].get("role") == "system":
                content = self.agent.messages[-1].get("content", "")
                if content.startswith("[追问引导") or content.startswith("## 企业知识库"):
                    trailing_msgs.append(self.agent.messages.pop())
                else:
                    break
            trailing_msgs.reverse()

            user_content = self._build_user_content(user_text, face)
            self.agent.messages[-1] = {"role": "user", "content": user_content}
            for m in trailing_msgs:
                self.agent.messages.append(m)

            context_window = self._get_context_window(db)
            api_messages = self._build_api_messages(
                user_text, face, image_b64, context_window=context_window
            )

            # 流式生成
            content_buf = ""
            async for token in self.llm.chat_stream(
                api_messages, temperature=0.75, tools=self._collect_chat_tools()
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
            yield StreamEvent.make_error(str(e))


__all__ = ["InterviewRunner", "StreamEvent", "EventKind"]