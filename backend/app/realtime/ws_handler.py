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
from app.database import SessionLocal
from app.models import InterviewSession, LLMSettings
from app.realtime.events import TurnState
from app.services.interview.agent import (
    InterviewAgent,
    generate_and_persist_report,
    strip_markers,
)
from app.services.interview.events import EventKind, StreamEvent
from app.services.interview.runner import InterviewRunner
from app.services.llm.client import LLMClient
from app.services.stt.whisper import transcribe_pcm_base64_async
from app.services.tts.edge import synthesize_to_base64

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
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._dropped_count = 0

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

    async def enqueue(self, sentence: str) -> None:
        if not sentence.strip():
            return
        # 队列过长时丢弃最早的旧句，避免内存膨胀
        if self._queue.qsize() >= self._MAX_QUEUE_SIZE:
            try:
                self._queue.get_nowait()
                self._queue.task_done()
                self._dropped_count += 1
            except asyncio.QueueEmpty:
                pass
        await self._queue.put(sentence.strip())

    async def flush_remainder(self, sentence: str) -> None:
        """回合结束时把残留 buffer 入队，并等待队列全部处理完。"""
        if sentence.strip():
            await self.enqueue(sentence)
        # join：等 worker 对每个 put 调用 task_done，真正排空队列
        await self._queue.join()

    async def _worker(self) -> None:
        while True:
            item = await self._queue.get()
            try:
                if item is None:
                    return
                async with self._lock:
                    audio_b64 = await synthesize_to_base64(item, settings.tts_voice)
                    if audio_b64:
                        try:
                            await self._send("tts_audio", data=audio_b64, sentence=item)
                        except Exception as e:
                            logger.warning("TTS 发送失败: %s", e)
            finally:
                self._queue.task_done()


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
        self._tts_queue = _SentenceTTSQueue()
        # 被同 session 新连接顶替时置 True，主循环应尽快退出
        self._superseded = False

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
        # 注入 trace_id 便于按 WS 会话串联日志
        ws_tid = f"ws-{self.session_id}-{uuid.uuid4().hex[:8]}"
        set_trace_id(ws_tid)
        # 单会话单连接：先占租约，再跑业务（新连接踢旧）
        await claim_session_connection(self)
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
            if row:
                if row.tts_voice:
                    self.tts_voice = row.tts_voice
                self._whisper_model = row.stt_model or settings.whisper_model
            else:
                self._whisper_model = settings.whisper_model

            # 状态判断统一走枚举值
            if session.status == SessionStatus.PENDING.value:
                await self._tts_queue.start(self.send)
                await self.set_turn(TurnState.AI_SPEAKING)
                async for event in self._consume_runner_opening(db):
                    await self._dispatch_event(event)
                await self._tts_queue.flush_remainder("")
                await self.set_turn(TurnState.USER_SPEAKING)
            elif session.status == SessionStatus.ACTIVE.value:
                await self._tts_queue.start(self.send)
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
                # 上限保护：先估算累计解码后字节数，超阈拒绝新 chunk 并清空
                # 使用 b64decode 自身的 padding 容错，避免手算 padding
                try:
                    current_bytes = sum(
                        len(base64.b64decode(c, validate=False))
                        for c in self.audio_buffer
                    )
                except Exception:
                    current_bytes = 0
                try:
                    new_bytes = len(base64.b64decode(chunk, validate=False))
                except Exception:
                    new_bytes = 0
                if current_bytes + new_bytes > _AUDIO_BUFFER_MAX_BYTES:
                    logger.warning(
                        "audio_buffer 超上限 session=%s bytes=%s",
                        self.session_id, current_bytes + new_bytes,
                    )
                    await self.send(
                        "error",
                        message="音频缓存超限，请先结束当前回合",
                    )
                    self.audio_buffer = []
                    return
                self.audio_buffer.append(chunk)
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
        stt_failed = False  # 标记服务端 STT 是否失败,避免静默回退
        if not text and pcm_b64:
            text = await transcribe_pcm_base64_async(pcm_b64, model_size=self._whisper_model)
            if text:
                await self.send("stt_final", text=text)
            else:
                stt_failed = True
        elif not text and self.audio_buffer:
            pcm = "".join(self.audio_buffer)
            self.audio_buffer = []
            text = await transcribe_pcm_base64_async(pcm, model_size=self._whisper_model)
            if text:
                await self.send("stt_final", text=text)
            else:
                stt_failed = True

        # Whisper 失败时回退到浏览器 STT 文本
        if not text:
            text = data.get("text", "").strip()
            if text:
                await self.send("stt_final", text=text)

        if not text:
            # 同时存在服务端 STT 失败 + 浏览器未传 text 才视为完全无内容,显式告警前端
            if stt_failed:
                await self.send("error", message="未能识别语音内容，请重新说话或手动输入")
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
                    # 非阻塞入队：让 TTS worker 异步合成与发送，
                    # LLM 流不会被 TTS 网络往返阻塞。
                    await self._tts_queue.enqueue(sentence_buf)
                    sentence_buf = ""
            elif event.kind == EventKind.TURN_COMPLETE:
                if sentence_buf.strip():
                    await self._tts_queue.enqueue(sentence_buf)
                    sentence_buf = ""
                # 等待当前回合所有句子播放完
                await self._tts_queue.flush_remainder("")
                if event.is_complete:
                    await self.set_turn(TurnState.IDLE)
                    # 自然结束时同步生成报告，避免前端跳转报告页 404
                    try:
                        if self.llm is not None:
                            await generate_and_persist_report(session, self.llm, db)
                    except Exception as e:
                        logger.exception(
                            "面试自然结束但报告生成失败 sid=%s: %s",
                            self.session_id,
                            e,
                        )
                        await self.send(
                            "error",
                            message="报告生成失败，请点击「结束面试」重试",
                        )
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
    # TTS（一次性短句静默追问仍使用直发；流式回合 TTS 走 _tts_queue）
    # ------------------------------------------------------------------

    async def _speak_one(self, sentence: str) -> None:
        audio_b64 = await synthesize_to_base64(sentence, self.tts_voice)
        if audio_b64:
            await self.send("tts_audio", data=audio_b64, sentence=sentence)

    # 兼容旧接口，handler 内部不再直接使用
    _clean_reply = staticmethod(strip_markers)