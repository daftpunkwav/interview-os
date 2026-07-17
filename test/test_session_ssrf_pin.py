"""会话修复：SSRF DNS pin（pin_safe_http_url + PinnedHostTransport）。"""

from __future__ import annotations

import ipaddress

import httpx
import pytest

from app.core.security import (
    PinnedHostTransport,
    UnsafeURLError,
    pin_safe_http_url,
)


def test_pin_rejects_loopback_without_allow_local() -> None:
    with pytest.raises(UnsafeURLError):
        pin_safe_http_url("http://127.0.0.1:11434/v1", allow_local=False)


def test_pin_allows_loopback_with_allow_local() -> None:
    t = pin_safe_http_url("http://127.0.0.1:11434/v1", allow_local=True)
    assert t.pinned_ip == "127.0.0.1"
    assert t.hostname == "127.0.0.1"


def test_pin_public_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.core.security._resolve_all",
        lambda host: [ipaddress.ip_address("93.184.216.34")],
    )
    t = pin_safe_http_url("https://example.com/v1", allow_local=False)
    assert t.hostname == "example.com"
    assert t.pinned_ip == "93.184.216.34"


@pytest.mark.asyncio
async def test_transport_rewrites_host_to_pinned_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    class _Inner(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            captured["host"] = request.url.host
            captured["header_host"] = request.headers.get("host")
            captured["sni"] = (request.extensions or {}).get("sni_hostname")
            return httpx.Response(200, json={"ok": True}, request=request)

    import app.core.security as sec

    monkeypatch.setattr(sec.httpx, "AsyncHTTPTransport", lambda **kw: _Inner())
    transport = PinnedHostTransport(hostname="api.example.com", pinned_ip="1.2.3.4")
    async with httpx.AsyncClient(transport=transport) as client:
        resp = await client.get("https://api.example.com/v1/models")
    assert resp.status_code == 200
    assert captured["host"] == "1.2.3.4"
    assert captured["header_host"] == "api.example.com"
    assert captured["sni"] == "api.example.com"
