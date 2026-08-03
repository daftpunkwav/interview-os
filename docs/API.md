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

> 所有路径前缀 `/api/v1`；兼容别名 `/api` 由 `app/api/router.py` 注入，3 个月内保留，2026-10-01 后将逐步移除。下表以权威路径 `/api/v1` 列出。

| 方法 | 路径 | 入参 | 返回 | 备注 |
|---|---|---|---|---|
| GET | `/health` | — | `{status,service,version}` | 健康探针（未挂在 `/api/v1` 下） |
| GET | `/api/v1/options` | — | `Options` | 启动初始化：岗位/职级/公司/工作流/人像/场景/TTS 音色 |
| GET | `/api/v1/settings/catalog` | — | 三阶段供应商能力目录 | `reasoning` / `recognize` / `speak` |
| GET | `/api/v1/settings/llm` | — | `LLMSettings` | 含三处理器指派字段；密钥仅返回 `has_*` 布尔 |
| PUT | `/api/v1/settings/llm` | `LLMSettingsUpdate` | `LLMSettings` | 思考/ASR/TTS 密钥分列加密；`"keep"` 表示不变；校验组合合法性 |
| POST | `/api/v1/settings/llm/test` | — | `LLMTestResponse` | 兼容旧入口＝测试「思考」阶段 |
| POST | `/api/v1/settings/test/{stage}` | `stage=recognize\|reason\|speak` | `LLMTestResponse` | 连通性测试；识别用本地 wav fixture |
| GET | `/api/v1/profile` | — | `UserProfile` | 自动创建 id=1 |
| PUT | `/api/v1/profile` | `UserProfileUpdate` | `UserProfile` | 含 GitHub 用户名 / 作品集 / LinkedIn / 城市 / 语言 / 职业亮点 / 远程 / 到岗周期 |
| POST | `/api/v1/resume/upload` | multipart `file` | `Resume` | **10MB 上限 + 魔数嗅探 + 路径越界防御**；PDF/DOCX/MD/TXT |
| GET | `/api/v1/resume/list` | — | `Resume[]` | |
| GET | `/api/v1/resume/{id}` | — | `Resume` | |
| POST | `/api/v1/resume/{id}/activate` | — | `{id,is_active}` | 行锁互斥 |
| DELETE | `/api/v1/resume/{id}` | — | `{ok,id}` | 删除简历与尝试清理上传文件 |
| POST | `/api/v1/resume/{id}/analyze` | — | `ResumeAnalysis` | 多维度 Agent 评价（强校验 + 容错规范化） |
| POST | `/api/v1/interview/sessions` | `InterviewConfig` | `InterviewSession` | `interview_style` 允许 `guided` / `deep_dive` / `continuous` / `challenging`；人格严格度 1–10；本机限流创建 |
| GET | `/api/v1/interview/sessions` | — | `InterviewSession[]` | |
| GET | `/api/v1/interview/sessions/{id}` | — | `InterviewSession` | |
| POST | `/api/v1/interview/sessions/{id}/start` | — | `{session_id,message,current_phase}` | 仅返回开场白；不含 `is_complete` |
| POST | `/api/v1/interview/sessions/{id}/message` | `{content,face_analysis?,image_base64?}` | `{session_id,message,current_phase,is_complete,phases_remaining}` | |
| GET | `/api/v1/interview/sessions/{id}/messages` | — | `ChatMessage[]` | 历史消息（强校验，坏数据降级为空） |
| POST | `/api/v1/interview/sessions/{id}/finish` | — | `{session_id,status,overall_score?}` | 提前结束；幂等（已结束则返回 `already_completed`） |
| GET | `/api/v1/reports/{id}` | — | `{session_id,report,messages_count,duration_minutes?}` | 报告已生成才返回；否则 404 |
| GET | `/api/v1/reports/{id}/stream` | — | SSE | 流式生成报告；单次 LLM，避免双倍计费 |
| GET | `/api/v1/reports/growth/history` | — | `GrowthRecord[]` | 最近 20 条 |
| GET | `/api/v1/reports/growth/system-insights` | — | 系统学习洞察 | 跨面试聚合 tool/公司/薄弱线索 |
| POST | `/api/v1/prep/sessions` | `{resume_id?,target_role?,target_company?}` | `{id}` | |
| POST | `/api/v1/prep/sessions/{id}/message` | `{content}` | `{reply,token_usage}` | 同步版本 |
| POST | `/api/v1/prep/sessions/{id}/message/stream` | `{content}` | SSE | 流式辅导 |
| GET | `/api/v1/prep/sessions/{id}/messages` | — | 历史消息 JSON 数组 | 准备会话历史回溯 |

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

所有消息都是 JSON，单层结构、靠 `type` 区分。**客户端事件**（discriminated union，定义见 `frontend/src/types/index.ts:ClientEvent`）：

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

// 收到 server_ping 后 5s 内必须回 pong
{ "type": "pong", "t": 1700000000 }
```

**服务端事件**（discriminated union，定义见 `frontend/src/types/index.ts:ServerEvent`）：

```jsonc
{ "type": "turn_state", "state": "IDLE" | "AI_SPEAKING" | "USER_SPEAKING" | "PROCESSING" }
{ "type": "stt_partial", "text": "..." }
{ "type": "stt_final",   "text": "..." }
{ "type": "assistant_token", "token": "...", "phase": "..." }                    // 流式 token
{ "type": "assistant_done",  "content": "...", "phase": "...", "emotion": "smile", "is_complete": false, "audio_b64": "..." }
{ "type": "assistant_audio_start" }
{ "type": "assistant_audio_chunk", "data": "<base64>", "idx": 0 }
{ "type": "assistant_audio_end" }
{ "type": "tts_audio",       "data": "<base64 mp3>", "mime": "audio/mpeg" }
{ "type": "silence_nudge",   "content": "请问还在吗？" }
{ "type": "reference_hint_loading", "question": "..." }
{ "type": "reference_hint",  "content": "...", "question": "..." }
{ "type": "phase_changed",   "phase": "..." }
{ "type": "interview_complete", "report_id": 42 }
{ "type": "server_ping", "t": 1700000000 }                                       // 心跳：客户端需在 5s 内回 pong
{ "type": "info",  "message": "..." }                                            // 非致命提示（如 coming_soon 回退）
{ "type": "error", "message": "..." }
```

> 实时语音路径：麦克风 PCM → **独立 ASR 凭证**转写（失败回退本地 Whisper）→ 思考 LLM → TTS（按设置页播报处理者；可仅字幕）。思考 LLM 的 Key **不会**静默充当 ASR Key。
>
> 同一 `session_id` 只允许一条活跃连接，新连接会踢掉旧连接（`fix/ws-single-session-mutex`）。

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
