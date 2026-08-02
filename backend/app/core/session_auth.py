"""面试会话能力令牌（capability token）。

本地优先产品不引入多用户登录；对可变操作（WS / start / message / finish /
messages）要求创建时下发的 ``access_token``，防止仅凭整数 session_id 劫持。
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, Query

from app.models import InterviewSession

HEADER_NAME = "X-Interview-Token"


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


def assert_session_token(session: InterviewSession, provided: str | None) -> None:
    """校验失败抛 403。"""
    if not tokens_match(getattr(session, "access_token", None), provided):
        raise HTTPException(status_code=403, detail="无权访问该面试会话")


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
