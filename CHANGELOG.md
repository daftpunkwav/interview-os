# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的语义化约定。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 最近一次核对：2026-07-23（`main` 分支）。实现状态详见 [`DEVELOPMENT_PROGRESS.md`](./DEVELOPMENT_PROGRESS.md)。

## [Unreleased]

### 已修复（Agent 能力审查，2026-08）

- **激活结构化记忆刷新**：`InterviewAgent.refresh_system_memory()` 每回合刷新 system prompt 中的已问问题/薄弱点/GitHub 核验摘要，修复长会话压缩后重复提问（原 `build_turn_prompt` 死代码）
- **激活薄弱点记录**：追问触发时调用 `note_weak_point()`，`weak_points` 不再永远为空，自我成长记录生效
- **系统学习反哺 prompt**：`_system_learning_section()` 从 `get_system_insights()` 读取跨面试积累，在开场 prompt 注入公司历史均分与常见薄弱线索（PRD 4.7 第一阶段闭环）
- **followup 阶段感知**：`analyze()` 新增 `phase_id` 参数，反问/总结/寒暄阶段跳过 missing_data/tech_hole 规则，避免候选人提问时被要求"给出量化数据"
- **修正追问类别统计**：`followup_category_hits` 改为记录真实追问类别（vague/missing_data/tech_hole/off_topic），新增 `tool_call_counts` 单独记录工具调用（原名实不符）
- **反问环节公司代表 prompt**：`_advance_phase` 进入 reverse_qa 时注入专门 prompt（角色切换 + 公司资料 + 坦诚说明未覆盖内容）
- **Orchestrator 静默追问索引 bug**（A-12）：`idx` 改为 `(strictness-1)//4` 均匀映射，修复压力人格永远走温柔分支
- **`interview_style` 前后端枚举一致**（S-05）：枚举扩展为 guided/deep_dive/continuous/challenging，schema Literal 同步，消除 422

### 待整理

- 前端 `VideoPanel` 接入客户端实时人脸 / 表情检测（当前依赖前端可选上传 `face_analysis`）
- `system_learning.json` 并发写保护（threading.Lock / 迁 SQLite）

## [1.0.0] - 2026-07

> 本版本合并自 `feat/complete-platform-v1` 与若干 fix / refactor 分支；以 `main` 当前代码为准。

### 功能（Features）

- **GitHub 工具层** `app/services/github/`：REST 客户端 + OpenAI function tools（用户/仓库/README/commit/PR/Issue/文件/语言）；语义对齐常见 GitHub MCP，未走官方 MCP 进程传输
- **面试 Agent 工具循环**：`InterviewRunner._run_tool_rounds` 支持 GitHub / 公司知识 / 简历项目 / 面经搜索；无 tool_calls 时短路避免二次 LLM
- **富简历评价** `POST /api/v1/resume/{id}/analyze`：多维度 `ResumeAnalysis`（综合分 + 8 维分数 + ATS + 风险点 + 改写示例 + 预测题 + overall_narrative）；前端深度展示
- **简历删除** `DELETE /api/v1/resume/{id}`
- **档案扩展**：`UserProfile` 增加 `github_username` / `portfolio_url` / `linkedin_url` / `city` / `preferred_languages` / `career_highlights` / `open_to_remote` / `notice_period`
- **拟真人像**：`frontend/src/features/avatar/InterviewerAvatar.tsx` CSS SVG 半身像 + 口型/眨眼/情绪（smile/serious/neutral）；非 Live2D
- **系统自我成长**：`app/services/growth/learning.py` + `system_learning.json` + `GET /api/v1/reports/growth/system-insights`
- **结构化会话记忆**：agent_state 注入 system prompt（asked_questions / weak_points / github_findings / tool_trace）
- **Prep Agent 支持 GitHub**：ReAct 工具标记调用；同步 + SSE 流式双接口

### 安全（Security）

- `app/core/security.py`：新增 `sanitize_filename` / `assert_within_dir` / `is_safe_http_url` / `redact_api_key`
- `app/core/secrets.py`：API Key at-rest **AES-256-GCM**（`cryptography`），输出 `enc:v2:<salt>:<nonce>:<tag>:<ct>`；旧 `enc:v1:` 显式抛 `LegacySecretFormatError` 引导重设；生产需设置 `INTERVIEWOS_SECRET_KEY`
- `app/core/ratelimit.py`：滑动窗口进程内限流器；新增 `INTERVIEWOS_TRUSTED_PROXY_CIDRS` 控制 `X-Forwarded-For` 信任
- `app/core/logging.py`：结构化 JSON 日志 + `RedactFilter` 自动遮蔽 Authorization/Key
- `app/core/migrate.py`：`engine.begin()` 事务；新增 `tests/test_migrate.py` 覆盖幂等 + 异常回滚
- `app/api/resume.py`：流式 10MB 上限 + 魔数嗅探 + 路径越界防御 + LLM 返回 `ResumeAnalysis` 强校验 + 容错规范化
- `app/api/settings.py`：`api_base` SSRF 防御；PROD 模式强制 https 公网
- `app/api/router.py`：所有路径统一前缀 `/api/v1/*`；保留 3 个月 `/api/*` 兼容别名
- `app/services/llm/client.py`：4xx 不重试，5xx/429 指数退避最多 3 次；本地 LLM 需 `INTERVIEWOS_ALLOW_LOCAL_LLM=1`；**出站 transport 层 DNS pin** 缓解 DNS rebinding TOCTOU
- `app/realtime/ws_handler.py`：30s 心跳 `server_ping` → 客户端 5s 内 `pong`，3 次未回 graceful close；audio_buffer 5MB 上限；deadlock fallback 强制 turn_state 回 USER_SPEAKING；**同会话单连接，新连接踢旧**（`fix/ws-single-session-mutex`）
- 移除已泄露的 StepFun API Key（请相关协作方尽快在 StepFun 控制台轮换）

### 后端（Backend）

- 改用 Pydantic v2 风格强类型；`runner.py` 不再原样打印 user_text，改记长度
- **报告 SSE 单次 LLM 调用**（`fix/report-stream-single-llm`）：复用 `generate_and_persist_report`，避免双倍计费
- `LLMClient.chat` 默认超时收紧到 60 秒；错误日志脱敏 API Key
- 启动器新增 trace_id 中间件 + `X-Request-Id` 输入校验正则 `^[A-Za-z0-9_\-]{8,64}$` + 统一 error envelope `{error:{code,message,trace_id}}`（`StarletteHTTPException` / `HTTPException` / `RequestValidationError` / `UnsafeURLError` 共用 handler）
- **`INTERVIEWOS_ENV` 控制安全策略**：dev（loopback 允许）/ prod（https 公网）
- **`compress_messages` 默认阈值从 60% 降至 30%**；`estimate_messages_tokens` 支持 list 多模态 content
- **RAG 层多后端抽象**：`RAGBackend` Protocol + `build_rag_backend` 工厂
  - `LocalEmbeddingRAG`：本地 Chroma + OpenAI 兼容 `/embeddings`（默认，向后兼容）
  - `StepFunRetrievalRAG`：StepFun 托管 `vector_stores`，检索通过 `tools[].type=retrieval` 在 chat 时由服务端完成
  - `_NullRAG`（`RAGBackendKind.NONE`）：关闭 RAG
  - `CompanyKnowledgeRAG` 退化为向后兼容包装器，公共 API 不变
- `LLMClient.embed()` 支持独立的 `LLM_EMBEDDINGS_BASE/KEY/MODEL`（未设置时回退 `LLM_*`）
- `LLMClient.chat/chat_stream` 新增可选 `tools` 参数，供 StepFun retrieval tool 注入
- **RAG 模块拆分纯数据层**：新增 `app/services/rag/_kb_data.py`，把 `COLLECTION_NAME` / `_build_documents` / `_data_dir` / `format_context` 等无业务依赖的函数从 `company_rag.py` 抽出，避免上层模块相互导入
- **消除 RAG 循环导入**：`company_rag.py` / `local_backend.py` 改为直接从 `_kb_data` 导入所需函数，打破 `local_backend → company_rag → factory → local_backend` 循环链

### 前端（Frontend）

- `src/types/index.ts`：新增 `ServerEvent` / `ClientEvent` / `PREP` / `Report` SSE discriminated union 与 REST 响应契约
- `src/lib/env.ts`：集中读取 `NEXT_PUBLIC_*` 并在生产强制缺失即抛错
- `src/lib/api.ts`：以 types 重写；`ApiError` 错误类；`consumeSSE` 通用解析器；全部路径同步至 `/api/v1/*`
- `src/features/media/useInterviewWS.ts`：ref-synced handlers 避免重连；收到 `server_ping` 立即回 `pong`；指数退避重连 5 次
- `src/features/media/useAudioRecorder.ts`：getUserMedia 失败释放 stream；上限 chunk 丢弃
- `src/features/media/useTTSPlayer.ts`：上一段 audio 主动 release 避免叠加
- `src/components/Toast.tsx`：零依赖 Toast 模块
- `src/app/error.tsx` / `not-found.tsx` / `loading.tsx`：根级 Error Boundary / 404 / 全局 loading
- `src/components/effects/MagneticButton.tsx`：支持 `renderAs="a"`，避免 `<button><Link/></button>` 不合法嵌套
- `src/components/effects/FluidBackground.tsx` / `ParticleField.tsx`：首页非线性流体背景 + curl-noise 粒子场
- `src/components/layout/Sidebar.tsx`：配色统一
- `src/app/api/`：流式请求走 Next 同源代理（避免跨域 / 缓冲问题）
- `tsconfig.json`：开启 `noUncheckedIndexedAccess` / `noImplicitOverride` / `noFallthroughCasesInSwitch`

### 测试（Tests）

- 共 18 个测试文件（`backend/tests/`：`test_*.py` 16 个 + `conftest.py` / `fakes.py`）
- 覆盖：Runner / Followup / RAG（含多后端）/ Context 压缩 / TTS Queue / WS handler / Migrate / Secrets / Security（含 DNS rebinding）/ v1 路径 / 简历评价规范化 / GitHub 工具 / LLM 客户端重试 / 报告 SSE / 成长学习

### 文档（Docs）

- `DEVELOPMENT_PROGRESS.md`：**新增**当前开发进度报告（已实现什么、怎么实现、修改意见）
- `PROJECT_REPORT.md`：状态报告同步到 `main` 分支，标注部分实现 / 明确未做
- `docs/API.md`：REST 表全部走 `/api/v1/*`；新增 §1.2 Migration Guide v1.0 → v2.0；服务端事件补齐 `assistant_audio_*` / `server_ping` / `pong`
- `docs/ARCHITECTURE.md`：补充 DNS pin / WS 单会话单连接 / 报告 SSE 单次 LLM；新增 §8 已知约束与未实现项
- `SECURITY.md`：补 `INTERVIEWOS_ENV` 决策表 + `LegacySecretFormatError` 流程
- `README.md`：核心特性 / 技术栈 / 项目结构 / 开发 / 主要文档同步到当前实现状态

## [0.5.0] - 2026-06

### Added
- M5 全局微光 + Liquid Metal 视觉 / V2 Realtime Core
- TTS 串行队列、上下文压缩
- 企业知识库 RAG（Chroma）集成

## [0.3.0] - 2026-05

### Added
- M3 上下文压缩 + 报告流式 + TTS 队列
- M2 结构化追问信号分析器
- M1 InterviewRunner 抽取与 ws_handler 重构
- M0 测试骨架 + 启动幂等化

## [0.1.0] - 2026-04

### Added
- 初始 V1 实现：BYOK LLM、简历解析、模拟面试、报告
