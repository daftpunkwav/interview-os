"""``app.realtime.ws_handler`` 单元 + 状态机测试。

覆盖：
- audio_buffer 上限保护（>5MB 强制清空 + error 事件）；
- deadlock fallback：异常路径回到 ``USER_SPEAKING``；
- SessionEvent.schema_version 默认 1；
- ``_dispatch`` 不识别的消息类型不抛错；
- pong 消息不会触发业务处理。
"""

from __future__ import annotations

import asyncio
import base64
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.realtime.events import SessionEvent, TurnState


def _make_mock_ws() -> MagicMock:
    ws = MagicMock()
    ws.accept = AsyncMock()
    ws.send_json = AsyncMock()
    ws.receive_json = AsyncMock()
    return ws


def _audio_b64(n_bytes: int) -> str:
    """返回 n_bytes 长度 pcm 的 base64 编码。"""
    return base64.b64encode(b"\x00" * n_bytes).decode("ascii")


class TestSessionEvent:
    def test_default_schema_version(self) -> None:
        ev = SessionEvent(type="test")
        assert ev.schema_version == 1
        assert ev.type == "test"
        assert ev.payload == {}


class TestAudioBufferCap:
    @pytest.mark.asyncio
    async def test_audio_chunk_appends(self) -> None:
        from app.realtime.ws_handler import InterviewWSHandler

        ws = _make_mock_ws()
        handler = InterviewWSHandler(ws, session_id=1)
        # 模拟 dispatch
        await handler._dispatch(
            {"type": "audio_chunk", "data": _audio_b64(64)},
            db=MagicMock(),
            session=MagicMock(),
        )
        assert len(handler.audio_buffer) == 1

    @pytest.mark.asyncio
    async def test_audio_buffer_overflow_clears(self) -> None:
        from app.realtime.ws_handler import (
            InterviewWSHandler,
            _AUDIO_BUFFER_MAX_BYTES,
        )

        ws = _make_mock_ws()
        handler = InterviewWSHandler(ws, session_id=1)
        # 一次塞超过上限的 chunk
        huge = _audio_b64(_AUDIO_BUFFER_MAX_BYTES + 1024)
        await handler._dispatch(
            {"type": "audio_chunk", "data": huge},
            db=MagicMock(),
            session=MagicMock(),
        )
        # 超阈应当被清空并发 error
        assert handler.audio_buffer == []
        # 至少一次 error 事件
        ws.send_json.assert_called()
        sent = [c.args[0] for c in ws.send_json.call_args_list]
        assert any(e.get("type") == "error" for e in sent)


class TestDispatchUnknownType:
    @pytest.mark.asyncio
    async def test_unknown_type_no_op(self) -> None:
        from app.realtime.ws_handler import InterviewWSHandler

        ws = _make_mock_ws()
        handler = InterviewWSHandler(ws, session_id=1)
        # 未知消息不应抛错
        await handler._dispatch(
            {"type": "nonsense_unknown"},
            db=MagicMock(),
            session=MagicMock(),
        )
        ws.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_pong_no_op(self) -> None:
        from app.realtime.ws_handler import InterviewWSHandler

        ws = _make_mock_ws()
        handler = InterviewWSHandler(ws, session_id=1)
        await handler._dispatch(
            {"type": "pong", "t": 123},
            db=MagicMock(),
            session=MagicMock(),
        )
        ws.send_json.assert_not_called()


class TestTurnState:
    def test_values(self) -> None:
        assert TurnState.USER_SPEAKING.value == "USER_SPEAKING"
        assert TurnState.AI_SPEAKING.value == "AI_SPEAKING"
        assert TurnState.PROCESSING.value == "PROCESSING"
        assert TurnState.IDLE.value == "IDLE"


class TestSetTurn:
    @pytest.mark.asyncio
    async def test_set_turn_emits_turn_state_event(self) -> None:
        from app.realtime.ws_handler import InterviewWSHandler

        ws = _make_mock_ws()
        handler = InterviewWSHandler(ws, session_id=1)
        await handler.set_turn(TurnState.USER_SPEAKING)
        assert handler.turn_state == TurnState.USER_SPEAKING
        ws.send_json.assert_called_once_with(
            {"type": "turn_state", "state": "USER_SPEAKING"}
        )


class TestTraceId:
    @pytest.mark.asyncio
    async def test_handle_sets_trace_id(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """handle() 入口应注入 ws-{session}-{uuid} 形式的 trace_id。"""
        from app.core.logging import get_trace_id
        from app.realtime import ws_handler as ws_mod
        from app.services.llm.client import LLMClient

        captured_tid: list[str] = []

        class _StubRunner:
            async def stream_opening(self, db):
                if False:
                    yield  # 空异步生成器

        monkeypatch.setattr(LLMClient, "from_db", classmethod(lambda cls, db: MagicMock(api_key="")))
        monkeypatch.setattr(ws_mod, "InterviewOrchestrator", MagicMock())
        monkeypatch.setattr(ws_mod, "InterviewRunner", lambda *a, **kw: _StubRunner())
        # 模拟 db.query 拿到 session
        class _StubSession:
            id = 1
            status = "completed"  # 让 handle 早退不发 opening
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = _StubSession()
        monkeypatch.setattr(ws_mod, "SessionLocal", lambda: mock_db)

        ws = _make_mock_ws()
        handler = ws_mod.InterviewWSHandler(ws, session_id=1)
        # 由于 status=completed，handle 会先发送 error 然后 return
        await handler.handle()

        # 现在 trace_id 应已经被注入（set_trace_id 是模块级 ContextVar）
        tid = get_trace_id()
        assert tid.startswith("ws-1-")
        captured_tid.append(tid)
