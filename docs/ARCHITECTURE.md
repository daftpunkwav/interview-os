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
│   • 限流、SSRF 防御、API Key at-rest 加密（AES-256-GCM）      │
│   • 面试回合编排：runner / agent / orchestrator / followup      │
└──────┬────────────────────────┬────────────────────┬──────────┘
       │ OpenAI Chat Completions   │ ASR 适配层         │ TTS 适配层
       ▼                          ▼                   ▼
   ┌─────────────┐          ┌──────────────┐    ┌──────────────────┐
   │ 思考 LLM    │          │ 多厂商 ASR   │    │ TTS 适配层       │
   │ (BYOK)      │          │ + local 回退 │    │ (Edge / 等)      │
   └─────────────┘          └──────────────┘    └──────────────────┘
                  数据层
   SQLite (./data/interviewos.db) · Chroma · 上传目录 ./uploads · STT fixtures
```

## 2. 目录分层

| 目录 | 角色 | 关键约束 |
|---|---|---|
| `app/api/` | HTTP 路由 | 必须用 `Depends(get_db)`；上传需 size/MIME/路径校验；任何 `api_base` 入参必须经 `is_safe_http_url` |
| `app/api/v1/` | API v1（实时面试/准备） | 走 WS；不允许同步业务阻塞超过 5 秒 |
| `app/realtime/` | WS 协议 | `events.py` 定义客户端/服务端事件；`ws_handler.py` 仅做编排，不存业务规则 |
| `app/services/llm/` | BYOK LLM 客户端（思考处理者） | 入参 api_key 必须从 `decrypt_secret` 出来；超时 ≤ 60 s |
| `app/services/stt/` | 语音识别适配 | `router.py` 按 handler 分发；**禁止**静默回落思考 LLM Key |
| `app/services/tts/` | 语音输出适配 | `edge.py` + `minimax.py`；统一入口 `synthesize_speech` |
| `app/services/voice/` | 三处理器目录与测试 | `catalog.py` 能力标签；`stage_tests.py` 连通性；`credentials.py` 装配凭证 |
| `app/services/interview/` | 业务编排 | `runner.py` 是回合执行器；`agent.py` 是会话状态机；`followup.py` 是追问信号器；`tools.py` 注册 GitHub/公司/简历 function tools；**阶段元数据唯一源**为 `workflows.py`（`PhaseDef`），`constants.InterviewPhaseId` 仅约束 id |
| `app/services/github/` | GitHub 核验 | REST 客户端 + OpenAI tools 定义；语义对齐 MCP，面试/准备 Agent 共用 |
| `app/services/growth/` | 自我成长 | 候选人 GrowthRecord（报告路径）+ 系统 `system_learning.json` 聚合 |
| `app/services/rag/` | RAG 多后端 | `base.py` 定义 `RAGBackend` 协议；`factory.build_rag_backend` 按 `RAGBackendKind` 选型（local/stepfun/none）；`_kb_data.py` 为纯数据层（`COLLECTION_NAME` / `_build_documents` / `format_context`），被 `company_rag` / `local_backend` / 测试共用，无业务依赖，避免循环导入 |
| `app/services/rag/_kb_data.py` | RAG 纯数据层 | 集中持有 Chroma collection 名称、KB 文档构建、Chroma 目录解析、命中片段格式化；无业务依赖可被任一 RAG 后端与测试自由 import |
| `app/services/rag/local_backend.py` | 本地 Chroma RAG | 调用 LLM 提供商的 OpenAI 兼容 `/embeddings`；默认后端，向后兼容 |
| `app/services/rag/stepfun_backend.py` | StepFun 托管 RAG | 上传 KB 到 `vector_stores`，检索通过 chat 时 `tools[].type=retrieval` 由服务端完成 |
| `app/services/rag/company_rag.py` | 向后兼容包装器 | `CompanyKnowledgeRAG` 委托工厂选出的后端；保留旧 API 以兼容已有测试 |
| `app/agents/` | Agent 编排 | `orchestrator.py` 合并多源快照（视觉/追问信号）；`vision/agent.py` 面部状态；`prep/agent.py` 面试准备 Agent |
| `app/core/constants.py` | 全局协议常量 | 所有 `StrEnum`（`RAGBackendKind` / `SessionStatus` / `InterviewPhase` / `Personality` 等）+ 阈值（`RESUME_MAX_UPLOAD_BYTES` / `HEARTBEAT_TIMEOUT_SEC` / `TTS_QUEUE_MAX_SIZE`）；改名前后端须原子同步 |
| `app/services/seed.py` | 启动种子 | 仅写一次；幂等 |
| `app/core/` | 基础设施 | `security.py` / `secrets.py` / `logging.py` / `ratelimit.py` / `migrate.py`（列补全 + Alembic head 戳） |
| `backend/alembic/` | Schema 版本链 | 基线 revision；`alembic upgrade head` 与启动时 `run_migrations` 共用列迁移逻辑 |
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
  │  阶段1 识别：speech_recognize_handler（ASR / local）──► text
  │         （coming_soon native_audio → 回退 transcribe + 提示）
  │  Vision (FaceDetector) ──► face_analysis JSON
  │  拼装 user_text 或 user_turn_end 帧
  ▼
[InterviewRunner.stream_turn]  ← 阶段2 思考：文本 LLM（BYOK）
  │ 1) 追问信号分析 (followup.py)
  │ 2) RAG 检索 (company_rag.py / StepFun retrieval)
  │ 3) 上下文压缩 (context/manager.py)  超阈值时触发
  │ 4) Function calling 工具循环（GitHub / 公司 / 简历 / 面经搜索，最多 N 轮）
  │ 5) 组装 system prompt + 结构化记忆 + 历史 → LLM 流式
  │ 6) assistant_token / assistant_done（含情绪）
  ▼
[阶段3 播报：TTS Queue → 已配置播报处理者 / 仅字幕]  ──► tts_audio 帧
  ▼
[静默计时]  无新 partial → silence_timeout → 触发追问
  ▼
[结束] generate_report → GrowthRecord + system_learning.json
```

## 5. 安全边界（已实现）

| 风险点 | 当前实现 | 后续可扩展 |
|---|---|---|
| API Key 在 DB 明文 | `app/core/secrets.py` AES-256-GCM（依赖 `cryptography`），`enc:v2:<salt>:<nonce>:<tag>:<ct>`；AEAD 篡改拒绝；旧 `enc:v1:` 显式抛 `LegacySecretFormatError`；思考 / ASR / TTS 密钥分列加密 | KMS 托管 master |
| SSRF `api_base` | `is_safe_http_url` 多 A 记录遍历 + IPv6 字面量 + 端口白名单（80/443）；`app/services/llm/client.py` 进一步在出站 HTTP transport 层 DNS pin 解析结果（缓解 DNS rebinding TOCTOU）；dev 模式允许 loopback；本地 LLM 需额外 `INTERVIEWOS_ALLOW_LOCAL_LLM=1` 双重放行 | IP 黑/白名单；httpx transport 强制复用 pinned IP 防后续 re-resolve |
| 文件上传 | 10MB 流式上限 + 魔数嗅探（`%PDF-` / `PK\x03\x04` / OLE）+ `assert_within_dir` | 走对象存储（MVP 单机保留本地） |
| 限流 | `app/core/ratelimit.py` 滑动窗口；`INTERVIEWOS_TRUSTED_PROXY_CIDRS` 控制 X-Forwarded-For 信任 | 替换 Redis；按用户/IP 区分 |
| 日志脱敏 | `RedactFilter` 覆盖 `record.msg/args/exc_text` 三路径 | 全文加密（KMS） |
| WebSocket 拒绝服务 | 服务端 30s 心跳发 `server_ping`，客户端 5s 内须回 `pong`，3 次未回 graceful close；audio_buffer 5MB 上限；同一 session 仅允许一条活跃连接，新连接踢旧（`fix/ws-single-session-mutex`） | 能力令牌续签 / 心跳调参 |
| 路径穿越 | `sanitize_filename` + `assert_within_dir` 双保险 | — |
| CORS 滥用 | `allow_origins=['*']` + `allow_credentials=True` 启动即拒绝；`PATCH/HEAD` 显式放行；X-Request-Id 输入校验正则 | — |
| 错误响应不一致 | 统一 envelope `{error: {code, message, trace_id}}`；StarletteHTTPException / HTTPException / RequestValidationError / UnsafeURLError 共用 handler | — |
| 报告 SSE 双倍计费 | 报告流式接口复用 `generate_and_persist_report`，单次 LLM 完成生成与持久化（`fix/report-stream-single-llm`） | — |

## 6. 测试策略

- `backend/tests/` 共 26+ 个 `test_*.py`（另含 conftest/fakes），覆盖 Runner / Followup / RAG / Context / TTS Queue / WS / 三处理器管道 / Migrate / Secrets / Security / v1 路径 / 简历评价 / GitHub / LLM 重试 / 报告 SSE / 成长学习等；
- 新代码要求至少补 1 个单测；与 LLM 交互必须通过 `FakeLLMClient`；
- 测速脚本 `pytest -q`。

## 7. 扩展点（如何加新东西）

| 需求 | 改哪里 |
|---|---|
| 加一种 ASR / TTS 供应商 | `app/services/stt/` 或 `tts/` 适配器 + `voice/catalog.py` 能力标签；设置页自动出现 |
| 加一种面试工作流（System Design Round / Coding Round） | `app/services/interview/workflows.py` 注册即可；`options.workflow_types` 自动暴露 |
| 加一种追问信号维度 | `app/services/interview/followup.py` 新增分类 + 正则 |
| 加一种企业知识库 / KB 源 | `app/services/company/knowledge.py` 增加元数据；如需新 RAG 后端，实现 `RAGBackend` 协议 + 在 `app/services/rag/factory.py` 注册即可；`_kb_data.py` 持有与后端无关的纯数据/工具函数 |
| 加 GitHub / 外部核验工具 | `app/services/github/tools.py` 增加 tool definition + `execute_github_tool` 分支；面试侧自动暴露 |
| 加系统学习信号 | `app/services/growth/learning.py` 扩展 `record_interview_learning` 字段 |
| 加前端页面 | `frontend/src/app/<route>/page.tsx` + `src/lib/api.ts` 新方法 + `Sidebar.tsx` nav 数组 |
| 加前端事件类型 | 仅在 `src/types/index.ts` 增加 discriminated union 成员；所有 on() 回调自动收紧 |
| 加全局 Toast 类型 | 已在 `src/components/Toast.tsx` 注册；按需调用 `toast.success/error/...` |

## 8. 已知约束与未实现项

- **刻意不做多用户 / 账号体系**：本地单机单用户；`profile_id=1`；会话用 capability token + Cookie，无登录（详见 `SECURITY.md` §1）。
- **未实现叫号 / 排队大厅**：创建会话即可开始，不存在 `pending → called` 状态机。
- **未实现官方 MCP 传输**：GitHub 工具为 REST 客户端 + function tools，语义对齐常见 MCP；如需 stdio/HTTP MCP 适配器，可在 `app/services/github/` 上挂 adapter。
- **拟真人像为 CSS 矢量 SVG**：未引入 Live2D / 视频流；如需替换为 Live2D，可整体替换 `frontend/src/features/avatar/InterviewerAvatar.tsx`，对外接口（avatar_id/scene_id）保持稳定。
- **企业知识当前为内置 7 家硬编码 + RAG 抽象**：`app/services/company/knowledge.py` 维护字节/腾讯/阿里/美团/米哈游/OpenAI/Google 的样例问题与风格描述；`app/services/rag/` 提供 local Chroma / StepFun retrieval / none 三种 RAG 后端抽象，可按 `RAGBackendKind` 切换；尚未接入众包面经或自动爬虫（合规与项目所有者决策）。
- **未做 40–60 分钟实战压测**：压缩 + 结构化记忆机制已具备（`compress_messages` 30% 阈值 + `agent_state`），但仍需真实 LLM 长测优化摘要质量。
- **系统学习当前为「写入 + 展示」**：尚未自动反哺 system prompt / 题库策略。
- **SQLite**：单机部署为设计前提。
- **TLS / 反向代理**：默认 http；若对外暴露应在前置 Nginx/ALB 终止 HTTPS。
