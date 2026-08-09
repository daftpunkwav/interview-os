---
type: frontend
title: API 客户端与类型契约
description: src/lib/api.ts 中 REST/SSE 请求封装、错误处理与 src/types/index.ts 中前后端共享类型。
tags: [frontend, api-client, types, sse, websocket, error-handling]
---

# API 客户端与类型契约

## src/lib/api.ts

`api.ts` 是所有后端通信的**唯一出口**。所有页面都通过它发起请求，确保统一错误处理、trace_id、凭证携带。

### 关键函数

- `request<T>(method, path, options)`：通用 REST 请求，自动添加 `credentials: "include"` 和 `X-Request-Id`。
- `consumeSSE<T>(url, onEvent, onError)`：SSE 流式解析，按 `data:` 行解析 JSON。
- `ApiError`：解析后端统一错误信封 `{error:{code,message,trace_id}}` 与旧 `detail` 字段。
- `resolveBackendUrl(url)`：对齐 `localhost` ↔ `127.0.0.1`，减少 CORS/PNA 问题。

### API 对象方法

覆盖所有 `/api/v1` 端点：

- `getLLMSettings`, `updateLLMSettings`, `testLLM`, `testPipelineStage`
- `getVoiceCatalog`
- `getProfile`, `updateProfile`
- `uploadResume`, `listResumes`, `activateResume`, `deleteResume`, `analyzeResume`
- `createPrepSession`, `prepMessage`, `prepMessageStream`
- `getOptions`, `createSession`, `listSessions`, `getSession`, `startInterview`, `sendMessage`, `getMessages`, `finishInterview`
- `getReport`, `getReportStream`, `getGrowthHistory`, `getSystemInsights`

### 直连后端

流式接口（SSE、WebSocket）**直接连接后端**，绕过 Next.js rewrites 缓冲。

## src/types/index.ts

全局类型契约，必须与后端 Pydantic schema 严格对应。核心类型：

- `LLMSettings`, `LLMSettingsWrite`
- `UserProfile`, `CandidateProfile`, `Resume`, `ResumeAnalysis`
- `InterviewConfig`, `InterviewSession`, `ChatMessage`, `InterviewReport`, `ScoreBreakdown`, `GrowthRecord`
- `FaceAnalysis`
- `ServerEvent`, `ClientEvent`：WebSocket discriminated union
- `PrepSSEEvent`, `ReportSSEEvent`：SSE discriminated union
- `ApiErrorEnvelope`, `ApiErrorBody`

### WebSocket 事件示例

```typescript
type ServerEvent =
  | { type: "turn_state"; state: TurnState }
  | { type: "assistant_token"; token: string; phase: string }
  | { type: "assistant_done"; content: string; phase: string; emotion: string; is_complete: boolean; audio_b64?: string }
  | { type: "tts_audio"; data: string; mime: string }
  | { type: "phase_changed"; phase: string }
  | { type: "interview_complete"; report_id: number }
  | { type: "server_ping"; t: number }
  | { type: "error"; message: string }
  | ...;
```

新增 `ServerEvent` 成员会触发 TypeScript 全项目编译失败，形成协议变化的硬错误屏障。

## src/lib/env.ts

- `getEnv(key)`：读取环境变量，生产缺失则抛错。
- `readEnv(key, fallback)`：开发环境允许回退。
- 校验 `NEXT_PUBLIC_API_BASE` 与 `NEXT_PUBLIC_WS_URL` 的协议一致性（`https` ↔ `wss`，`http` ↔ `ws`）。

## src/lib/utils.ts

- `cn(...inputs)`：`clsx` + `tailwind-merge` 的 classname 合并工具，供所有组件拼接 Tailwind 类名。

## 相关页面

- [前端概览](./overview.md)
- [后端 API 概览](../backend/api/overview.md)
- [后端 Schemas](../backend/schemas.md)
- [媒体管道](./media-pipeline.md)
