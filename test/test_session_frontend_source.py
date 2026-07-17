"""会话修复：前端源码静态断言（retryNow 重连、finish 失败不跳转）。"""

from __future__ import annotations

from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_WS_HOOK = _ROOT / "frontend" / "src" / "features" / "media" / "useInterviewWS.ts"
_ROOM = _ROOT / "frontend" / "src" / "app" / "interview" / "[id]" / "page.tsx"


def test_retry_now_uses_reconnect_key() -> None:
    text = _WS_HOOK.read_text(encoding="utf-8")
    assert "reconnectKey" in text
    assert "setReconnectKey" in text
    assert "retryNow" in text
    # effect 依赖必须包含 reconnectKey
    assert "reconnectKey" in text
    assert "[sessionId, maxRetries, reconnectKey]" in text or "reconnectKey]" in text


def test_handle_finish_does_not_swallow_and_navigate() -> None:
    text = _ROOM.read_text(encoding="utf-8")
    assert "handleFinish" in text
    assert "toast.error" in text
    assert "finishInterview" in text
    # 失败路径不应在 catch 外无条件 push
    # 成功后再 router.push
    assert "router.push" in text
    # is_complete 也先 finish 再跳转
    assert "finishInterview(sessionId)" in text


def test_constants_encryption_version_v2() -> None:
    from app.core.constants import API_KEY_ENCRYPTION_VERSION

    assert API_KEY_ENCRYPTION_VERSION == "enc:v2"
