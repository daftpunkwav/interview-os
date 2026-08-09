---
type: backend
title: 结构化日志与 Trace 追踪
description: app/core/logging.py 中 JSON 结构化日志、API Key 脱敏、trace_id ContextVar 与请求串联。
tags: [logging, trace, json-log, redaction]
---

# 结构化日志与 Trace 追踪

`app/core/logging.py` 提供全局日志配置、请求 trace_id 串联与 API Key 自动脱敏。

## 关键符号

- `configure_logging()`
- `RedactFilter` — 覆盖 `record.msg/args/exc_text` 三路径脱敏
- `TRACE_ID_HEADER = "X-Trace-Id"`
- `get_trace_id()` / `set_trace_id(raw)` / `reset_trace_id(token)`

## Trace 模型

- `trace_id` 存储在 `ContextVar` 中，每个请求独立。
- 中间件从 `X-Request-Id` 读取并校验，合法则沿用，否则重新生成。
- 所有响应均通过 `X-Trace-Id` 头返回，便于前后端串联日志。

## 脱敏策略

`RedactFilter` 在日志格式化前遍历 `msg` 与 `args`，调用 `redact_api_key`（定义在 `app/core/security.py`）遮蔽敏感字符串，避免 API Key 在日志、异常堆栈中泄漏。

## 相关页面

- [后端入口](../main.md)
- [安全辅助](./security.md)
- [安全总览](../../security.md)
