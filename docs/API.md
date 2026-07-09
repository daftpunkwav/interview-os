# InterviewOS 接口规约（V2）

> 配套 `ARCHITECTURE.md` 使用。本文档列出全部 HTTP / WebSocket / SSE 端点，用于：
>
> - 二次开发接入；
> - 与其他 AI 工具（脚本、SDK）对接；
> - 给前端强类型生成器提供契约。

OpenAPI 自动文档由 FastAPI 在运行时提供：`/docs` (Swagger UI) / `/openapi.json`。
**注意**：所有路径与下列前缀相加；``/api`` 在前端 Next 端默认经 ``next.config.js`` 代理到 ``localhost:8000``。

---

## 1. REST 概览

| 方法 | 路径 | 入参 | 返回 | 备注 |
|---|---|---|---|---|
| GET | `/health` | — | `{status,service,version}` | 健康探针 |
| GET | `/api/v1/options` | — | `Options` | 启动初始化：岗位/职级/公司/工作流/AVATAR/SCENE |
| GET | `/api/v1/settings/llm` | — | `LLMSettings` | 仅 1 行，id=1 |
| PUT | `/api/v1/settings/llm` | `LLMSettingsUpdate` | `LLMSettings` | 同时设 api_key（"keep" 表示不变） |
| POST | `/api/v1/settings/llm/test` | — | `LLMTestResponse` | SSRF 防御 + 真实连通 |
| GET | `/api/v1/profile` | — | `UserProfile` | 自动创建 id=1 |
| PUT | `/api/v1/profile` | `UserProfileUpdate` | `UserProfile` | |
| POST | `/api/v1/resume/upload` | multipart `file` | `Resume` | **10MB 上限 + MIME 嗅探 + 路径越界防御** |
| GET | `/api/v1/resume/list` | — | `Resume[]` | |
| GET | `/api/v1/resume/{id}` | — | `Resume` | |
| POST | `/api/v1/resume/{id}/activate` | — | `{id,is_active}` | |
| POST | `/api/v1/resume/{id}/analyze` | — | `ResumeAnalysis` | LLM 返回经 Pydantic 强校验 |
| POST | `/api/v1/interview/sessions` | `InterviewConfig` | `InterviewSession` | |
| GET | `/api/v1/interview/sessions` | — | `InterviewSession[]` | |
| GET | `/api/v1/interview/sessions/{id}` | — | `InterviewSession` | |
| POST | `/api/v1/interview/sessions/{id}/start` | — | `{message?,current_phase}` | |
| POST | `/api/v1/interview/sessions/{id}/message` | `{content,face_analysis?,image_base64?}` | `{message,current_phase,is_complete,phases_remaining}` | |
| GET | `/api/v1/interview/sessions/{id}/messages` | — | `ChatMessage[]` | 历史消息 |
| POST | `/api/v1/interview/sessions/{id}/finish` | — | `{session_id,status,overall_score?}` | |
| GET | `/api/v1/reports/{id}` | — | `{session_id,report,duration_minutes?}` | |
| GET | `/api/v1/reports/{id}/stream` | — | SSE | 流式生成报告 |
| GET | `/api/v1/reports/growth/history` | — | `GrowthRecord[]` | |
| POST | `/api/v1/prep/sessions` | `{resume_id?,target_role?,target_company?}` | `{id}` | |
| POST | `/api/v1/prep/sessions/{id}/message` | `{content}` | `{reply,token_usage}` | |
| POST | `/api/v1/prep/sessions/{id}/message/stream` | `{content}` | SSE | 流式辅导 |

### 1.1 错误约定

- 统一 envelope：`{error: {code, message, trace_id}}`，兼容保留旧 `{detail: ...}` 字段；
- 全局结构化日志 `X-Trace-Id` 透出；入参 `X-Request-Id` 会被校验正则 `^[A-Za-z0-9_\-]{8,64}$`，不通过则服务端重生成；
- 429 限流 `Retry-After` 头；
- 413 上传超限 `{error.message:"文件超过 10MB 上限"}`；
- 任何 `api_base` 命中策略 → 400 `{error.message:"LLM API 地址不安全，仅允许 https 公网地址"}`；
- Starlette 抛出的 404（如 `/health POST`）也走同一 envelope，由 `StarletteHTTPException` handler 接管。

### 1.2 迁移指南 v1.0 → v2.0

`v2.0` 起，所有路径统一前缀 `/api/v1/*`；原 `/api/*` 在 3 个月内保留兼容别名（同一份 endpoint 在两条路径都暴露，测试覆盖 `tests/test_api_v1_paths.py`）。

```diff
- GET  https://host/api/profile
+ GET  https://host/api/v1/profile

- POST https://host/api/settings/llm
+ POST https://host/api/v1/settings/llm   # PUT 更新 + POST /key 轮换

- WS   ws://host/api/ws/interview/123
+ WS   ws://host/api/v1/ws/interview/123

- GET  https://host/api/reports/1/stream
+ GET  https://host/api/v1/reports/1/stream
```

`/api/v1/*` 是未来的唯一路径；`/api/*` 将在 2026-10-01 后逐步移除。先迁移前端 `src/lib/api.ts`，后端删除 alias 路由。

---

## 2. WebSocket 协议

**端点**：`ws://{host}/api/v1/ws/interview/{session_id}`

所有消息都是 JSON，单层结构、靠 `type` 区分。**客户端事件**：

```jsonc
// 用户说完一段（短消息，无音频）
{ "type": "user_text", "text": "我上一段做了 3 年微服务", "face_analysis": {...}, "image_base64": "..." }

// 音频流结束；后端会先 STT 回灌
{ "type": "user_turn_end", "pcm": "<base64 16k PCM Int16>", "sample_rate": 16000, "text": "...", "face_analysis": {...}, "image_base64": "..." }

// 麦克风识别中增量
{ "type": "stt_text", "text": "我上" }

// 主动询问参考提示
{ "type": "request_hint", "question": "请帮我准备 Redis 集群" }

// 静默超时（10 s 无新 partial）
{ "type": "silence_timeout" }

// 推送当前画面人脸分析（仅 vision 模式）
{ "type": "vision_update", "face_analysis": { "dominant_emotion": "smile", "eye_contact": true, ... } }
```

**服务端事件**：

```jsonc
{ "type": "turn_state", "state": "IDLE" | "AI_SPEAKING" | "USER_SPEAKING" | "PROCESSING" }
{ "type": "stt_partial", "text": "..." }
{ "type": "stt_final",   "text": "..." }
{ "type": "assistant_token", "token": "...", "phase": "..." }                    // 流式 token
{ "type": "assistant_done",  "content": "...", "phase": "...", "emotion": "smile", "is_complete": false, "audio_b64": "..." }
{ "type": "tts_audio",       "data": "<base64 mp3>", "mime": "audio/mpeg" }
{ "type": "silence_nudge",   "content": "请问还在吗？" }
{ "type": "reference_hint_loading", "question": "..." }
{ "type": "reference_hint",  "content": "...", "question": "..." }
{ "type": "phase_changed",   "phase": "..." }
{ "type": "interview_complete", "report_id": 42 }
{ "type": "error", "message": "..." }
```

### 2.1 前端强类型

前端在 `frontend/src/types/index.ts` 中声明 `ServerEvent` / `ClientEvent` discriminated union，
新增类型会同时触发 TS 编译失败 & WS handler 编译失败，构成"协议变化的硬错误屏障"。

---

## 3. SSE 协议

**端点 1（准备）**：`POST /api/v1/prep/sessions/{id}/message/stream`
**端点 2（报告）**：`GET /api/v1/reports/{id}/stream`

帧格式（与 WS `assistant_token` 同源）：

```
data: {"type":"token","content":"...","phase":"..."}
data: {"type":"token","content":"..."}
data: {"type":"done","report":{...},"token_usage":123}
```

错误统一为：

```
data: {"type":"error","message":"报告生成失败，请稍后重试"}
```

错误信息一律脱敏；详细堆栈见日志 trace_id。
