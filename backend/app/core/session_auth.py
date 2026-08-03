"""会话能力令牌（capability token）。

本地优先产品不引入多用户登录；对可变操作（WS / start / message / finish /
messages / reports / prep）要求创建时下发的 ``access_token``，防止仅凭整数
session_id 劫持。
"""

from __future__ import annotations

import secrets
from typing import Any, Protocol

from fastapi import Header, HTTPException, Query, WebSocket

HEADER_NAME = "X-Interview-Token"
# WebSocket 子协议前缀：interviewos.<token>（token 已为 url-safe）
WS_SUBPROTOCOL_PREFIX = "interviewos."


class HasAccessToken(Protocol):
    access_token: Any


def new_access_token() -> str:
    """生成会话能力令牌（url-safe，约 32 字节熵）。"""
    return secrets.token_urlsafe(32)


def tokens_match(expected: str | None, provided: str | None) -> bool:
    """常量时间比较；任一侧为空则拒绝。"""
    exp = (expected or "").strip()
    got = (provided or "").strip()
    if not exp or not got:
        return False
    if len(exp) != len(got):
        # compare_digest 要求等长；长度不等直接拒绝（仍避免短路泄漏具体内容）
        secrets.compare_digest(exp, exp)
        return False
    return secrets.compare_digest(exp, got)


def assert_session_token(
    session: HasAccessToken,
    provided: str | None,
    *,
    detail: str = "无权访问该面试会话",
) -> None:
    """校验失败抛 403。"""
    if not tokens_match(getattr(session, "access_token", None), provided):
        raise HTTPException(status_code=403, detail=detail)


def extract_token(
    x_interview_token: str | None = Header(default=None, alias=HEADER_NAME),
    token: str | None = Query(default=None, description="会话能力令牌（WS/兼容）"),
) -> str | None:
    """HTTP 依赖：优先 Header，其次 query。"""
    if x_interview_token and x_interview_token.strip():
        return x_interview_token.strip()
    if token and token.strip():
        return token.strip()
    return None


def ws_token_subprotocol(token: str) -> str:
    """构造携带令牌的 WebSocket 子协议名。"""
    return f"{WS_SUBPROTOCOL_PREFIX}{(token or '').strip()}"


def extract_ws_token(
    websocket: WebSocket,
    *,
    query_token: str | None = None,
) -> tuple[str, str | None]:
    """从 WS 握手提取能力令牌。

    优先级：
    1. ``Sec-WebSocket-Protocol: interviewos.<token>``（推荐，避免 query 进日志）
    2. query ``token=``（兼容旧客户端）

    Returns:
        ``(access_token, chosen_subprotocol_or_None)``
        若使用了子协议传令牌，第二项为完整子协议字符串，供 ``accept(subprotocol=...)``。
    """
    header = websocket.headers.get("sec-websocket-protocol") or ""
    for part in header.split(","):
        p = part.strip()
        if not p:
            continue
        if p.lower().startswith(WS_SUBPROTOCOL_PREFIX):
            tok = p[len(WS_SUBPROTOCOL_PREFIX) :].strip()
            if tok:
                return tok, p
    q = (query_token or "").strip()
    return q, None
