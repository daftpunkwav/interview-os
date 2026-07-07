"""WebSocket 面试会话处理器。"""

import base64
import json
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
from app.services.interview.agent import InterviewAgent
from app.services.llm.client import LLMClient
from app.services.stt.whisper import transcribe_pcm_base64_async
from app.services.tts.edge import extract_emotion, split_sentences, synthesize_to_base64

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
        self.tts_voice = settings.tts_voice
        self._whisper_model = settings.whisper_model

    async def send(self, msg_type: str, **payload: Any) -> None:
        await self.ws.send_json({"type": msg_type, **payload})

    async def set_turn(self, state: TurnState) -> None:
        self.turn_state = state
        await self.send("turn_state", state=state.value)

    async def handle(self) -> None:
        await self.ws.accept()
        db = SessionLocal()
        try:
            session = db.query(InterviewSession).filter(InterviewSession.id == self.session_id).first()
            if not session:
                await self.send("error", message="面试会话不存在")
                return

            self.llm = LLMClient.from_db(db)
            self.agent = InterviewAgent(session, self.llm)
            row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
            if row:
                if row.tts_voice:
                    self.tts_voice = row.tts_voice
                self._whisper_model = row.stt_model or settings.whisper_model
            else:
                self._whisper_model = settings.whisper_model

            if session.status == "pending":
                await self.set_turn(TurnState.AI_SPEAKING)
                opening = await self.agent.start(db)
                clean = self._clean_reply(opening)
                await self.send("assistant_done", content=clean, phase=session.current_phase, is_complete=False, emotion=extract_emotion(opening))
                await self._speak_sentences(clean)
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

    async def _dispatch(self, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
        msg_type = data.get("type", "")
        if msg_type == "audio_chunk":
            chunk = data.get("data", "")
            if chunk:
                self.audio_buffer.append(chunk)
        elif msg_type == "stt_text":
            # 浏览器 Web Speech 备用文本
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

    async def _on_user_turn_end(self, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
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

    async def _process_user_text(self, text: str, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
        face = data.get("face_analysis") or self.orchestrator.snapshot.face_analysis
        image_b64 = data.get("image_base64")
        self.orchestrator.snapshot.last_user_text = text
        self.orchestrator.snapshot.merge_face(face)

        extra = self.orchestrator.build_context_prefix()
        full_text = f"{extra}\n{text}" if extra else text

        assert self.agent and self.llm
        await self.set_turn(TurnState.PROCESSING)

        # 流式生成
        content_buf = ""
        sentence_buf = ""
        await self.set_turn(TurnState.AI_SPEAKING)
        user_content = full_text
        if face:
            hints = []
            if not face.get("face_detected", True):
                hints.append("画面中未检测到人脸")
            elif face.get("looking_away"):
                hints.append("候选人似乎没有看镜头")
            if face.get("nervousness", 0) > 0.5:
                hints.append("候选人看起来比较紧张")
            if hints:
                user_content += f"\n[面部分析：{'; '.join(hints)}]"

        self.agent.messages.append({"role": "user", "content": user_content})
        if image_b64:
            api_messages = list(self.agent.messages)
            api_messages[-1] = {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_content},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                ],
            }
            stream_messages = api_messages
        else:
            stream_messages = self.agent.messages

        async for token in self.llm.chat_stream(stream_messages):
            content_buf += token
            sentence_buf += token
            await self.send("assistant_token", token=token)
            if any(sentence_buf.endswith(p) for p in ["。", "！", "？", "!", "?", "\n"]):
                sent = sentence_buf.strip()
                if sent:
                    await self._speak_one(sent)
                sentence_buf = ""

        if sentence_buf.strip():
            await self._speak_one(sentence_buf.strip())

        self.agent.messages.append({"role": "assistant", "content": content_buf})
        is_complete = "[INTERVIEW_COMPLETE]" in content_buf
        clean = self._clean_reply(content_buf)

        if "[PHASE_COMPLETE]" in content_buf or self.agent.questions_in_phase >= self.agent._current_phase().max_questions:
            self.agent._advance_phase()
        else:
            self.agent.questions_in_phase += 1

        if is_complete:
            session.status = "completed"
            from datetime import datetime, timezone
            session.ended_at = datetime.now(timezone.utc)

        self.agent._save_state(db)
        emotion = extract_emotion(content_buf)
        await self.send(
            "assistant_done",
            content=clean,
            phase=session.current_phase,
            is_complete=is_complete,
            emotion=emotion,
        )

        if is_complete:
            await self.set_turn(TurnState.IDLE)
        else:
            await self.set_turn(TurnState.USER_SPEAKING)

    async def _on_request_hint(self, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
        """根据面试官问题生成参考回答提纲。"""
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

    async def _on_silence_nudge(self, db: Session, session: InterviewSession) -> None:
        if self.turn_state != TurnState.USER_SPEAKING:
            return
        nudge = self.orchestrator.build_silence_nudge(session.personality, session.strictness)
        await self.set_turn(TurnState.PROCESSING)
        await self.send("silence_nudge", content=nudge)
        await self._speak_one(nudge)
        await self.set_turn(TurnState.USER_SPEAKING)

    async def _speak_sentences(self, text: str) -> None:
        for s in split_sentences(text):
            await self._speak_one(s)

    async def _speak_one(self, sentence: str) -> None:
        audio_b64 = await synthesize_to_base64(sentence, self.tts_voice)
        if audio_b64:
            await self.send("tts_audio", data=audio_b64, sentence=sentence)

    @staticmethod
    def _clean_reply(text: str) -> str:
        return (
            text.replace("[INTERVIEW_COMPLETE]", "")
            .replace("[PHASE_COMPLETE]", "")
            .replace("[emotion:neutral]", "")
            .replace("[emotion:smile]", "")
            .replace("[emotion:serious]", "")
            .strip()
        )
