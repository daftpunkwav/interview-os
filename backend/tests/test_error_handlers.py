"""app.core.error_handlers 单元测试：5 个 handler 路由 + envelope/spec 构造器。

覆盖 envelope 构造、retryable 透传、headers 透传、404 -> A0404 映射、
Starlette 与 FastAPI HTTPException 共用 envelope_from_http_exception 等契约。
"""

from __future__ import annotations

import json

import pytest
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import ApiBusinessError, CATALOG
from app.core.error_handlers import (
    on_http_exception,
    on_request_validation,
    on_starlette_http_exception,
    on_unhandled_exception,
)


def _body(resp) -> dict:
    """helper: 解析 JSONResponse body。"""
    return json.loads(resp.body)

def _mock_request() -> Request:
    """构造一个最简 Request，用于 handler 直接调用测试。"""
    from starlette.requests import Request as StarletteRequest
    scope = {"type": "http", "method": "GET", "path": "/x", "headers": []}
    return StarletteRequest(scope)




    spec = CATALOG["A0001"]
    resp = envelope_from_spec(spec)
    assert resp.status_code == 422
    data = _body(resp)
    assert data["error"]["code"] == "A0001"
    assert data["error"]["hint"] == spec.hint
    assert data["error"]["retryable"] == spec.retryable



    spec = CATALOG["A0001"]
    resp = envelope_from_spec(spec, message="自定义文案")
    data = _body(resp)
    assert data["error"]["message"] == "自定义文案"



    spec = CATALOG["A0002"]
    resp = envelope_from_spec(spec, extra_headers={"Retry-After": "60", "X-Custom": "v"})
    assert resp.headers["Retry-After"] == "60"
    assert resp.headers["X-Custom"] == "v"



    resp = envelope_from_status(500, "内部错误")
    assert resp.status_code == 500
    data = _body(resp)
    assert data["error"]["code"] == "http_500"
    assert data["error"]["message"] == "内部错误"



    resp = envelope_from_status(429, "限流", code_override="A0002")
    data = _body(resp)
    assert data["error"]["code"] == "A0002"


@pytest.mark.asyncio
async def test_on_http_exception_api_business_error() -> None:
    """ApiBusinessError 用业务码 + spec hint/retryable。"""
    spec = CATALOG["C0001"]
    exc = ApiBusinessError(spec, message="LLM 不可用")
    resp = await on_http_exception(None, exc)  # type: ignore[arg-type]
    assert resp.status_code == 502
    data = _body(resp)
    assert data["error"]["code"] == "C0001"
    assert data["error"]["retryable"] is True


@pytest.mark.asyncio
async def test_on_http_exception_plain_fallback() -> None:
    """普通 HTTPException 无 error_code -> http_{status} 兜底。"""
    exc = HTTPException(status_code=400, detail="bad request")
    resp = await on_http_exception(None, exc)  # type: ignore[arg-type]
    assert resp.status_code == 400
    data = _body(resp)
    assert data["error"]["code"] == "http_400"
    assert data["error"]["message"] == "bad request"


@pytest.mark.asyncio
async def test_on_http_exception_propagates_retry_after() -> None:
    """HTTPException.headers（如 Retry-After）透传到响应头。"""
    exc = HTTPException(status_code=429, detail="rate", headers={"Retry-After": "60"})
    resp = await on_http_exception(None, exc)  # type: ignore[arg-type]
    assert resp.headers["Retry-After"] == "60"


@pytest.mark.asyncio
async def test_on_starlette_http_exception_404_maps_to_A0404() -> None:
    """Starlette 抛 404 -> A0404（业务语义"资源不存在"）。"""
    exc = StarletteHTTPException(status_code=404, detail="Not Found")
    resp = await on_starlette_http_exception(None, exc)  # type: ignore[arg-type]
    assert resp.status_code == 404
    data = _body(resp)
    assert data["error"]["code"] == "A0404"
    assert data["error"]["hint"] == CATALOG["A0404"].hint


@pytest.mark.asyncio
async def test_on_starlette_http_exception_other_status() -> None:
    """非 404 走 http_{status} 兜底。"""
    exc = StarletteHTTPException(status_code=405, detail="Method Not Allowed")
    resp = await on_starlette_http_exception(None, exc)  # type: ignore[arg-type]
    assert resp.status_code == 405
    data = _body(resp)
    assert data["error"]["code"] == "http_405"
    assert data["error"]["message"] == "Method Not Allowed"


@pytest.mark.asyncio
async def test_on_starlette_http_exception_propagates_allow() -> None:
    """Starlette 405 自带的 Allow 头透传。"""
    exc = StarletteHTTPException(
        status_code=405, detail="Method Not Allowed", headers={"Allow": "GET"}
    )
    resp = await on_starlette_http_exception(None, exc)  # type: ignore[arg-type]
    assert resp.headers["Allow"] == "GET"


@pytest.mark.asyncio
async def test_on_request_validation_uses_A0001() -> None:
    exc = RequestValidationError(errors=[])
    req = _mock_request()
    resp = await on_request_validation(req, exc)
    assert resp.status_code == 422
    data = _body(resp)
    assert data["error"]["code"] == "A0001"


@pytest.mark.asyncio
async def test_on_unhandled_exception_falls_back_to_B0001() -> None:
    req = _mock_request()
    resp = await on_unhandled_exception(req, RuntimeError("boom"))
    assert resp.status_code == 500
    data = _body(resp)
    assert data["error"]["code"] == "B0001"
    assert data["error"]["retryable"] is True
