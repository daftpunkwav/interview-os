---
type: backend
title: 实时事件定义
description: app/realtime/events.py 中 TurnState、SessionSnapshot 与 SessionEvent 运行时结构。
tags: [realtime, events, websocket, state-machine]
---

# 实时事件定义

`app/realtime/events.py` 定义 WebSocket 面试会话中的核心状态与快照结构。

## 关键符号

- `TurnState`：话轮状态枚举
- `SessionSnapshot`：单次 runner 回合的快照（供 orchestrator 合并信号）
- `SessionEvent`：WebSocket 接收事件的结构化包装
- `schema_version`：协议版本号，用于兼容检查

## TurnState

```python
class TurnState(str, Enum):
    IDLE = "IDLE"
    AI_SPEAKING = "AI_SPEAKING"
    USER_SPEAKING = "USER_SPEAKING"
    PROCESSING = "PROCESSING"
```

- `IDLE`：等待候选人输入或播报完成。
- `USER_SPEAKING`：候选人正在说话（前端 VAD 检测到语音）。
- `PROCESSING`：后端正在处理候选人输入（LLM 推理、工具调用）。
- `AI_SPEAKING`：AI 正在播报（TTS 播放中）。

## SessionSnapshot

`InterviewOrchestrator` 使用 `SessionSnapshot` 合并多个信号（如视觉分析、追问信号）为一个统一快照，再交给 `TurnCoordinator` 处理。

## schema_version

`schema_version` 用于前后端协议版本校验。如果前端发送的 `schema_version` 与后端不兼容，后端可能发送 `error` 提示或关闭连接。当前协议版本应参考 `app/realtime/events.py` 与 `frontend/src/types/index.ts` 中的对应常量。

## 与常量模块的关系

WebSocket 事件字符串常量（如 `assistant_token`、`user_turn_end`）定义在 `app/core/constants.py` 的 `WSServerEvent` 和 `WSClientEvent` 枚举中。`events.py` 主要定义运行时状态机结构与快照。

## 相关页面

- [核心常量](../constants.md)
- [Orchestrator](../agents/orchestrator.md)
- [回合调度](./turn-coordinator.md)
- [前端类型契约](../../frontend/api-client.md)
