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

from app.models import InterviewSession
from app.services.interview.agent import (
    INTERVIEW_COMPLETE_MARKER,
    PHASE_COMPLETE_MARKER,
    InterviewAgent,
    detect_emotion,
    strip_markers,
)
from app.services.interview.events import EventKind, StreamEvent
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)


class InterviewRunner:
    """面试回合执行器（每会话一个）。"""

    def __init__(
        self,
        session: InterviewSession,
        llm: LLMClient,
        agent: InterviewAgent | None = None,
    ):
        self.session = session
        self.llm = llm
        self.agent = agent or InterviewAgent(session, llm)

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
    ) -> list[dict[str, Any]]:
        """构造 LLM API 调用的 messages 列表（必要时附加图像模态）。"""
        user_content = self._build_user_content(text, face)
        if not image_b64:
            return list(self.agent.messages) + [{"role": "user", "content": user_content}]

        return list(self.agent.messages) + [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_content},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            }
        ]

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
            opening_messages = list(self.agent.messages) + [
                {"role": "user", "content": "面试开始，请按照当前阶段开始提问。"},
            ]

            content_buf = ""
            async for token in self.llm.chat_stream(opening_messages, temperature=0.8):
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
            user_content = self._build_user_content(user_text, face)
            self.agent.record_user_text(user_content)
            api_messages = self._build_api_messages(user_text, face, image_b64)

            # 流式生成
            content_buf = ""
            async for token in self.llm.chat_stream(
                api_messages, temperature=0.75
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