---
type: backend
title: 面试会话端点
description: app/api/interview.py 中面试会话创建、开始、文本消息、历史与结束。
tags: [api, interview, session, http]
---

# 面试会话端点

## 路径

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/interview/sessions` | 创建面试会话（限流 20/分钟） |
| GET | `/api/v1/interview/sessions` | 列出会话 |
| GET | `/api/v1/interview/sessions/{id}` | 获取会话 |
| POST | `/api/v1/interview/sessions/{id}/start` | 开始面试，返回开场白 |
| POST | `/api/v1/interview/sessions/{id}/message` | 发送文本/图片消息 |
| GET | `/api/v1/interview/sessions/{id}/messages` | 获取历史消息（坏数据降级为空） |
| POST | `/api/v1/interview/sessions/{id}/finish` | 提前结束，幂等 |

## 创建会话

`InterviewConfig` 字段：

- `role`, `level`, `company`（必填，≤200 字符）
- `workflow_type`: `technical` | `hr` | `management`
- `personality`: `gentle` | `professional` | `pressure` | `hr` | `expert`
- `strictness`: 1–10
- `interview_style`: `guided` | `deep_dive` | `continuous` | `challenging`
- `resume_id`, `avatar_id`, `scene_id`

创建时生成 `access_token` 并通过 HttpOnly Cookie 下发；`list`/`get` 不返回令牌。

## 开始面试

`start` 调用 `InterviewRunner.stream_opening` 生成开场白，仅返回第一条面试官消息，不会标记 `is_complete`。

## 文本消息

`message` 调用 `InterviewRunner.stream_turn` 处理候选人回答，返回 `InterviewMessageResponse`：

- `message`：最新 ChatMessage
- `current_phase`：当前阶段 ID
- `is_complete`：是否整场结束
- `phases_remaining`：剩余阶段列表

## 历史消息

`messages` 读取 `InterviewSession.messages` JSON 并反序列化，坏数据降级为空列表而非 500，避免早期会话损坏导致前端崩溃。

## 结束与幂等

`finish` 标记会话为 `completed` 并触发报告生成。已结束会话再次调用返回 `already_completed`。

## 能力令牌

所有可变操作（start、message、finish、messages）必须携带会话能力令牌。详见 [session-auth](../core/session-auth.md)。

## 相关页面

- [面试 Agent](../services/interview/agent.md)
- [InterviewRunner](../services/interview/runner.md)
- [面试工作流](../services/interview/workflows.md)
- [WebSocket 实时面试](./websocket.md)
