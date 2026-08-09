---
type: backend
title: 会话能力令牌认证
description: app/core/session_auth.py 中 InterviewSession / PrepSession 的能力令牌、Cookie/Header/query 提取与 CSRF 缓解。
tags: [auth, session, capability-token, csrf, cookie]
---

# 会话能力令牌认证

InterviewOS 不实现多用户登录体系。可变操作（WS / start / message / finish / messages / reports / prep）通过创建会话时下发的能力令牌（capability token）保护，防止仅凭整数 ID 被枚举劫持。

## 关键符号

- `new_access_token()` — 生成 url-safe 32 字节熵令牌
- `tokens_match(expected, provided)` — 常量时间比较，长度不等直接拒绝
- `assert_session_token(session, provided)` — 校验失败抛 403
- `extract_token(session_id, request, ...)` — HTTP 面试令牌提取
- `extract_prep_token(session_id, request, ...)` — Prep 令牌提取
- `extract_ws_token(websocket, ...)` — WebSocket 握手令牌提取
- `set_session_cookie(...)` / `clear_session_cookie(...)`

## 令牌传递优先级

### HTTP

1. `X-Interview-Token` Header（显式能力，测试友好）
2. HttpOnly Cookie `interviewos_iv_{session_id}`
3. query `?token=`（仅非生产；生产忽略，避免访问日志泄漏）

### WebSocket

1. Cookie `interviewos_iv_{session_id}`
2. `Sec-WebSocket-Protocol: interviewos.<token>`（兼容）
3. query `token=`（仅非生产）

## CSRF 缓解

- 仅使用 Cookie 或 query 传递令牌时，非安全方法（POST/PUT/DELETE/PATCH）要求 `Origin` 或 `Referer` 落在 CORS 白名单。
- 使用 `X-Interview-Token` Header 时视为显式能力，跳过 CSRF 检查（方便测试与脚本）。

## Cookie 属性

- `httponly=True`, `samesite="lax"`, `path="/"`, `max_age=7*24*3600`
- `secure` 由 `cookie_should_be_secure(request)` 决定：显式配置优先；否则 https 或可信代理 `X-Forwarded-Proto=https` 时置 true。

## 聚焦测试

- `tests/test_session_auth_regression.py`
- `tests/test_session_frontend_source.py`
- `tests/test_session_http_interview.py`
- `tests/test_ws_hardening.py` 中的令牌相关用例

## 相关页面

- [安全辅助](./security.md)
- [安全总览](../../security.md)
- [后端入口](../main.md)
