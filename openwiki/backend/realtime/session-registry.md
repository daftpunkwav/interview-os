---
type: backend
title: 会话注册表
description: app/realtime/session_registry.py 中维护 session_id 到活跃 InterviewWSHandler 的映射，实现新连接踢掉旧连接。
tags: [realtime, session-registry, websocket, mutex]
---

# 会话注册表

`app/realtime/session_registry.py` 维护一个全局字典，确保每个面试会话在任一时刻只有一条活跃 WebSocket 连接。

## 关键符号

- `_active_handlers: dict[int, InterviewWSHandler]`
- `claim_session_connection(session_id, handler)`
- `release_session_connection(session_id, handler)`
- `reset_session_registry_for_tests()`

## 互斥规则

`claim_session_connection(session_id, handler)`：

1. 获取锁。
2. 如果已有活跃 handler：
   - 调用旧 handler 的 `_mark_superseded()`。
   - 关闭旧 WebSocket 连接。
3. 登记新 handler。
4. 释放锁。

`release_session_connection(session_id, handler)`：

1. 获取锁。
2. 只有当当前登记的 handler 与传入的 handler 一致时才移除。
3. 释放锁。

## 为什么需要 owner 检查

WebSocket 连接的关闭是异步的。如果旧连接被踢掉后延迟释放，可能误删新连接的登记。owner 检查避免这种竞态。

## 测试工具

`reset_session_registry_for_tests()` 在测试之间清理全局状态，避免测试相互污染。`ws_handler.py` 的 `__all__` 也 re-export 了该函数，便于测试 import。

## 聚焦测试

- `tests/test_session_ws_mutex.py`：新连接踢旧连接、owner 检查、并发关闭。
- `tests/test_ws_handler.py`：连接互斥与生命周期。

## 相关页面

- [WS 门面](./ws-handler.md)
- [连接生命周期](./connection-lifecycle.md)
