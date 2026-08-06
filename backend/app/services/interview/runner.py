"""面试回合执行器门面：唯一的面试流转入口。

职责拆分（保持对外 API 与行为完全不变）：
- :class:`PromptAssembler` —— 消息组装与上下文查询（``prompt_assembler``）；
- :class:`ToolRoundRunner` —— 工具轮次执行（``tool_round_runner``）；
- :class:`StreamingConsumer` —— 三个流式入口（``streaming_consumer``）。

设计目标：
- ws_handler / HTTP API / tests 都通过 :class:`InterviewRunner` 与面试流程交互。
- 内部聚合 LLM 流式调用、句子切分、人脸分析提示、追问引导、状态推进、状态保存。
- 支持 GitHub / 企业知识 / 简历工具的 function calling 循环（最多 N 轮）。
- 状态推进接口在 :class:`InterviewAgent` 上以 public 暴露，禁止跨包访问私有字段。
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession
from app.services.interview.agent import InterviewAgent
from app.services.interview.events import EventKind, StreamEvent
from app.services.interview.streaming_consumer import StreamingConsumer
from app.services.llm.client import LLMClient
from app.services.rag.company_rag import CompanyKnowledgeRAG

logger = logging.getLogger(__name__)


class InterviewRunner:
    """面试回合执行器（每会话一个）——门面，委托给三个职责模块。"""

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
        # 三个职责模块共享同一 agent / session 状态
        self._consumer = StreamingConsumer(session, llm, self.agent, rag=rag)

    # ------------------------------------------------------------------
    # 兼容旧接口：直接委托给 StreamingConsumer
    # ------------------------------------------------------------------

    async def stream_opening(self, db: Session) -> AsyncIterator[StreamEvent]:
        """启动面试，返回流式开场白。"""
        async for event in self._consumer.stream_opening(db):
            yield event

    async def stream_turn(
        self,
        user_text: str,
        db: Session,
        *,
        face: dict[str, Any] | None = None,
        image_b64: str | None = None,
        followup_probe: str | None = None,
    ) -> AsyncIterator[StreamEvent]:
        """处理候选人回答，输出流式事件。"""
        async for event in self._consumer.stream_turn(
            user_text,
            db,
            face=face,
            image_b64=image_b64,
            followup_probe=followup_probe,
        ):
            yield event

    async def stream_closing(self, db: Session) -> AsyncIterator[StreamEvent]:
        """候选人主动结束：面试官口头致谢 + 个性化小结，并标记完成。"""
        async for event in self._consumer.stream_closing(db):
            yield event

    # ------------------------------------------------------------------
    # 兼容旧接口：委托给 PromptAssembler / ToolRoundRunner
    # ------------------------------------------------------------------

    @staticmethod
    def _build_user_content(
        text: str,
        face: dict[str, Any] | None,
    ) -> str:
        """组装最终发送给 LLM 的 user 文本（含面部分析提示）。"""
        from app.services.interview.prompt_assembler import PromptAssembler

        return PromptAssembler.build_user_content(text, face)

    def _build_api_messages(
        self,
        text: str,
        face: dict[str, Any] | None,
        image_b64: str | None,
        context_window: int | None = None,
    ) -> list[dict[str, Any]]:
        """构造 LLM API 调用的 messages 列表。"""
        return self._consumer.prompter.build_api_messages(
            text, face, image_b64, context_window=context_window
        )

    def _last_assistant_question(self) -> str:
        """取消息历史中最近一条面试官发言，用于追问信号分析。"""
        return self._consumer.prompter.last_assistant_question()

    def _get_tech_domains(self, db: Session) -> list[str]:
        """从候选人 profile 读取技术领域列表。"""
        return self._consumer.prompter.get_tech_domains(db)

    def _get_context_window(self, db: Session) -> int:
        """读取当前 LLM 设置中的 context window。"""
        return self._consumer.prompter.get_context_window(db)

    async def _maybe_retrieve_rag(
        self,
        query: str,
        *,
        top_k: int = 3,
    ) -> dict[str, str] | None:
        """如有 RAG 实例则检索；返回可注入 messages 的 system 消息或 None。"""
        return await self._consumer.tools.maybe_retrieve_rag(query, top_k=top_k)

    def _collect_chat_tools(self, *, include_function_tools: bool = True) -> list[dict[str, Any]] | None:
        """收集当前 LLM 调用应注入的 tools。"""
        return self._consumer.tools.collect_chat_tools(
            include_function_tools=include_function_tools
        )

    async def _run_tool_rounds(
        self,
        api_messages: list[dict[str, Any]],
        db: Session,
        *,
        temperature: float = 0.75,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """非流式工具循环：执行 tool_calls 最多 N 轮。"""
        return await self._consumer.tools.run_tool_rounds(
            api_messages, db, temperature=temperature
        )


__all__ = ["InterviewRunner", "StreamEvent", "EventKind"]
