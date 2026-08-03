"""连接生命周期（WS mixin）：握手、心跳、分发。"""

from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from typing import Any

from fastapi import WebSocketDisconnect
from sqlalchemy.orm import Session

from app.agents.vision.agent import VisionAgent
from app.config import get_settings
from app.core.constants import DEFAULT_LLM_RATE_LIMIT_PER_MINUTE, MAX_USER_TEXT_CHARS, SessionStatus
from app.core.logging import set_trace_id
from app.core.ratelimit import try_rate_limit_by_id
from app.core.session_auth import tokens_match
from app.database import SessionLocal
from app.models import InterviewSession, LLMSettings
from app.realtime.events import TurnState
from app.realtime.session_registry import (
    claim_session_connection,
    release_session_connection,
)
from app.services.interview.agent import InterviewAgent
from app.services.interview.runner import InterviewRunner
from app.services.llm.client import LLMClient
from app.services.stt import SttCredentials, warmup_whisper
from app.services.stt.cloud import is_local_stt_model
from app.services.tts import TtsCredentials
from app.services.tts.voice_resolve import resolve_prosody
from app.services.voice.catalog import find_provider
from app.services.voice.credentials import build_stt_credentials, build_tts_credentials

logger = logging.getLogger(__name__)
settings = get_settings()
_HEARTBEAT_TIMEOUT_SEC: float = 30.0
_HEARTBEAT_MAX_MISSES: int = 3
_AUDIO_BUFFER_MAX_BYTES: int = 5 * 1024 * 1024
_WS_LLM_RATE_LIMIT = DEFAULT_LLM_RATE_LIMIT_PER_MINUTE


class ConnectionLifecycleMixin:
    """握手 / 心跳 / 消息分发。"""

    async def send(self, msg_type: str, **payload: Any) -> None:
        await self.ws.send_json({"type": msg_type, **payload})

    async def _tts_send(self, msg_type: str, **payload: Any) -> None:
        """TTS 通道发送：附带 playback_generation 供客户端回传。"""
        if msg_type == "tts_audio":
            payload.setdefault("playback_generation", self._awaiting_playback_gen)
        await self.send(msg_type, **payload)

    async def set_turn(self, state: TurnState) -> None:
        self.turn_state = state
        if state == TurnState.USER_SPEAKING:
            self._mic_opened_at = asyncio.get_event_loop().time()
        await self.send("turn_state", state=state.value)

    # ------------------------------------------------------------------
    # 主循环
    # ------------------------------------------------------------------

    async def handle(self) -> None:
        # 若客户端通过 Sec-WebSocket-Protocol 传递令牌，握手须回显该子协议
        accept_kwargs: dict[str, str] = {}
        if self._ws_subprotocol:
            accept_kwargs["subprotocol"] = self._ws_subprotocol
        await self.ws.accept(**accept_kwargs)
        # 注入 trace_id 便于按 WS 会话串联日志
        ws_tid = f"ws-{self.session_id}-{uuid.uuid4().hex[:8]}"
        set_trace_id(ws_tid)
        db = SessionLocal()
        try:
            session = db.query(InterviewSession).filter(
                InterviewSession.id == self.session_id
            ).first()
            if not session:
                await self.send("error", message="面试会话不存在")
                return
            # 先鉴权再占租约：防止仅凭 session_id 踢掉合法连接
            if not tokens_match(
                getattr(session, "access_token", None), self._client_access_token
            ):
                await self.send("error", message="无权访问该面试会话")
                return
            await claim_session_connection(self)

            self.llm = LLMClient.from_db(db)
            if not self.llm.api_key:
                await self.send("error", message="请先配置面试思考处理器的 API Key")
                return
            self.agent = InterviewAgent(session, self.llm)

            # 企业知识库 RAG
            rag = None
            try:
                from app.services.rag.company_rag import CompanyKnowledgeRAG

                rag = CompanyKnowledgeRAG(self.llm)
            except Exception as e:
                logger.warning("RAG 实例化失败，继续无 RAG 模式: %s", e)

            self.runner = InterviewRunner(session, self.llm, self.agent, rag=rag)

            row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
            settings_voice = None
            # 三处理器：识别 / 思考(已是 llm) / 播报 —— 禁止把思考 Key 当 ASR
            self._stt_creds = build_stt_credentials(row)
            self._tts_creds = build_tts_credentials(row)
            if row:
                if row.tts_voice:
                    settings_voice = row.tts_voice
                    self.tts_voice = row.tts_voice
                asr_model = getattr(row, "asr_model", None) or row.stt_model
                self._whisper_model = asr_model or settings.whisper_model
                # native_audio coming_soon → 提示并按转写路径运行
                rec_meta = find_provider("recognize", self._stt_creds.provider)
                if rec_meta and rec_meta.get("status") == "coming_soon":
                    await self.send(
                        "info",
                        message=(
                            f"识别处理者「{rec_meta.get('label')}」尚未接通运行时，"
                            "已回退本地 Whisper 转写"
                        ),
                    )
                    self._stt_creds = SttCredentials(provider="local", model="base")
                speak_meta = find_provider("speak", self._tts_creds.handler)
                if speak_meta and speak_meta.get("status") == "coming_soon":
                    await self.send(
                        "info",
                        message=(
                            f"播报处理者「{speak_meta.get('label')}」尚未接通运行时，"
                            "已回退 Edge TTS"
                        ),
                    )
                    self._tts_creds = TtsCredentials(
                        handler="edge",
                        mode="tts_from_text",
                        voice=self._tts_creds.voice or settings.tts_voice,
                    )
                if self._tts_creds.mode == "text_only" or self._tts_creds.handler == "none":
                    await self.send("info", message="已启用仅字幕模式，不播报语音")
            else:
                self._whisper_model = settings.whisper_model

            # 形象优先绑定音色，并按人设/严厉度设定基线语速音高
            self._session_prosody = resolve_prosody(
                avatar_id=getattr(session, "avatar_id", None),
                personality=getattr(session, "personality", None),
                strictness=getattr(session, "strictness", None),
                emotion=None,
                llm_settings_voice=settings_voice or self.tts_voice,
            )
            self.tts_voice = self._session_prosody.voice
            self._tts_creds.voice = self.tts_voice
            self._tts_queue.set_prosody(self._session_prosody)
            self._tts_queue.set_tts_creds(self._tts_creds)
            self._tts_queue.set_on_sent(self._mark_tts_sent)
            logger.info(
                "管道绑定 sid=%s asr=%s speak=%s voice=%s rate=%s pitch=%s",
                self.session_id,
                self._stt_creds.provider,
                self._tts_creds.handler,
                self._session_prosody.voice,
                self._session_prosody.rate,
                self._session_prosody.pitch,
            )
            # 本地 Whisper 预热；云端 ASR 时仍预热 base 作回退
            if self._stt_creds.provider == "local" or is_local_stt_model(self._whisper_model):
                local_m = self._whisper_model if is_local_stt_model(self._whisper_model) else "base"
                asyncio.create_task(warmup_whisper(local_m))
            else:
                asyncio.create_task(warmup_whisper("base"))

            # 状态判断统一走枚举值
            if session.status == SessionStatus.PENDING.value:
                await self._tts_queue.start(self._tts_send)
                await self.set_turn(TurnState.AI_SPEAKING)
                await self._stream_events_with_tts(
                    self._consume_runner_opening(db),
                    db=db,
                    session=session,
                    auto_hint=True,
                )
                await self._open_mic_after_playback()
            elif session.status == SessionStatus.ACTIVE.value:
                await self._tts_queue.start(self._tts_send)
                # 重连：提升世代并直接开麦，避免等待已丢失的 playback_done
                self._begin_playback_wait()
                self._tts_sent_this_turn = False
                await self.set_turn(TurnState.USER_SPEAKING)
            else:
                await self.send("error", message="面试已结束")
                return

            # 主循环带心跳：30s 未收到客户端消息主动 ping；累计 3 次失败断开
            miss_count = 0
            while not self._superseded:
                try:
                    data = await asyncio.wait_for(
                        self.ws.receive_json(),
                        timeout=_HEARTBEAT_TIMEOUT_SEC,
                    )
                except asyncio.TimeoutError:
                    if self._superseded:
                        break
                    miss_count += 1
                    if miss_count >= _HEARTBEAT_MAX_MISSES:
                        logger.warning(
                            "WS 心跳超时断开 session=%s miss=%s",
                            self.session_id, miss_count,
                        )
                        await self.send(
                            "error", message="心跳超时，连接已断开"
                        )
                        break
                    try:
                        await self.send("server_ping", t=int(asyncio.get_event_loop().time() * 1000))
                    except Exception:
                        break
                    continue
                if self._superseded:
                    break
                miss_count = 0  # 收到任何客户端消息即重置
                await self._dispatch(data, db, session)
        except WebSocketDisconnect:
            logger.info("WS 断开 session=%s", self.session_id)
        except Exception as e:
            logger.exception("WS 错误: %s", e)
            # deadlock fallback：异常路径强制回到 USER_SPEAKING 防卡死
            try:
                await self.set_turn(TurnState.USER_SPEAKING)
                await self.send("error", message="服务端异常，已恢复 USER_SPEAKING")
            except Exception:
                pass
            try:
                db.rollback()
            except Exception:
                pass
        finally:
            await release_session_connection(self)
            try:
                await self._cancel_bg_tasks()
            except Exception:
                logger.exception("取消后台任务失败")
            try:
                await asyncio.wait_for(self._tts_queue.stop(), timeout=5.0)
            except Exception:
                logger.exception("TTS queue 关闭失败")
            try:
                db.close()
            except Exception:
                logger.exception("DB 关闭失败")

    # ------------------------------------------------------------------
    # 消息分发
    # ------------------------------------------------------------------

    async def _dispatch(self, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
        msg_type = data.get("type", "")
        if msg_type == "audio_chunk":
            chunk = data.get("data", "")
            if chunk:
                try:
                    new_bytes = len(base64.b64decode(chunk, validate=False))
                except Exception:
                    new_bytes = 0
                if self._audio_buffer_bytes + new_bytes > _AUDIO_BUFFER_MAX_BYTES:
                    logger.warning(
                        "audio_buffer 超上限 session=%s bytes=%s",
                        self.session_id,
                        self._audio_buffer_bytes + new_bytes,
                    )
                    await self.send(
                        "error",
                        message="音频缓存超限，请先结束当前回合",
                    )
                    self.audio_buffer = []
                    self._audio_buffer_bytes = 0
                    return
                self.audio_buffer.append(chunk)
                self._audio_buffer_bytes += new_bytes
        elif msg_type == "stt_text":
            text = data.get("text", "").strip()
            if text:
                await self.send("stt_partial", text=text)
        elif msg_type == "pong":
            # 心跳应答；miss_count 已在主循环收到消息时清零
            return
        elif msg_type == "vision_update":
            face = data.get("face_analysis")
            if face:
                self.orchestrator.snapshot.merge_face(face)
                self.orchestrator.snapshot.vision_summary = VisionAgent.summarize(face)
        elif msg_type == "user_turn_end":
            if not self._can_start_user_turn():
                return
            if not try_rate_limit_by_id(
                key="llm",
                client_id=f"ws-{self.session_id}",
                limit=_WS_LLM_RATE_LIMIT,
            ):
                await self.send("error", message="请求过于频繁，请稍后再试")
                return
            self._spawn(self._run_user_turn_end(data))
        elif msg_type == "silence_timeout":
            if self._turn_busy or self._closing:
                return
            self._spawn(self._on_silence_nudge())
        elif msg_type == "barge_in":
            # 候选人打断面试官（全双工）
            if self._closing:
                return
            self._spawn(self._on_candidate_barge_in())
        elif msg_type == "user_text":
            text = data.get("text", "").strip()
            if len(text) > MAX_USER_TEXT_CHARS:
                await self.send(
                    "error",
                    message=f"文本过长（上限 {MAX_USER_TEXT_CHARS} 字符）",
                )
                return
            if (
                text
                and self.turn_state == TurnState.USER_SPEAKING
                and self._can_start_user_turn()
            ):
                if not try_rate_limit_by_id(
                    key="llm",
                    client_id=f"ws-{self.session_id}",
                    limit=_WS_LLM_RATE_LIMIT,
                ):
                    await self.send("error", message="请求过于频繁，请稍后再试")
                    return
                self._spawn(self._run_user_text(text, data))
        elif msg_type == "request_hint":
            # 独立 DB session；与主回合共用 llm 限流桶，防止 hint 刷配额
            if not try_rate_limit_by_id(
                key="llm",
                client_id=f"ws-{self.session_id}",
                limit=max(5, _WS_LLM_RATE_LIMIT // 2),
            ):
                await self.send("error", message="请求过于频繁，请稍后再试")
                return
            self._spawn(self._on_request_hint(data))
        elif msg_type == "request_finish":
            if self._closing:
                return
            self._spawn(self._on_request_finish())
        elif msg_type == "tts_playback_done":
            # 仅当世代匹配时放行，防止重连后旧/乱序 done 干扰下一回合
            client_gen = data.get("generation")
            if client_gen is None or client_gen == self._awaiting_playback_gen:
                self._playback_done.set()
