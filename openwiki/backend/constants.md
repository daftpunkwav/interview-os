---
type: backend
title: 全局协议常量
description: app/core/constants.py 中前后端共享的枚举、阶段 ID、事件类型、阈值与速率限制。
tags: [constants, enum, protocol, str-enum]
---

# 全局协议常量

`app/core/constants.py` 集中存放前后端契约中使用的字符串字面量，是改名的原子同步点。修改任何常量必须同时修改后端与前端 `src/config/*.ts` 并提交为一个原子 commit。

## 主要枚举

| 枚举 | 用途 |
|---|---|
| `LLMProtocol` | 当前仅 `OPENAI_CHAT = "openai_chat"` |
| `RAGBackendKind` | `local` / `stepfun` / `none` |
| `WorkflowType` | `technical` / `hr` / `management` |
| `InterviewPhaseId` | 全部工作流阶段 ID（技术面、HR、管理岗） |
| `Personality` | `gentle` / `professional` / `pressure` / `hr` / `expert` |
| `InterviewStyle` | `guided` / `deep_dive` / `continuous` / `challenging` |
| `SessionStatus` | `pending` / `active` / `completed` / `abandoned` |
| `FollowupCategory` | `vague` / `missing_data` / `tech_hole` / `off_topic` / `none` |
| `SSEMessageType` | `token` / `done` / `error` |
| `WSServerEvent` | 服务端事件类型 |
| `WSClientEvent` | 客户端事件类型 |

## 阶段顺序权威来源

阶段中文名、描述、题量上下限的唯一来源是 `app/services/interview/workflows.py`；`InterviewPhaseId` 仅对阶段 ID 做枚举约束。`technical_phase_order()` 委托 `workflows.technical_phase_order()` 以避免双轨。

## 阈值与限制

| 常量 | 值 | 说明 |
|---|---|---|
| `DEFAULT_RATE_LIMIT_PER_MINUTE` | 60 | 通用限流 |
| `DEFAULT_LLM_RATE_LIMIT_PER_MINUTE` | 10 | LLM 相关接口限流 |
| `DEFAULT_SESSION_CREATE_RATE_LIMIT_PER_MINUTE` | 20 | 防批量创建会话烧配额 |
| `MAX_USER_TEXT_CHARS` | 16_000 | 单条用户文本 |
| `MAX_CONFIG_STR_CHARS` | 200 | 配置字符串 |
| `RESUME_MAX_UPLOAD_BYTES` | 10 MB | 简历上传 |
| `HEARTBEAT_TIMEOUT_SEC` | 30.0 | WS 心跳超时 |
| `HEARTBEAT_MAX_MISSES` | 3 | 心跳最大miss |
| `AUDIO_BUFFER_MAX_BYTES` | 5 MB | WS 音频缓冲 |
| `TTS_QUEUE_MAX_SIZE` | 50 | TTS 队列长度 |

## 安全相关

- `API_KEY_ENCRYPTION_VERSION = "enc:v2"`
- `TRACE_ID_HEADER = "X-Trace-Id"`

## 相关页面

- [面试工作流](services/interview/workflows.md)
- [面试追问](services/interview/followup.md)
- [实时事件](realtime/events.md)
- [前端类型](../frontend/api-client.md)
