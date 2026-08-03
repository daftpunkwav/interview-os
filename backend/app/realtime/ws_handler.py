"""WebSocket 面试会话处理器。

仅负责传输层职责：
- 接收前端消息（音频/文本/视觉/静音/请求提纲）
- 调用 :class:`InterviewRunner` 驱动面试回合
- 消费 runner 的 :class:`StreamEvent` 并翻译为前端事件
- 调度 TTS 句子级播放（非阻塞，使用串行队列避免重叠）
- 心跳 + 死锁 fallback：30s 收不到客户端消息发 ping，连续 3 次未回 pong
  关闭；异常路径强制 turn_state 回到 ``USER_SPEAKING`` 防卡死
- 单 session 单活跃连接：新连接踢旧，避免多端 save_state 互相覆盖
"""

from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.agents.orchestrator import InterviewOrchestrator
from app.agents.vision.agent import VisionAgent
from app.config import get_settings
from app.core.constants import SessionStatus
from app.core.logging import get_trace_id, set_trace_id
from app.core.session_auth import tokens_match
from app.database import SessionLocal
from app.models import InterviewSession, LLMSettings
from app.realtime.events import TurnState
from app.services.interview.agent import (
    InterviewAgent,
    ThinkStreamFilter,
    generate_and_persist_report,
    strip_markers,
    strip_think_blocks,
)
from app.services.interview.events import EventKind, StreamEvent
from app.services.interview.runner import InterviewRunner
from app.services.llm.client import LLMClient
from app.services.stt.whisper import transcribe_pcm_base64_async, warmup_whisper
from app.services.tts.edge import (
    extract_emotion,
    should_flush_sentence_buffer,
    synthesize_to_base64,
)
from app.services.tts.voice_resolve import VoiceProsody, resolve_prosody, with_emotion

logger = logging.getLogger(__name__)
settings = get_settings()

# 心跳与超时配置
_HEARTBEAT_TIMEOUT_SEC: float = 30.0
_HEARTBEAT_MAX_MISSES: int = 3
# audio_buffer 字节上限（按 base64 后的 raw pcm 估算）；超过强制刷 turn_end
_AUDIO_BUFFER_MAX_BYTES: int = 5 * 1024 * 1024  # 5 MB
# 与 HTTP InterviewMessageRequest.image_base64 对齐的视觉帧长度上限
_IMAGE_BASE64_MAX_LEN: int = 300_000

# ── 单会话单连接注册表 ────────────────────────────────────────
# session_id -> 当前持有租约的 handler；新连接 claim 时踢掉旧连接
_active_handlers: dict[int, InterviewWSHandler] = {}
_registry_lock = asyncio.Lock()


async def claim_session_connection(handler: InterviewWSHandler) -> None:
    """为 handler 占用 session 租约；若已有旧连接则通知并关闭旧连接。"""
    old: InterviewWSHandler | None = None
    async with _registry_lock:
        old = _active_handlers.get(handler.session_id)
        _active_handlers[handler.session_id] = handler
        handler._superseded = False
    if old is not None and old is not handler:
        old._superseded = True
        logger.info(
            "WS 会话租约被顶替 session=%s old=%s new=%s",
            handler.session_id,
            id(old),
            id(handler),
        )
        try:
            await old.send(
                "error",
                message="该面试已在其他连接中打开，本连接将关闭",
            )
        except Exception:
            pass
        try:
            await old.ws.close(code=4000)
        except Exception:
            pass


async def release_session_connection(handler: InterviewWSHandler) -> None:
    """仅当 handler 仍持有租约时释放（被顶替的旧连接不得误删新连接）。"""
    async with _registry_lock:
        if _active_handlers.get(handler.session_id) is handler:
            _active_handlers.pop(handler.session_id, None)


def reset_session_registry_for_tests() -> None:
    """测试用：清空会话连接注册表。"""
    _active_handlers.clear()


class _SentenceTTSQueue:
    """串行 TTS 队列：保证句子按到达顺序逐个合成并播放，不与 LLM 流相互阻塞。

    内存治理：队列长度超过 ``_MAX_QUEUE_SIZE`` 时丢弃最早的句子，
    防止 TTS 慢、网络抖动时内存无界增长。
    """

    # 上限：约 3-5 分钟的连续面试内容。超出时优先丢弃已入队的旧句以保证实时性。
    _MAX_QUEUE_SIZE: int = 50

    def __init__(self) -> None:
        # (text, emotion) ；None 为哨兵结束
        self._queue: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._dropped_count = 0
        self._prosody: VoiceProsody = VoiceProsody(voice=settings.tts_voice)
        self._fail_count = 0
        self._on_sent: Any = None

    def set_voice(self, voice: str) -> None:
        """兼容旧调用：仅更新音色，保留现有 rate/pitch。"""
        if voice:
            self._prosody = VoiceProsody(
                voice=voice,
                rate=self._prosody.rate,
                pitch=self._prosody.pitch,
            )

    def set_prosody(self, prosody: VoiceProsody) -> None:
        """绑定本场会话的基线音色与韵律。"""
        self._prosody = prosody

    def set_on_sent(self, callback) -> None:
        """每成功发出一条 tts_audio 时回调（用于等待客户端播完）。"""
        self._on_sent = callback

    async def start(self, send_callback) -> None:
        """启动后台 worker；每个 WS 连接初始化时调用一次。"""
        self._send = send_callback
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        """结束 worker，丢弃未播放的句子。"""
        if self._worker_task is not None and not self._worker_task.done():
            await self._queue.put(None)
            await self._worker_task
        if self._dropped_count:
            logger.info("TTS 队列丢弃 %d 句(超过上限)", self._dropped_count)

    async def enqueue(self, sentence: str, emotion: str | None = None) -> None:
        emo = (emotion or extract_emotion(sentence) or "neutral").strip().lower()
        clean = strip_markers(sentence).strip()
        if not clean:
            return
        # 队列过长时丢弃最早的旧句，避免内存膨胀
        if self._queue.qsize() >= self._MAX_QUEUE_SIZE:
            try:
                self._queue.get_nowait()
                self._queue.task_done()
                self._dropped_count += 1
            except asyncio.QueueEmpty:
                pass
        await self._queue.put((clean, emo))

    async def flush_remainder(self, sentence: str, emotion: str | None = None) -> None:
        """回合结束时把残留 buffer 入队，并等待队列全部处理完。"""
        if sentence.strip():
            await self.enqueue(sentence, emotion=emotion)
        # join：等 worker 对每个 put 调用 task_done，真正排空队列
        await self._queue.join()

    async def _worker(self) -> None:
        while True:
            item = await self._queue.get()
            try:
                if item is None:
                    return
                text, emotion = item
                p = with_emotion(self._prosody, emotion)
                async with self._lock:
                    try:
                        audio_b64 = await synthesize_to_base64(
                            text, p.voice, rate=p.rate, pitch=p.pitch
                        )
                    except Exception as e:
                        self._fail_count += 1
                        logger.error("Edge TTS 失败 voice=%s: %s", p.voice, e)
                        if self._fail_count <= 3:
                            try:
                                await self._send(
                                    "error",
                                    message="语音合成失败，请检查网络或稍后重试（文字面试仍可用）",
                                )
                            except Exception:
                                pass
                        continue
                    if audio_b64:
                        try:
                            await self._send("tts_audio", data=audio_b64, sentence=text)
                            if callable(self._on_sent):
                                self._on_sent()
                        except Exception as e:
                            logger.warning("TTS 发送失败: %s", e)
                    else:
                        try:
                            await self._send(
                                "tts_failed",
                                message="语音合成返回空音频，请检查网络或改用文字作答",
                            )
                        except Exception:
                            pass
            finally:
                self._queue.task_done()


class InterviewWSHandler:
    """管理单个面试 WebSocket 连接的生命周期。"""

    def __init__(
        self,
        websocket: WebSocket,
        session_id: int,
        access_token: str = "",
        *,
        ws_subprotocol: str | None = None,
    ):
        self.ws = websocket
        self.session_id = session_id
        self._client_access_token = (access_token or "").strip()
        # 握手回显用的子协议名（含令牌时须与客户端请求一致）
        self._ws_subprotocol = (ws_subprotocol or "").strip() or None
        self.turn_state = TurnState.IDLE
        self.audio_buffer: list[str] = []
        # 累计已缓冲音频解码字节，避免每 chunk 全量重解码
        self._audio_buffer_bytes: int = 0
        self.orchestrator = InterviewOrchestrator()
        self.agent: InterviewAgent | None = None
        self.llm: LLMClient | None = None
        self.runner: InterviewRunner | None = None
        self.tts_voice = settings.tts_voice
        self._session_prosody: VoiceProsody = VoiceProsody(voice=settings.tts_voice)
        self._whisper_model = settings.whisper_model
        self._tts_queue = _SentenceTTSQueue()
        # 被同 session 新连接顶替时置 True，主循环应尽快退出
        self._superseded = False
        self._last_nudge_at: float = 0.0
        self._stt_fail_streak: int = 0
        self._nudge_cooldown_sec: float = 20.0
        # 客户端播完 TTS 后再开麦；超时兜底防卡死
        self._playback_done = asyncio.Event()
        self._tts_sent_this_turn = False
        # 主循环已能并行收包后，正常路径靠客户端 done；超时仅兜底
        self._playback_wait_timeout_sec: float = 45.0
        # 播放握手世代：重连/新回合递增，避免旧 done 误放行或丢信号后卡麦
        self._playback_generation: int = 0
        self._awaiting_playback_gen: int = 0
        self._closing: bool = False
        # 防止 create_task 回合重入；提纲 debounce；报告后台任务
        self._turn_busy: bool = False
        self._hint_inflight: str | None = None
        self._report_task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # 传输层工具
    # ------------------------------------------------------------------

    async def send(self, msg_type: str, **payload: Any) -> None:
        await self.ws.send_json({"type": msg_type, **payload})

    async def _tts_send(self, msg_type: str, **payload: Any) -> None:
        """TTS 通道发送：附带 playback_generation 供客户端回传。"""
        if msg_type == "tts_audio":
            payload.setdefault("playback_generation", self._awaiting_playback_gen)
        await self.send(msg_type, **payload)

    async def set_turn(self, state: TurnState) -> None:
        self.turn_state = state
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
            self.agent = InterviewAgent(session, self.llm)

            # 企业知识库 RAG（若 LLM 未配置 key 则降级为 None）
            rag = None
            if self.llm.api_key:
                try:
                    from app.services.rag.company_rag import CompanyKnowledgeRAG

                    rag = CompanyKnowledgeRAG(self.llm)
                except Exception as e:
                    logger.warning("RAG 实例化失败，继续无 RAG 模式: %s", e)

            self.runner = InterviewRunner(session, self.llm, self.agent, rag=rag)

            row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
            settings_voice = None
            if row:
                if row.tts_voice:
                    settings_voice = row.tts_voice
                    self.tts_voice = row.tts_voice
                self._whisper_model = row.stt_model or settings.whisper_model
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
            self._tts_queue.set_prosody(self._session_prosody)
            self._tts_queue.set_on_sent(self._mark_tts_sent)
            logger.info(
                "TTS 会话绑定 sid=%s avatar=%s voice=%s rate=%s pitch=%s",
                self.session_id,
                getattr(session, "avatar_id", None),
                self._session_prosody.voice,
                self._session_prosody.rate,
                self._session_prosody.pitch,
            )
            # 预热 Whisper，降低首答卡顿（失败可忽略）
            asyncio.create_task(warmup_whisper(self._whisper_model))

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
                await self._tts_queue.stop()
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
            if self._turn_busy or self._closing:
                return
            asyncio.create_task(self._run_user_turn_end(data, db, session))
        elif msg_type == "silence_timeout":
            if self._turn_busy or self._closing:
                return
            asyncio.create_task(self._on_silence_nudge(db, session))
        elif msg_type == "user_text":
            text = data.get("text", "").strip()
            if (
                text
                and self.turn_state == TurnState.USER_SPEAKING
                and not self._turn_busy
                and not self._closing
            ):
                asyncio.create_task(self._run_user_text(text, data, db, session))
        elif msg_type == "request_hint":
            # 不阻塞主循环；与服务端自触发共用 debounce
            asyncio.create_task(self._on_request_hint(data, db, session))
        elif msg_type == "request_finish":
            if self._closing:
                return
            asyncio.create_task(self._on_request_finish(db, session))
        elif msg_type == "tts_playback_done":
            # 仅当世代匹配时放行，防止重连后旧/乱序 done 干扰下一回合
            client_gen = data.get("generation")
            if client_gen is None or client_gen == self._awaiting_playback_gen:
                self._playback_done.set()

    async def _run_user_text(
        self,
        text: str,
        data: dict[str, Any],
        db: Session,
        session: InterviewSession,
    ) -> None:
        if self._turn_busy or self._closing:
            return
        self._turn_busy = True
        try:
            await self.set_turn(TurnState.PROCESSING)
            await self.send("stt_final", text=text)
            await self._process_user_text(text, data, db, session)
        except Exception:
            logger.exception("user_text 回合失败 sid=%s", self.session_id)
            try:
                await self.set_turn(TurnState.USER_SPEAKING)
            except Exception:
                pass
        finally:
            self._turn_busy = False

    async def _run_user_turn_end(
        self,
        data: dict[str, Any],
        db: Session,
        session: InterviewSession,
    ) -> None:
        if self._turn_busy or self._closing:
            return
        self._turn_busy = True
        try:
            await self._on_user_turn_end(data, db, session)
        except Exception:
            logger.exception("user_turn_end 失败 sid=%s", self.session_id)
            try:
                await self.set_turn(TurnState.USER_SPEAKING)
            except Exception:
                pass
        finally:
            self._turn_busy = False

    def _mark_tts_sent(self) -> None:
        self._tts_sent_this_turn = True

    def _begin_playback_wait(self) -> None:
        """新回合开始：提升世代并清空完成信号。"""
        self._playback_generation += 1
        self._awaiting_playback_gen = self._playback_generation
        self._tts_sent_this_turn = False
        self._playback_done.clear()

    async def _wait_client_playback(self) -> None:
        """若本回合发过 TTS，则等待客户端 tts_playback_done（或超时）。"""
        if not self._tts_sent_this_turn:
            return
        wait_gen = self._awaiting_playback_gen
        # 若客户端已提前播完并上报，则不再 clear，直接放行
        if not self._playback_done.is_set():
            try:
                await asyncio.wait_for(
                    self._playback_done.wait(),
                    timeout=self._playback_wait_timeout_sec,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "tts_playback_done 超时 sid=%s gen=%s，继续",
                    self.session_id,
                    wait_gen,
                )
        await asyncio.sleep(0.15)
        # 仅清理本世代等待，避免覆盖更新回合
        if self._awaiting_playback_gen == wait_gen:
            self._tts_sent_this_turn = False
            self._playback_done.clear()

    async def _open_mic_after_playback(self) -> None:
        """服务端合成发完后，等客户端播完（或超时）再切 USER_SPEAKING，防回采。"""
        await self._wait_client_playback()
        await self.set_turn(TurnState.USER_SPEAKING)

    async def _on_user_turn_end(
        self, data: dict[str, Any], db: Session, session: InterviewSession
    ) -> None:
        if self.turn_state == TurnState.PROCESSING:
            return
        await self.set_turn(TurnState.PROCESSING)

        # 优先浏览器 STT 文本，Whisper 仅作兜底
        text = (data.get("text") or "").strip()
        pcm_b64 = data.get("pcm") or data.get("data") or ""
        stt_failed = False
        if text:
            await self.send("stt_final", text=text)
        elif pcm_b64:
            text = await transcribe_pcm_base64_async(
                pcm_b64, model_size=self._whisper_model
            )
            if text:
                await self.send("stt_final", text=text)
            else:
                stt_failed = True
        elif self.audio_buffer:
            pcm = "".join(self.audio_buffer)
            self.audio_buffer = []
            self._audio_buffer_bytes = 0
            text = await transcribe_pcm_base64_async(pcm, model_size=self._whisper_model)
            if text:
                await self.send("stt_final", text=text)
            else:
                stt_failed = True

        if not text:
            self._stt_fail_streak += 1
            await self.send(
                "error",
                message="未能识别语音内容，请重新说话或手动输入",
            )
            await self.set_turn(TurnState.USER_SPEAKING)
            return

        self._stt_fail_streak = 0
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
        # 与 HTTP 一致：超大 base64 会撑爆内存/LLM 账单，丢弃图像并记日志
        if isinstance(image_b64, str) and len(image_b64) > _IMAGE_BASE64_MAX_LEN:
            logger.warning(
                "WS image_base64 超限 sid=%s len=%d，已丢弃",
                self.session_id,
                len(image_b64),
            )
            image_b64 = None
        self.orchestrator.snapshot.last_user_text = text
        self.orchestrator.snapshot.merge_face(face)

        async for event in self.runner.stream_turn(
            text,
            db,
            face=face,
            image_b64=image_b64,
        ):
            yield event

    async def _stream_events_with_tts(
        self,
        events,
        *,
        db: Session | None = None,
        session: InterviewSession | None = None,
        auto_hint: bool = True,
    ) -> StreamEvent | None:
        """按句入队 TTS，并剥离 think；返回最后一个 TURN_COMPLETE/ERROR。"""
        self._begin_playback_wait()
        sentence_buf = ""
        think_filter = ThinkStreamFilter()
        last: StreamEvent | None = None
        turn_emotion = "neutral"
        async for event in events:
            if event.kind == EventKind.TOKEN:
                visible = think_filter.feed(event.token or "")
                if visible:
                    await self.send("assistant_token", token=visible)
                    sentence_buf += visible
                    # 同步捕获句内情绪标记供后续句子使用
                    if "[emotion:" in visible:
                        turn_emotion = extract_emotion(sentence_buf) or turn_emotion
                    if should_flush_sentence_buffer(sentence_buf):
                        await self._tts_queue.enqueue(
                            sentence_buf, emotion=turn_emotion
                        )
                        sentence_buf = ""
            elif event.kind == EventKind.TURN_COMPLETE:
                tail = think_filter.flush()
                if tail:
                    sentence_buf += tail
                    await self.send("assistant_token", token=tail)
                if event.emotion:
                    turn_emotion = event.emotion
                clean = strip_markers(event.content or "")
                await self.send(
                    "assistant_done",
                    content=clean,
                    phase=event.phase_id,
                    is_complete=event.is_complete,
                    emotion=event.emotion,
                    playback_generation=self._awaiting_playback_gen,
                )
                # 服务端自触发提纲，不依赖客户端往返（避免队头阻塞丢 hint）
                if (
                    auto_hint
                    and not event.is_complete
                    and db is not None
                    and session is not None
                    and clean.strip()
                ):
                    asyncio.create_task(
                        self._on_request_hint({"question": clean}, db, session)
                    )
                if sentence_buf.strip():
                    await self._tts_queue.enqueue(
                        sentence_buf, emotion=turn_emotion
                    )
                    sentence_buf = ""
                await self._tts_queue.flush_remainder("", emotion=turn_emotion)
                last = event
            elif event.kind == EventKind.ERROR:
                await self.send("error", message=event.error)
                last = event
        return last

    async def _process_user_text(
        self, text: str, data: dict[str, Any], db: Session, session: InterviewSession
    ) -> None:
        assert self.runner is not None
        await self.set_turn(TurnState.PROCESSING)
        await self.set_turn(TurnState.AI_SPEAKING)

        last = await self._stream_events_with_tts(
            self._consume_runner_turn(text, data, db),
            db=db,
            session=session,
            auto_hint=True,
        )
        if last is None or last.kind == EventKind.ERROR:
            await self._open_mic_after_playback()
            return
        if last.is_complete:
            await self.set_turn(TurnState.IDLE)
            self._schedule_report_generation()
            # 播完等待不阻塞报告
            asyncio.create_task(self._wait_client_playback())
        else:
            await self._open_mic_after_playback()

    async def _on_request_finish(self, db: Session, session: InterviewSession) -> None:
        """候选人主动结束：流式口头致谢与评价，报告异步生成。"""
        if self._closing:
            return
        if session.status == SessionStatus.COMPLETED.value:
            await self.send(
                "assistant_done",
                content="面试已结束，正在生成报告。",
                phase=session.current_phase or "summary",
                is_complete=True,
                emotion="smile",
            )
            self._schedule_report_generation()
            return
        if self.runner is None or self.llm is None:
            await self.send("error", message="面试引擎未就绪，无法收尾")
            return

        self._closing = True
        await self.set_turn(TurnState.PROCESSING)
        await self.set_turn(TurnState.AI_SPEAKING)
        last = await self._stream_events_with_tts(
            self.runner.stream_closing(db),
            db=db,
            session=session,
            auto_hint=False,
        )
        if last is None or last.kind == EventKind.ERROR:
            self._closing = False
            await self._open_mic_after_playback()
            await self.send(
                "error",
                message="收尾发言失败，请重试「结束面试」或检查 LLM 配置",
            )
            return

        await self.set_turn(TurnState.IDLE)
        # 报告与 TTS 收尾并行，不再先等播完
        self._schedule_report_generation()
        asyncio.create_task(self._wait_client_playback())

    def _schedule_report_generation(self) -> None:
        """后台生成报告（独立 DB session），避免阻塞 WS / 重复任务。"""
        if self._report_task is not None and not self._report_task.done():
            return
        if self.llm is None:
            return
        self._report_task = asyncio.create_task(self._generate_report_bg())

    async def _generate_report_bg(self) -> None:
        if self.llm is None:
            return
        db = SessionLocal()
        try:
            session = (
                db.query(InterviewSession)
                .filter(InterviewSession.id == self.session_id)
                .first()
            )
            if not session:
                return
            # 已有报告则跳过
            raw = (session.report or "").strip()
            if session.status == SessionStatus.COMPLETED.value and raw and raw != "{}":
                return
            await generate_and_persist_report(session, self.llm, db)
        except Exception as e:
            logger.exception(
                "后台报告生成失败 sid=%s: %s", self.session_id, e
            )
            try:
                await self.send(
                    "error",
                    message="口头收尾已完成，但报告生成失败，请稍后在报告页重试",
                )
            except Exception:
                pass
        finally:
            try:
                db.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # runner 事件 → 前端 WS 事件（仅非流式路径保留；主流式走 _stream_events_with_tts）
    # ------------------------------------------------------------------

    async def _dispatch_event(self, event: StreamEvent) -> None:
        if event.kind == EventKind.TOKEN:
            await self.send("assistant_token", token=event.token)
        elif event.kind == EventKind.TURN_COMPLETE:
            await self.send(
                "assistant_done",
                content=strip_markers(event.content or ""),
                phase=event.phase_id,
                is_complete=event.is_complete,
                emotion=event.emotion,
            )
        elif event.kind == EventKind.ERROR:
            await self.send("error", message=event.error)

    # ------------------------------------------------------------------
    # 参考提纲
    # ------------------------------------------------------------------

    _HINT_TIMEOUT_SEC: float = 20.0
    _HINT_CTX_CHARS: int = 1200

    async def _on_request_hint(self, data: dict[str, Any], db: Session, session: InterviewSession) -> None:
        question = strip_think_blocks((data.get("question") or "").strip())
        question = strip_markers(question)
        # 只取末段提问，避免把整段面试官独白塞进二次 LLM
        question = self._extract_hint_question(question)
        if not question or not self.llm:
            await self.send(
                "reference_hint",
                question=question or "",
                content="暂时无法生成参考回答，请根据你的实际经历组织语言。",
            )
            return
        # debounce：同题进行中则跳过（服务端自触发 + 客户端 request_hint 双打）
        key = question[:200]
        if self._hint_inflight == key:
            return
        self._hint_inflight = key
        try:
            await self.send("reference_hint_loading", question=question)
            try:
                hint = await asyncio.wait_for(
                    self._generate_reference_hint(question, db, session),
                    timeout=self._HINT_TIMEOUT_SEC,
                )
            except asyncio.TimeoutError:
                logger.warning("参考提纲超时 sid=%s", self.session_id)
                hint = "生成超时。可先按 STAR 结构自拟要点：情境 → 任务 → 行动 → 结果（尽量带量化）。"
            except Exception as e:
                logger.warning("参考提纲异常 sid=%s: %s", self.session_id, e)
                hint = "暂时无法生成参考回答，请根据你的实际经历组织语言。"
            hint = strip_markers(strip_think_blocks(hint or ""))
            if not hint.strip():
                hint = "暂时无法生成参考回答，请根据你的实际经历组织语言。"
            await self.send("reference_hint", question=question, content=hint)
        finally:
            if self._hint_inflight == key:
                self._hint_inflight = None

    @staticmethod
    def _extract_hint_question(text: str) -> str:
        """从面试官整段回复中提取末尾提问，控制二次 LLM 输入体积。"""
        t = (text or "").strip()
        if not t:
            return ""
        # 按空行分段，优先最后一段；否则整段截断
        parts = [p.strip() for p in t.split("\n") if p.strip()]
        if not parts:
            return t[:500]
        # 自末尾向前找含问号的句子所在行
        for line in reversed(parts):
            if any(q in line for q in ("?", "？", "吗", "呢", "请", "介绍", "聊聊", "说说")):
                return line[:500]
        return parts[-1][:500]

    async def _generate_reference_hint(
        self, question: str, db: Session, session: InterviewSession
    ) -> str:
        assert self.llm and self.agent
        system_ctx = ""
        for m in self.agent.messages:
            if m.get("role") == "system":
                system_ctx = str(m.get("content", ""))[: self._HINT_CTX_CHARS]
                break
        from app.core.prompts import with_agent_output_rules

        messages = [
            {
                "role": "system",
                "content": with_agent_output_rules(
                    "你是面试辅导助手。根据候选人背景，为面试官的问题生成简洁参考回答提纲。\n"
                    "要求：3-5 个要点，每点一行，以「•」开头；结合简历具体经历；不要冗长；"
                    "不要替候选人捏造未提及的项目细节；不要输出思考过程或 <think> 标签。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"候选人背景摘要：\n{system_ctx or '（暂无详细档案）'}\n\n"
                    f"面试官问题：{question}\n\n请给出参考回答提纲："
                ),
            },
        ]
        try:
            return await self.llm.chat(messages, temperature=0.4, max_tokens=400)
        except Exception as e:
            logger.warning("参考提纲生成失败: %s", e)
            return "暂时无法生成参考回答，请根据你的实际经历组织语言。"

    # ------------------------------------------------------------------
    # 静默追问
    # ------------------------------------------------------------------

    async def _on_silence_nudge(self, db: Session, session: InterviewSession) -> None:
        if self.turn_state != TurnState.USER_SPEAKING:
            return
        now = asyncio.get_event_loop().time()
        cooldown = self._nudge_cooldown_sec
        if self._stt_fail_streak >= 2:
            cooldown = 35.0
        if now - self._last_nudge_at < cooldown:
            return
        self._last_nudge_at = now
        nudge = self.orchestrator.build_silence_nudge(session.personality, session.strictness)
        await self.set_turn(TurnState.PROCESSING)
        await self.send("silence_nudge", content=nudge)
        self._begin_playback_wait()
        await self._speak_one(nudge)
        await self._open_mic_after_playback()

    # ------------------------------------------------------------------
    # TTS（一次性短句静默追问仍使用直发；流式回合 TTS 走 _tts_queue）
    # ------------------------------------------------------------------

    async def _speak_one(self, sentence: str) -> None:
        clean = strip_markers(sentence)
        if not clean:
            return
        base = getattr(self, "_session_prosody", None) or VoiceProsody(voice=self.tts_voice)
        emo = extract_emotion(sentence)
        p = with_emotion(base, emo)
        try:
            audio_b64 = await synthesize_to_base64(
                clean, p.voice, rate=p.rate, pitch=p.pitch
            )
        except Exception as e:
            logger.error("Edge TTS 短句失败: %s", e)
            await self.send(
                "error",
                message="语音合成失败，请检查网络（文字内容仍可用）",
            )
            return
        if audio_b64:
            await self._tts_send("tts_audio", data=audio_b64, sentence=clean)
            self._mark_tts_sent()
        else:
            await self.send(
                "tts_failed",
                message="语音合成返回空音频，请检查网络或改用文字作答",
            )

    # 兼容旧接口，handler 内部不再直接使用
    _clean_reply = staticmethod(strip_markers)