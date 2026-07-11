# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的语义化约定。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 安全（Security）
- `app/core/security.py`：新增 sanitize_filename / assert_within_dir / is_safe_http_url / redact_api_key
- `app/core/secrets.py`：API Key at-rest 加密（HMAC + XOR 流；PBKDF2 派生密钥）
- `app/core/secrets.py`：**升级为 AES-256-GCM（`cryptography`）**，输出 `enc:v2:<salt>:<nonce>:<tag>:<ct>`；旧 `enc:v1:` 显式抛 `LegacySecretFormatError`
- `app/core/ratelimit.py`：滑动窗口进程内限流器；新增 `INTERVIEWOS_TRUSTED_PROXY_CIDRS` 控制 X-Forwarded-For 信任
- `app/core/logging.py`：结构化 JSON 日志 + RedactFilter 自动遮蔽 Authorization/Key
- `app/core/migrate.py`：`engine.begin()` 事务；新增 `tests/test_migrate.py` 覆盖幂等 + 异常回滚
- `app/api/resume.py`：流式 10MB 上限 + 魔数嗅探 + 路径越界防御 + LLM 返回 ResumeAnalysis 强校验
- `app/api/settings.py`：`api_base` SSRF 防御；PROD 模式强制 https 公网
- `app/api/router.py`：所有路径统一前缀 `/api/v1/*`；保留 3 个月 `/api/*` 兼容别名
- `app/services/llm/client.py`：4xx 不重试，5xx/429 指数退避最多 3 次；本地 LLM 需 `INTERVIEWOS_ALLOW_LOCAL_LLM=1`
- `app/realtime/ws_handler.py`：30s 心跳 + 累计 3 次失败 graceful close；audio_buffer 5MB 上限；deadlock fallback 强制 turn_state 回 USER_SPEAKING
- 移除已泄露的 StepFun API Key（请相关协作方尽快在 StepFun 控制台轮换）

### 后端（Backend）
- 改用 Pydantic v2 风格强类型；runner.py 不再原样打印 user_text，改记长度
- 报告 SSE 错误信息脱敏
- LLMClient.chat 默认超时收紧到 60 秒；错误日志脱敏 API Key
- 启动器新增 trace_id 中间件 + `X-Request-Id` 输入校验正则 + 统一 error envelope
- **`INTERVIEWOS_ENV` 控制安全策略**：dev (loopback 允许) / prod (https 公网)
- **`compress_messages` 默认阈值从 60% 降至 30%**；`estimate_messages_tokens` 支持 list 多模态 content
- **RAG 层多后端抽象**：新增 `RAGBackend` Protocol + `build_rag_backend` 工厂
  - `LocalEmbeddingRAG`：本地 Chroma + OpenAI 兼容 `/embeddings`（默认，向后兼容）
  - `StepFunRetrievalRAG`：StepFun 托管 `vector_stores`，检索通过 `tools[].type=retrieval` 在 chat 时由服务端完成
  - `RAGBackendKind.NONE`：关闭 RAG
  - `CompanyKnowledgeRAG` 退化为向后兼容包装器，公共 API 不变
- `LLMClient.embed()` 支持独立的 `LLM_EMBEDDINGS_BASE/KEY/MODEL`（未设置时回退 `LLM_*`）
- `LLMClient.chat/chat_stream` 新增可选 `tools` 参数，供 StepFun retrieval tool 注入
- **RAG 模块拆分纯数据层**：新增 `app/services/rag/_kb_data.py`，把 `COLLECTION_NAME` / `_build_documents` / `_data_dir` / `format_context` 等无业务依赖的函数从 `company_rag.py` 抽出，避免上层模块相互导入
- **消除 RAG 循环导入**：`company_rag.py` / `local_backend.py` 改为直接从 `_kb_data` 导入所需函数，打破 `local_backend → company_rag → factory → local_backend` 循环链

### 前端（Frontend）
- `src/types/index.ts`：新增 ServerEvent/ClientEvent/PREP/Report SSE discriminated union 与 REST 响应契约
- `src/lib/env.ts`：集中读取 NEXT_PUBLIC_* 并在生产强制缺失即抛错
- `src/lib/api.ts`：以 types 重写；ApiError 错误类；consumeSSE 通用解析器；全部路径同步至 `/api/v1/*`
- `src/features/media/useInterviewWS.ts`：ref-synced handlers 避免重连；收到 `server_ping` 立即回 `pong`；指数退避重连 5 次
- `src/features/media/useAudioRecorder.ts`：getUserMedia 失败释放 stream；上限 chunk 丢弃
- `src/features/media/useTTSPlayer.ts`：上一段 audio 主动 release 避免叠加
- `src/components/Toast.tsx`：零依赖 Toast 模块
- `src/app/error.tsx`、`not-found.tsx`、`loading.tsx`：根级 Error Boundary/404/全局 loading
- `src/components/effects/MagneticButton.tsx`：支持 `renderAs="a"`，避免 `<button><Link/></button>` 不合法嵌套
- tsconfig.json：开启 noUncheckedIndexedAccess / noImplicitOverride / noFallthroughCasesInSwitch

### 测试（Tests）
- 新增 `tests/test_migrate.py`（幂等/缺失表/异常回滚）
- 新增 `tests/test_security_extra.py`（DNS rebinding 多 A 记录/端口/URL 解析）
- 扩展 `tests/test_context_compress.py`（30% 阈值触发 + 多模态 list content 估算）
- 现有 `tests/test_*` 一并加固（v1 paths / WS 心跳 / LLM client 重试）

### 文档（Docs）
- `docs/API.md`：REST 表全部走 `/api/v1/*`；新增 §1.2 Migration Guide v1.0 → v2.0
- `docs/ARCHITECTURE.md §5`：AES-256-GCM / SSRF 多 A 记录 / WS 心跳 / 限流可信代理
- `SECURITY.md`：补 `INTERVIEWOS_ENV` 决策表 + `LegacySecretFormatError` 流程
- `README.md`：安全 & 工程段落重写（AES-GCM / 30% 阈值 / 统一 envelope）

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
