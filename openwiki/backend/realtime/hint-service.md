---
type: backend
title: 参考提纲服务
description: app/realtime/hint_service.py 中处理 request_hint 事件，异步为候选人提供答题参考提示。
tags: [realtime, hint, reference, coaching]
---

# 参考提纲服务

`HintServiceMixin` 处理前端 `request_hint` 事件：候选人在答题过程中向 AI 请求参考提示。

## 关键符号

- `_on_request_hint(payload)`
- `_hint_inflight`：防止并发提示请求
- `reference_hint_loading` 与 `reference_hint` 事件

## 事件流程

1. 前端发送 `{"type": "request_hint", "question": "请帮我准备 Redis 集群"}`。
2. 后端发送 `reference_hint_loading` 事件告知前端正在生成。
3. 异步调用 LLM（基于当前 session 上下文、公司、岗位）生成提示要点。
4. 发送 `reference_hint` 事件，包含 `content` 与 `question`。

## 并发控制

`_hint_inflight` 防止同一连接同时处理多个提示请求。新的 `request_hint` 在旧请求完成前会被忽略或返回提示。

## 与面试状态的关系

提示生成不修改 `messages` 历史，不推进阶段，仅作为辅助信息展示给候选人。提示内容不会直接作为面试官问题。

## 聚焦测试

- `tests/test_ws_handler.py` 覆盖提示事件顺序。

## 相关页面

- [WS 门面](./ws-handler.md)
- [前端面试室](../../frontend/pages/interview-room.md)
