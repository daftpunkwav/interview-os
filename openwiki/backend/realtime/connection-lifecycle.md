---
type: backend
title: 连接生命周期管理
description: app/realtime/connection_lifecycle.py 中 WebSocket 握手、单连接互斥、心跳与优雅关闭。
tags: [realtime, websocket, lifecycle, heartbeat, mutex]
---

# 连接生命周期管理

`ConnectionLifecycleMixin` 控制 WebSocket 连接的整个生命周期：握手、鉴权、单连接互斥、心跳、任务清理、关闭。

## 关键符号

- `_handle_connection()`：主入口
- `_accept_and_run()`：接受连接、加载 session、启动循环
- `_main_loop()`：消息接收 + 心跳调度
- `_heartbeat_task()`：发送 `server_ping` 并检查 miss
- `_graceful_close()`：关闭连接、清理资源

## 握手流程

1. 接受 WebSocket 连接（可选子协议回显）。
2. 从 Cookie / `Sec-WebSocket-Protocol` / query 提取 `access_token`（生产禁用 query）。
3. 校验 `InterviewSession` 存在且 token 匹配。
4. 加载 `LLMClient.from_db(db)`、构建 `InterviewRunner`。
5. 登记到 `session_registry`；新连接会踢掉旧连接。

## 单连接互斥

`claim_session_connection(session_id, handler)`：

- 如果已有活跃 handler，调用旧 handler 的 `_mark_superseded()` 并关闭其连接。
- 新连接成为当前活跃 handler。

`release_session_connection(session_id, handler)`：

- 只有当前活跃的 handler 与释放者一致时才移除，防止关闭后旧连接的异步释放误删新连接。

## 心跳机制

- 服务端每 30 秒发送 `server_ping`。
- 客户端必须在 5 秒内回 `pong`。
- 累计 3 次 miss 触发优雅关闭。
- 收到任何客户端消息重置 miss 计数。

## 消息分发

主循环接收 JSON 消息后，根据 `type` 分发：

- `user_text` / `user_turn_end` / `stt_text` / `silence_timeout` → `TurnCoordinatorMixin`
- `request_hint` → `HintServiceMixin`
- `request_finish` → `TurnControlMixin`
- `vision_update` → 更新面部状态
- `pong` → 心跳响应

## 关闭清理

- 取消所有后台任务（TTS 队列、报告生成、提示任务等）。
- 释放 session 注册表。
- 关闭 WebSocket。
- 不强制保存状态（状态在每次 `save_state` 后已持久化）。

## 聚焦测试

- `tests/test_ws_handler.py`：握手、心跳、互踢、状态流转。
- `tests/test_ws_hardening.py`：边界、异常、并发安全。
- `tests/test_session_ws_mutex.py`：单连接互斥。

## 相关页面

- [WS 门面](./ws-handler.md)
- [会话注册表](./session-registry.md)
- [回合调度](./turn-coordinator.md)
- [前端 useInterviewWS](../../frontend/media-pipeline.md)
