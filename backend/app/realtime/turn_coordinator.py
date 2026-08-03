"""回合协调（WS mixin）：话轮锁、候选人回合、打断、静默追问。"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.constants import SessionStatus
from app.database import SessionLocal
from app.models import InterviewSession
from app.realtime.events import TurnState
from app.services.interview.agent import ThinkStreamFilter, strip_markers
from app.services.interview.events import EventKind, StreamEvent
from app.services.stt import transcribe_utterance_result
from app.services.tts.edge import (
    extract_emotion,
    next_soft_min,
    should_flush_sentence_buffer,
)
from app.realtime.voice_pipeline import _is_echo_of_assistant, _pick_stt_text

logger = logging.getLogger(__name__)

# 与 ws_handler 常量对齐（由 facade 再导出）
_AUDIO_BUFFER_MAX_BYTES: int = 5 * 1024 * 1024
_IMAGE_BASE64_MAX_LEN: int = 300_000


class TurnCoordinatorMixin:
    """依赖宿主提供 runner/agent/orchestrator/tts/_spawn/send 等。"""

    def _can_start_user_turn(self) -> bool:
        """是否允许启动新的候选人回合（含打断后接棒）。"""
        if self._closing:
            return False
        if not self._turn_busy:
            return True
        # 旧回合已被 barge invalidate，允许新 user_turn_end 接棒
        return self._busy_epoch != self._stream_epoch

    def _begin_user_turn(self) -> int | None:
        """占用回合锁并绑定当前 epoch；不可启动时返回 None。"""
        if not self._can_start_user_turn():
            return None
        epoch = self._stream_epoch
        self._turn_busy = True
        self._busy_epoch = epoch
        return epoch

    def _end_user_turn(self, epoch: int) -> None:
        """仅当仍是本回合占用时释放锁。"""
        if self._busy_epoch == epoch:
            self._turn_busy = False

    # ------------------------------------------------------------------
    # 传输层工具
    async def _run_user_text(
        self,
        text: str,
        data: dict[str, Any],
    ) -> None:
        epoch = self._begin_user_turn()
        if epoch is None:
            return
        db = SessionLocal()
        try:
            session = self._load_session(db)
            if not session:
                return
            await self.set_turn(TurnState.PROCESSING)
            await self.send("stt_final", text=text)
            await self._process_user_text(text, data, db, session)
        except Exception:
            logger.exception("user_text 回合失败 sid=%s", self.session_id)
            try:
                if epoch == self._stream_epoch:
                    await self.set_turn(TurnState.USER_SPEAKING)
            except Exception:
                pass
        finally:
            self._end_user_turn(epoch)
            try:
                db.close()
            except Exception:
                pass

    async def _run_user_turn_end(
        self,
        data: dict[str, Any],
    ) -> None:
        epoch = self._begin_user_turn()
        if epoch is None:
            return
        db = SessionLocal()
        try:
            session = self._load_session(db)
            if not session:
                return
            await self._on_user_turn_end(data, db, session)
        except Exception:
            logger.exception("user_turn_end 失败 sid=%s", self.session_id)
            try:
                if epoch == self._stream_epoch:
                    await self.set_turn(TurnState.USER_SPEAKING)
            except Exception:
                pass
        finally:
            self._end_user_turn(epoch)
            try:
                db.close()
            except Exception:
                pass

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
        wait_epoch = self._stream_epoch
        await self._wait_client_playback()
        # 打断后勿抢麦：epoch 已变或话轮已是候选人
        if wait_epoch != self._stream_epoch:
            return
        if self.turn_state == TurnState.USER_SPEAKING:
            return
        await self.set_turn(TurnState.USER_SPEAKING)

    async def _on_user_turn_end(
        self, data: dict[str, Any], db: Session, session: InterviewSession
    ) -> None:
        if self.turn_state == TurnState.PROCESSING:
            return
        # AI 发言中拒绝提交，防止回采在打断前被当成候选人作答
        if self.turn_state == TurnState.AI_SPEAKING:
            logger.info("忽略 AI_SPEAKING 期间的 user_turn_end sid=%s", self.session_id)
            return
        await self.set_turn(TurnState.PROCESSING)

        # 浏览器 STT 仅作预览；有 PCM 时始终跑云端 ASR（失败回退本地 Whisper）
        browser_text = (data.get("text") or "").strip()
        pcm_b64 = data.get("pcm") or data.get("data") or ""
        if isinstance(pcm_b64, str) and len(pcm_b64) > _AUDIO_BUFFER_MAX_BYTES:
            logger.warning(
                "user_turn_end pcm 超限 sid=%s len=%d",
                self.session_id,
                len(pcm_b64),
            )
            await self.send(
                "error",
                message="音频过大，请分段说话或改用文字输入",
            )
            await self.set_turn(TurnState.USER_SPEAKING)
            return

        asr_text = ""
        if pcm_b64:
            raw_sr = data.get("sample_rate") or 16000
            try:
                sample_rate = int(raw_sr)
            except (TypeError, ValueError):
                sample_rate = 16000
            if sample_rate < 8000 or sample_rate > 96000:
                sample_rate = 16000
            stt_result = await transcribe_utterance_result(
                pcm_b64,
                sample_rate=sample_rate,
                creds=self._stt_creds,
            )
            asr_text = stt_result.text
            if stt_result.fallback:
                await self.send(
                    "info",
                    message=(
                        f"识别已回退到 {stt_result.provider}"
                        + (
                            f"（原配置 {stt_result.requested_provider}）"
                            if stt_result.requested_provider
                            else ""
                        )
                    ),
                    fallback=True,
                    provider=stt_result.provider,
                    requested_provider=stt_result.requested_provider,
                )
        elif self.audio_buffer and not browser_text:
            pcm = "".join(self.audio_buffer)
            self.audio_buffer = []
            self._audio_buffer_bytes = 0
            if len(pcm) > _AUDIO_BUFFER_MAX_BYTES:
                await self.send(
                    "error",
                    message="音频过大，请分段说话或改用文字输入",
                )
                await self.set_turn(TurnState.USER_SPEAKING)
                return
            stt_result = await transcribe_utterance_result(
                pcm,
                creds=self._stt_creds,
            )
            asr_text = stt_result.text
            if stt_result.fallback:
                await self.send(
                    "info",
                    message=f"识别已回退到 {stt_result.provider}",
                    fallback=True,
                    provider=stt_result.provider,
                )
        elif self.audio_buffer:
            # 已有浏览器文本时仍清空缓冲，避免下次串音
            self.audio_buffer = []
            self._audio_buffer_bytes = 0

        text = _pick_stt_text(browser_text, asr_text)
        if text:
            # 服务端兜底：丢弃与上一句面试官高度相似的回采
            last_assistant = ""
            if self.agent and self.agent.messages:
                for m in reversed(self.agent.messages):
                    role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else None)
                    content = getattr(m, "content", None) or (
                        m.get("content") if isinstance(m, dict) else None
                    )
                    if role == "assistant" and content:
                        last_assistant = str(content)
                        break
            if last_assistant and _is_echo_of_assistant(text, last_assistant):
                logger.warning(
                    "丢弃疑似回采 sid=%s text=%s",
                    self.session_id,
                    text[:80],
                )
                await self.send(
                    "error",
                    message="检测到可能误采了面试官声音，请再说一遍或打字作答",
                )
                await self.set_turn(TurnState.USER_SPEAKING)
                return
            await self.send("stt_final", text=text)
        else:
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
        epoch = self._stream_epoch
        soft_min, self._tts_soft_idx = next_soft_min(self._tts_soft_idx)
        async for event in events:
            if epoch != self._stream_epoch:
                # 候选人打断：停止消费本轮 LLM/TTS
                return None
            if event.kind == EventKind.TOKEN:
                visible = think_filter.feed(event.token or "")
                if visible:
                    await self.send("assistant_token", token=visible)
                    sentence_buf += visible
                    # 同步捕获句内情绪标记供后续句子使用
                    if "[emotion:" in visible:
                        turn_emotion = extract_emotion(sentence_buf) or turn_emotion
                    if should_flush_sentence_buffer(sentence_buf, soft_min=soft_min):
                        if epoch != self._stream_epoch:
                            return None
                        await self._tts_queue.enqueue(
                            sentence_buf, emotion=turn_emotion
                        )
                        sentence_buf = ""
                        soft_min, self._tts_soft_idx = next_soft_min(self._tts_soft_idx)
            elif event.kind == EventKind.TURN_COMPLETE:
                if epoch != self._stream_epoch:
                    return None
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
                if event.phase_id:
                    await self.send("phase_changed", phase=event.phase_id)
                # 服务端自触发提纲，不依赖客户端往返（避免队头阻塞丢 hint）
                if (
                    auto_hint
                    and not event.is_complete
                    and clean.strip()
                ):
                    self._spawn(self._on_request_hint({"question": clean}))
                if epoch != self._stream_epoch:
                    return None
                if sentence_buf.strip():
                    await self._tts_queue.enqueue(
                        sentence_buf, emotion=turn_emotion
                    )
                    sentence_buf = ""
                if epoch != self._stream_epoch:
                    return None
                await self._tts_queue.flush_remainder("", emotion=turn_emotion)
                if epoch != self._stream_epoch:
                    return None
                last = event
            elif event.kind == EventKind.ERROR:
                await self.send("error", message=event.error)
                last = event
        if epoch != self._stream_epoch:
            return None
        return last

    def _persist_interrupt_stats(self, session: InterviewSession, db: Session) -> None:
        """把打断计数写入 agent_state，供报告礼貌分使用。"""
        try:
            state = json.loads(session.agent_state or "{}")
            if not isinstance(state, dict):
                state = {}
            state["candidate_interrupts"] = self._candidate_interrupts
            state["ai_interrupts"] = self._ai_interrupts
            session.agent_state = json.dumps(state, ensure_ascii=False)
            db.add(session)
            db.commit()
        except Exception:
            logger.exception("持久化打断统计失败 sid=%s", self.session_id)
            try:
                db.rollback()
            except Exception:
                pass

    async def _on_candidate_barge_in(self) -> None:
        """候选人打断面试官播报：清空 TTS、放开话轮。"""
        if self.turn_state not in (TurnState.AI_SPEAKING, TurnState.PROCESSING):
            return
        self._candidate_interrupts += 1
        self._stream_epoch += 1
        # 提升播放世代，使客户端丢弃旧 tts_audio；不盲清 _turn_busy
        self._playback_generation += 1
        self._awaiting_playback_gen = self._playback_generation
        await self._tts_queue.clear()
        self._tts_sent_this_turn = False
        self._playback_done.set()
        # 清空可能已缓冲的回采音频
        self.audio_buffer = []
        self._audio_buffer_bytes = 0
        await self.send(
            "tts_interrupted",
            reason="candidate_barge",
            candidate_interrupts=self._candidate_interrupts,
            playback_generation=self._awaiting_playback_gen,
        )
        db = SessionLocal()
        try:
            session = self._load_session(db)
            if session:
                self._persist_interrupt_stats(session, db)
        finally:
            try:
                db.close()
            except Exception:
                pass
        # 不盲清 _turn_busy：旧回合 finally 按 epoch 释放；新 user_turn_end 可接棒
        await self.set_turn(TurnState.USER_SPEAKING)
        logger.info(
            "候选人打断 sid=%s count=%s epoch=%s",
            self.session_id,
            self._candidate_interrupts,
            self._stream_epoch,
        )

    async def _process_user_text(
        self, text: str, data: dict[str, Any], db: Session, session: InterviewSession
    ) -> None:
        assert self.runner is not None
        start_epoch = self._stream_epoch
        await self.set_turn(TurnState.PROCESSING)
        await self.set_turn(TurnState.AI_SPEAKING)

        last = await self._stream_events_with_tts(
            self._consume_runner_turn(text, data, db),
            db=db,
            session=session,
            auto_hint=True,
        )
        # 已被候选人打断：话轮已在 barge 处理里放开，勿再次抢麦
        if start_epoch != self._stream_epoch:
            return
        if self.turn_state == TurnState.USER_SPEAKING:
            return
        if last is None or last.kind == EventKind.ERROR:
            await self._open_mic_after_playback()
            return
        if last.is_complete:
            await self.set_turn(TurnState.IDLE)
            self._schedule_report_generation()
            # 播完等待不阻塞报告
            self._spawn(self._wait_client_playback())
        else:
            await self._open_mic_after_playback()

    async def _on_request_finish(self) -> None:
        """候选人主动结束：流式口头致谢与评价，报告异步生成。"""
        if self._closing:
            return
        db = SessionLocal()
        try:
            session = self._load_session(db)
            if not session:
                await self.send("error", message="面试会话不存在")
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
            self._spawn(self._wait_client_playback())
        finally:
            try:
                db.close()
            except Exception:
                pass

    async def _dispatch_event(self, event: StreamEvent) -> None:
        if event.kind == EventKind.TOKEN:
            await self.send("assistant_token", token=event.token)
        elif event.kind == EventKind.TURN_COMPLETE:
            if event.phase_id:
                await self.send("phase_changed", phase=event.phase_id)
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
    # 静默追问
    # ------------------------------------------------------------------

    async def _on_silence_nudge(self) -> None:
        if self.turn_state != TurnState.USER_SPEAKING:
            return
        now = asyncio.get_event_loop().time()
        # 刚开麦宽限期内忽略，避免开场后立刻模板追问
        if self._mic_opened_at and now - self._mic_opened_at < self._nudge_grace_sec:
            return
        cooldown = self._nudge_cooldown_sec
        if self._stt_fail_streak >= 2:
            cooldown = 45.0
        if now - self._last_nudge_at < cooldown:
            return
        self._last_nudge_at = now
        self._ai_interrupts += 1
        db = SessionLocal()
        try:
            session = self._load_session(db)
            if not session:
                return
            self._persist_interrupt_stats(session, db)
            nudge = self.orchestrator.build_silence_nudge(
                session.personality,
                session.strictness,
                phase=session.current_phase,
            )
            await self.set_turn(TurnState.PROCESSING)
            await self.send(
                "silence_nudge",
                content=nudge,
                ai_interrupts=self._ai_interrupts,
            )
            self._begin_playback_wait()
            await self._speak_one(nudge)
            await self._open_mic_after_playback()
        finally:
            try:
                db.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # TTS（一次性短句静默追问仍使用直发；流式回合 TTS 走 _tts_queue）
    # ------------------------------------------------------------------
