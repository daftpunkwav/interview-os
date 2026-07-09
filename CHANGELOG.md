# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的语义化约定。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 安全（Security）
- `app/core/security.py`：新增 sanitize_filename / assert_within_dir / is_safe_http_url / redact_api_key
- `app/core/secrets.py`：API Key at-rest 加密（HMAC + XOR 流；PBKDF2 派生密钥）
- `app/core/ratelimit.py`：滑动窗口进程内限流器
- `app/core/logging.py`：结构化 JSON 日志 + RedactFilter 自动遮蔽 Authorization/Key
- `app/api/resume.py`：流式 10MB 上限 + 魔数嗅探 + 路径越界防御 + LLM 返回 ResumeAnalysis 强校验
- `app/api/settings.py`：`api_base` SSRF 防御；PROD 模式强制 https 公网
- 移除已泄露的 StepFun API Key（请相关协作方尽快在 StepFun 控制台轮换）

### 后端（Backend）
- 改用 Pydantic v2 风格强类型；runner.py 不再原样打印 user_text，改记长度
- 报告 SSE 错误信息脱敏
- LLMClient.chat 默认超时收紧到 60 秒；错误日志脱敏 API Key
- 启动器新增 trace_id 中间件
- **RAG 层多后端抽象**：新增 `RAGBackend` Protocol + `build_rag_backend` 工厂
  - `LocalEmbeddingRAG`：本地 Chroma + OpenAI 兼容 `/embeddings`（默认，向后兼容）
  - `StepFunRetrievalRAG`：StepFun 托管 `vector_stores`，检索通过 `tools[].type=retrieval` 在 chat 时由服务端完成
  - `RAGBackendKind.NONE`：关闭 RAG
  - `CompanyKnowledgeRAG` 退化为向后兼容包装器，公共 API 不变
- `LLMClient.embed()` 支持独立的 `LLM_EMBEDDINGS_BASE/KEY/MODEL`（未设置时回退 `LLM_*`）
- `LLMClient.chat/chat_stream` 新增可选 `tools` 参数，供 StepFun retrieval tool 注入

### 前端（Frontend）
- `src/types/index.ts`：新增 ServerEvent/ClientEvent/PREP/Report SSE discriminated union 与 REST 响应契约
- `src/lib/env.ts`：集中读取 NEXT_PUBLIC_* 并在生产强制缺失即抛错
- `src/lib/api.ts`：以 types 重写；ApiError 错误类；consumeSSE 通用解析器
- `src/features/media/useInterviewWS.ts`：on() 与装饰性 handlers 双 API；指数退避重连 5 次
- `src/components/Toast.tsx`：零依赖 Toast 模块
- `src/app/error.tsx`、`not-found.tsx`、`loading.tsx`：根级 Error Boundary/404/全局 loading
- tsconfig.json：开启 noUncheckedIndexedAccess / noImplicitOverride / noFallthroughCasesInSwitch

### 文档（Docs）
- 新增 `docs/ARCHITECTURE.md`、`docs/API.md`、`SECURITY.md`、`CONTRIBUTING.md`
- 刷新 `README.md`，补全 V2 全部模块
- 完整 `.env.example`（后端）/新增 `frontend/.env.example`

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
