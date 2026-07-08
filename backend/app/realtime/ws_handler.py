"""WebSocket 面试会话处理器。

仅负责传输层职责：
- 接收前端消息（音频/文本/视觉/静音/请求提纲）
- 调用 :class:`InterviewRunner` 驱动面试回合
- 消费 runner 的 :class:`StreamEvent` 并翻译为前端事件
- 调度 TTS 句子级播放
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.agents.orchestrator import InterviewOrchestrator
from app.agents.vision.agent import VisionAgent
from app.config import get_settings
from app.database import SessionLocal
from app.models import InterviewSession, LLMSettings
from app.realtime.events import TurnState
from app.services.interview.agent import InterviewAgent, strip_markers
from app.services.interview.events import EventKind, StreamEvent
from app.services.interview.runner import InterviewRunner
from app.services.llm.client import LLMClient
from app.services.stt.whisper import transcribe_pcm_base64_async
from app.services.tts.edge import split_sentences, synthesize_to_base64

logger = logging.getLogger(__name__)
settings = get_settings()


class InterviewWSHandler:
    """管理单个面试 WebSocket 连接的生命周期。"""

    def __init__(self, websocket: WebSocket, session_id: int):
        self.ws = websocket
        self.session_id = session_id
        self.turn_state = TurnState.IDLE
        self.audio_buffer: list[str] = []
        self.orchestrator = InterviewOrchestrator()
        self.agent: InterviewAgent | None = None
        self.llm: LLMClient | None = None
        self.runner: InterviewRunner | None = None
        self.tts_voice = settings.tts_voice
        self._whisper_model = settings.whisper_model

    # ------------------------------------------------------------------
    # 传输层工具
    # ------------------------------------------------------------------

    async def send(self, msg_type: str, **payload: Any) -> None:
        await self.ws.send_json({"type": msg_type, **payload})

    async def set_turn(self, state: TurnState) -> None:
        self.turn_state = state
        await self.send("turn_state", state=state.value)

    # ------------------------------------------------------------------
    # 主循环
    # ------------------------------------------------------------------

    async def handle(self) -> None:
        await self.ws.accept()
        db = SessionLocal()
        try:
            session = db.query(InterviewSession).filter(
                InterviewSession.id == self.session_id
            ).first()
            if not session:
                await self.send("error", message="面试会话不存在")
                return

            self.llm = LLMClient.from_db(db)
            self.agent = InterviewAgent(session, self.llm)
            self.runner = InterviewRunner(session, self.llm, self.agent)

            row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
            if row:
                if row.tts_voice:
                    self.tts_voice = row.tts_voice
                self._whisper_model = row.stt_model or settings.whisper_model
            else:
                self._whisper_model = settings.whisper_model

            if session.status == "pending":
                await self.set_turn(TurnState.AI_SPEAKING)
                async for event in self._consume_runner_opening(db):
                    await self._dispatch_event(event)
                await self.set_turn(TurnState.USER_SPEAKING)
            elif session.status == "active":
                await self.set_turn(TurnState.USER_SPEAKING)
            else:
                await self.send("error", message="面试已结束")
                return

            while True:
                data = await self.ws.receive_json()
                await self._dispatch(data, db, session)
        except WebSocketDisconnect:
            logger.info("WS 断开 session=%s", self.session_id)
        except Exception as e:
            logger.exception("WS 错误: %s", e)
            try:
                await self.send("error", message=str(e))
            except Exception:
                pass
        finally:
            db.close()

    # ------------------------------------------------------------------
    # 消息分发
    # ------------------------------------------------------------------

    async def _dispatch(self, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
        msg_type = data.get("type", "")
        if msg_type == "audio_chunk":
            chunk = data.get("data", "")
            if chunk:
                self.audio_buffer.append(chunk)
        elif msg_type == "stt_text":
            text = data.get("text", "").strip()
            if text:
                await self.send("stt_partial", text=text)
        elif msg_type == "vision_update":
            face = data.get("face_analysis")
            if face:
                self.orchestrator.snapshot.merge_face(face)
                self.orchestrator.snapshot.vision_summary = VisionAgent.summarize(face)
        elif msg_type == "user_turn_end":
            await self._on_user_turn_end(data, db, session)
        elif msg_type == "silence_timeout":
            await self._on_silence_nudge(db, session)
        elif msg_type == "user_text":
            text = data.get("text", "").strip()
            if text and self.turn_state == TurnState.USER_SPEAKING:
                await self.set_turn(TurnState.PROCESSING)
                await self.send("stt_final", text=text)
                await self._process_user_text(text, data, db, session)
        elif msg_type == "request_hint":
            await self._on_request_hint(data, db, session)

    # ------------------------------------------------------------------
    # 用户回合结束
    # ------------------------------------------------------------------

    async def _on_user_turn_end(
        self, data: dict[str, Any], db: Session, session: InterviewSession
    ) -> None:
        if self.turn_state == TurnState.PROCESSING:
            return
        await self.set_turn(TurnState.PROCESSING)

        text = data.get("text", "").strip()
        pcm_b64 = data.get("pcm") or data.get("data") or ""
        if not text and pcm_b64:
            text = await transcribe_pcm_base64_async(pcm_b64, model_size=self._whisper_model)
            if text:
                await self.send("stt_final", text=text)
        elif not text and self.audio_buffer:
            pcm = "".join(self.audio_buffer)
            self.audio_buffer = []
            text = await transcribe_pcm_base64_async(pcm, model_size=self._whisper_model)
            if text:
                await self.send("stt_final", text=text)

        # Whisper 失败时回退到浏览器 STT 文本
        if not text:
            text = data.get("text", "").strip()
            if text:
                await self.send("stt_final", text=text)

        if not text:
            await self.set_turn(TurnState.USER_SPEAKING)
            return

        await self._process_user_text(text, data, db, session)

    # ------------------------------------------------------------------
    # 核心：消费 runner 流式事件
    # ------------------------------------------------------------------

    async def _consume_runner_opening(self, db: Session):
        assert self.runner is not None
        async for event in self.runner.stream_opening(db):
            yield event

    async def _consume_runner_turn(
        self,
        text: str,
        data: dict[str, Any],
        db: Session,
    ):
        assert self.runner is not None
        face = data.get("face_analysis") or self.orchestrator.snapshot.face_analysis
        image_b64 = data.get("image_base64")
        self.orchestrator.snapshot.last_user_text = text
        self.orchestrator.snapshot.merge_face(face)

        async for event in self.runner.stream_turn(
            text,
            db,
            face=face,
            image_b64=image_b64,
        ):
            yield event

    async def _process_user_text(
        self, text: str, data: dict[str, Any], db: Session, session: InterviewSession
    ) -> None:
        assert self.runner is not None
        await self.set_turn(TurnState.PROCESSING)
        await self.set_turn(TurnState.AI_SPEAKING)

        sentence_buf = ""
        async for event in self._consume_runner_turn(text, data, db):
            await self._dispatch_event(event)
            if event.kind == EventKind.TOKEN:
                sentence_buf += event.token
                if any(sentence_buf.endswith(p) for p in ["。", "！", "？", "!", "?", "\n"]):
                    sent = sentence_buf.strip()
                    if sent:
                        await self._speak_one(sent)
                    sentence_buf = ""
            elif event.kind == EventKind.TURN_COMPLETE:
                if sentence_buf.strip():
                    await self._speak_one(sentence_buf.strip())
                sentence_buf = ""
                if event.is_complete:
                    await self.set_turn(TurnState.IDLE)
                else:
                    await self.set_turn(TurnState.USER_SPEAKING)
            elif event.kind == EventKind.ERROR:
                await self.set_turn(TurnState.USER_SPEAKING)

    # ------------------------------------------------------------------
    # runner 事件 → 前端 WS 事件
    # ------------------------------------------------------------------

    async def _dispatch_event(self, event: StreamEvent) -> None:
        if event.kind == EventKind.TOKEN:
            await self.send("assistant_token", token=event.token)
        elif event.kind == EventKind.TURN_COMPLETE:
            await self.send(
                "assistant_done",
                content=event.content,
                phase=event.phase_id,
                is_complete=event.is_complete,
                emotion=event.emotion,
            )
        elif event.kind == EventKind.ERROR:
            await self.send("error", message=event.error)

    # ------------------------------------------------------------------
    # 参考提纲
    # ------------------------------------------------------------------

    async def _on_request_hint(self, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
        question = data.get("question", "").strip()
        if not question or not self.llm:
            return
        await self.send("reference_hint_loading", question=question)
        hint = await self._generate_reference_hint(question, db, session)
        await self.send("reference_hint", question=question, content=hint)

    async def _generate_reference_hint(
        self, question: str, db: Session, session: InterviewSession
    ) -> str:
        assert self.llm and self.agent
        system_ctx = ""
        for m in self.agent.messages:
            if m.get("role") == "system":
                system_ctx = str(m.get("content", ""))[:4000]
                break
        messages = [
            {
                "role": "system",
                "content": (
                    "你是面试辅导助手。根据候选人背景，为面试官的问题生成简洁参考回答提纲。\n"
                    "要求：3-5 个要点，每点一行，以「•」开头；结合简历具体经历；不要冗长；不要替候选人捏造未提及的项目细节。"
                ),
            },
            {
                "role": "user",
                "content": f"候选人背景摘要：\n{system_ctx}\n\n面试官问题：{question}\n\n请给出参考回答提纲：",
            },
        ]
        try:
            return await self.llm.chat(messages, temperature=0.4)
        except Exception as e:
            logger.warning("参考提纲生成失败: %s", e)
            return "暂时无法生成参考回答，请根据你的实际经历组织语言。"

    # ------------------------------------------------------------------
    # 静默追问
    # ------------------------------------------------------------------

    async def _on_silence_nudge(self, db: Session, session: InterviewSession) -> None:
        if self.turn_state != TurnState.USER_SPEAKING:
            return
        nudge = self.orchestrator.build_silence_nudge(session.personality, session.strictness)
        await self.set_turn(TurnState.PROCESSING)
        await self.send("silence_nudge", content=nudge)
        await self._speak_one(nudge)
        await self.set_turn(TurnState.USER_SPEAKING)

    # ------------------------------------------------------------------
    # TTS
    # ------------------------------------------------------------------

    async def _speak_sentences(self, text: str) -> None:
        for s in split_sentences(text):
            await self._speak_one(s)

    async def _speak_one(self, sentence: str) -> None:
        audio_b64 = await synthesize_to_base64(sentence, self.tts_voice)
        if audio_b64:
            await self.send("tts_audio", data=audio_b64, sentence=sentence)

    # 兼容旧接口，handler 内部不再直接使用
    _clean_reply = staticmethod(strip_markers)