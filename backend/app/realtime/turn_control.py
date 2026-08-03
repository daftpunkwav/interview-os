"""话轮副作用：打断、收尾、静默追问、事件分发（WS mixin）。"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.constants import SessionStatus
from app.database import SessionLocal
from app.models import InterviewSession
from app.realtime.events import TurnState
from app.services.interview.events import EventKind, StreamEvent

logger = logging.getLogger(__name__)


class TurnControlMixin:
    """依赖宿主提供 runner/tts/_spawn/send/_stream_events_with_tts 等。"""

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
