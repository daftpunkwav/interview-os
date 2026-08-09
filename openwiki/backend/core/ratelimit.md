---
type: backend
title: 进程内限流
description: app/core/ratelimit.py 中基于滑动窗口的内存限流、可信代理 CIDR 与按 client_id 限流。
tags: [rate-limit, sliding-window, security, middleware]
---

# 进程内限流

`app/core/ratelimit.py` 实现轻量级进程内滑动窗口限流，无需 Redis 等外部依赖，适合本地优先部署。

## 关键符号

- `check_rate_limit(request, key, limit, window_seconds)`
- `check_rate_limit_by_id(key, client_id, limit, window_seconds)`
- `try_rate_limit_by_id(...)` — WS 友好，不抛异常
- `rate_limit_dep(key, limit, window_seconds)` — FastAPI `Depends`
- `reset_rate_limit(key=None)` — 测试用

## 客户端 IP 解析

- 仅当 `request.client.host` 落入 `TRUSTED_PROXY_CIDRS`（默认 loopback）时才采纳 `X-Forwarded-For` 首段。
- 公网或未信任局域网直连始终使用 `request.client.host`，防止伪造头绕过限流。

## 桶清理

- 后台守护线程每 120 秒清理空闲超过 600 秒的桶，避免长跑服务字典无界增长。
- 单线程惰性启动，通过全局 `_cleanup_started` 保证只启动一次。

## 限制与替换路径

多 worker 部署时每个 worker 独立计数，限额会被放大 N 倍。需要跨 worker 一致时，可替换为 Redis 集中存储，保持 `check_rate_limit*` 接口不变。

## 聚焦测试

- `tests/test_session_rate_limit.py`
- `tests/test_main.py` 相关限流断言

## 相关页面

- [后端入口](../main.md)
- [安全辅助](./security.md)
- [安全总览](../../security.md)
