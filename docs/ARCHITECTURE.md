# InterviewOS 架构说明（V2 实时版）

> 维护者：项目核心小组 · 适用范围：M0–M5 已合入的全部特性

本文是开发者 / 贡献者的第一入口，目标：

- 用一张图回答「这个项目由哪几层组成」；
- 用一张表回答「新增 / 修改一条功能该改哪些目录」；
- 用一份清单回答「安全 / 性能 / 可扩展性上有哪些共识」。

## 1. 系统全景

```
┌────────────────────────────────────────────────────────────────┐
│                        浏览器 (Next.js 15)                     │
│   src/app/*  src/components/*  src/features/media/*             │
│   ──────────────────────────────────────────────────────────    │
│   • TypeScript 严格模式（noUncheckedIndexedAccess）             │
│   • 强类型 SSE / WS 事件（src/types/index.ts）                 │
│   • 流式接口直连后端，绕过 Next rewrites 缓冲                  │
└──────┬────────────────────────┬────────────────────┬──────────┘
       │ fetch /api/*           │ WS  /api/v1/ws/..  │  SSE 直接连
       ▼                        ▼                    ▼
┌────────────────────────────────────────────────────────────────┐
│                 FastAPI 后端 (Python 3.11 · Uvicorn)            │
│   app/api/*  app/realtime/*  app/services/*  app/agents/*       │
│   ──────────────────────────────────────────────────────────    │
│   • 单进程无外部依赖（SQLite + Chroma 本地落盘）                │
│   • 限流、SSRF 防御、API Key at-rest 加密（HMAC+XOR）          │
│   • 面试回合编排：runner / agent / orchestrator / followup      │
└──────┬────────────────────────┬────────────────────┬──────────┘
       │ OpenAI Chat Completions   │ faster-whisper    │ edge-tts
       ▼                          ▼                   ▼
   ┌─────────┐               ┌────────────┐       ┌──────────┐
   │ LLM BYOK│               │ STT (本地) │       │ Edge TTS │
   └─────────┘               └────────────┘       └──────────┘
                  数据层
   SQLite (./data/interviewos.db) · Chroma (./chroma_*) · 上传目录 ./uploads
```

## 2. 目录分层

| 目录 | 角色 | 关键约束 |
|---|---|---|
| `app/api/` | HTTP 路由 | 必须用 `Depends(get_db)`；上传需 size/MIME/路径校验；任何 `api_base` 入参必须经 `is_safe_http_url` |
| `app/api/v1/` | API v1（实时面试/准备） | 走 WS；不允许同步业务阻塞超过 5 秒 |
| `app/realtime/` | WS 协议 | `events.py` 定义客户端/服务端事件；`ws_handler.py` 仅做编排，不存业务规则 |
| `app/services/llm/` | BYOK LLM 客户端 | 入参 api_key 必须从 `decrypt_secret` 出来；超时 ≤ 60 s |
| `app/services/interview/` | 业务编排 | `runner.py` 是回合执行器；`agent.py` 是会话状态机；`followup.py` 是追问信号器 |
| `app/services/rag/` | Chroma RAG | `RAGProvider`-style 接口（扩展点）；启动期 `ensure_index()` |
| `app/services/seed.py` | 启动种子 | 仅写一次；幂等 |
| `app/core/` | 基础设施 | `security.py` / `secrets.py` / `logging.py` / `ratelimit.py` / `migrate.py` |
| `frontend/src/types/` | 强类型契约 | REST / SSE / WS 的所有事件和响应都必须在这里定义 |
| `frontend/src/lib/api.ts` | API 客户端 | 唯一对外出口；所有页面只能从此处调用 |
| `frontend/src/features/media/` | WS / 录音 / TTS | 与后端协议保持强类型一致 |
| `frontend/src/app/` | Next App Router | 仅 Client Component 包含交互；RSC 仅做轻量装饰 |

## 3. 模块依赖收敛

```
app/api ─► app/services ─► app/core (security/secrets/logging/ratelimit)
                          └► app/models
                          └► app/schemas
```

- `app/core` 不依赖 `app/api` 或 `app/services`，可独立单测；
- `app/services/*` 不依赖 `app/api/*`，避免循环；
- `app/realtime` 是特殊的网关层，只编排 `app/services`，自身不写业务规则。

## 4. 实时面试数据流

```
[Browser]
  │  captureFrame / mic → audio_buffer
  ▼
[WS Handler]
  │  STT (Whisper) ──► text
  │  Vision (FaceDetector) ──► face_analysis JSON
  │  拼装 user_text 或 user_turn_end 帧
  ▼
[InterviewRunner.stream_turn]
  │ 1) 追问信号分析 (followup.py)
  │ 2) RAG 检索 (company_rag.py)
  │ 3) 上下文压缩 (context/manager.py)  超阈值时触发
  │ 4) 组装 system prompt + 历史 + 当前问题 → LLM
  │ 5) 流式增量 → assistant_token
  │ 6) assistant_done（含情绪、可播放 TTS b64）
  ▼
[TTS Queue → Edge TTS]  ──► tts_audio 帧
  ▼
[静默计时]  10s 内无新 partial → silence_timeout → 触发追问
```

## 5. 安全边界（已实现）

| 风险点 | 当前实现 | 后续可扩展 |
|---|---|---|
| API Key 在 DB 明文 | `app/core/secrets.py` AES-兼容（HMAC+XOR，`enc:v1:` 前缀） | 切回 `cryptography.AESGCM` 仅需替换实现 |
| SSRF `api_base` | `is_safe_http_url` 拒绝私网/loopback；dev 模式可放行 | IP 黑名单、白名单 |
| 文件上传 | 10MB 流式上限 + 魔数嗅探 + `assert_within_dir` | 走对象存储（MVP 单机保留本地） |
| 限流 | `app/core/ratelimit.py` 滑动窗口 | 替换 Redis；按用户/IP 区分 |
| 日志脱敏 | `RedactFilter` 自动遮蔽 `Authorization`/API Key | 全文加密（KMS） |
| WebSocket | 当前无鉴权（demo 范围）；后续应注入 JWT | `Sec-WebSocket-Protocol` 携 token |
| 路径穿越 | `sanitize_filename` + `assert_within_dir` 双保险 | — |

## 6. 测试策略

- `backend/tests/` 7 个文件，48 通过；领域核心（Runner / Followup / RAG / Context / TTS Queue）单测覆盖；
- 新代码要求至少补 1 个单测；与 LLM 交互必须通过 `FakeLLMClient`；
- 测速脚本 `pytest -q`。

## 7. 扩展点（如何加新东西）

| 需求 | 改哪里 |
|---|---|
| 加一种 LLM Provider（Claude / Gemini / Ollama） | `app/services/llm/` 加新 Provider；`from_db` 选用 |
| 加一种面试工作流（System Design Round / Coding Round） | `app/services/interview/workflows.py` 注册即可；`options.workflow_types` 自动暴露 |
| 加一种追问信号维度 | `app/services/interview/followup.py` 新增分类 + 正则 |
| 加一种企业知识库 / KB 源 | `app/services/company/knowledge.py` 增加元数据；`company_rag.py` 重新索引 |
| 加前端页面 | `frontend/src/app/<route>/page.tsx` + `src/lib/api.ts` 新方法 + `Sidebar.tsx` nav 数组 |
| 加前端事件类型 | 仅在 `src/types/index.ts` 增加 discriminated union 成员；所有 on() 回调自动收紧 |
| 加全局 Toast 类型 | 已在 `src/components/Toast.tsx` 注册；按需调用 `toast.success/error/...` |

## 8. 已知约束

- **未实现鉴权**：当前所有接口均无登录；MVP 定位为本地单机工具（详见 `SECURITY.md`）。
- **SQLite**：单机部署；如需多人，需切到 Postgres（`app/config.py` 中 DATABASE_URL 即可）。
- **TLS / 反向代理**：默认 http；生产应在前置 Nginx/ALB 终止。
