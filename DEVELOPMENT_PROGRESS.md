# InterviewOS 当前开发进度报告

> 报告日期：2026-07-23
> 分支：`main`
> 报告范围：仓库当前 `main` 分支的实际代码状态（以代码为准）
> 权威设想：[`InterviewOS.md`](./InterviewOS.md) · [`docs/PRD/PRD.md`](./docs/PRD/PRD.md)

本报告回答三件事：

1. **已实现了什么**（按层 / 按页面 / 按能力）——只列在代码里能找到入口的能力；
2. **怎么实现的**——关键模块 + 实现路径 + 数据流；
3. **修改意见与下一步建议**——对未实现项、低优先级项、风险点的具体处置建议。

---

## 1. 已实现了什么（按能力域）

### 1.1 BYOK LLM 接入

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 设置 API Base / Key / Model | `GET/PUT /api/v1/settings/llm` | ✅ | Key 写入前 `encrypt_secret()`；支持 `"keep"` 占位 |
| 连通性测试 | `POST /api/v1/settings/llm/test` | ✅ | `LLMClient.test_connection()`，触发 SSRF 校验 |
| 协议层 OpenAI Chat Completions | `app/services/llm/client.py` | ✅ | `chat` / `chat_stream` / `chat_json` / `embed` / `test_connection` |
| 重试策略 | `LLMClient._request_with_retry` | ✅ | 4xx 不重试；5xx/429 指数退避最多 3 次 |
| 出站 DNS pin（防 rebinding TOCTOU） | `LLMClient._http_client` / `_pin_host_ip` | ✅ | 仅允许 80/443；loopback 需 `INTERVIEWOS_ALLOW_LOCAL_LLM=1` |
| 嵌入模型独立配置 | `LLM_EMBEDDINGS_BASE/KEY/MODEL` | ✅ | 未设置时回退 `LLM_*` |
| Function tools 注入 | `LLMClient.chat(..., tools=)` | ✅ | RAG retrieval tool 与面试 function tools 共用同一入口 |

### 1.2 个人档案与简历

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 自动创建档案（id=1） | `GET/PUT /api/v1/profile` | ✅ | 无注册登录，固定 `profile_id=1` |
| 扩展字段（GitHub/作品集/LinkedIn/城市/语言/亮点/远程/到岗） | `UserProfile` 模型 + schema | ✅ | 见 `backend/app/models/__init__.py:UserProfile` |
| 上传简历 | `POST /api/v1/resume/upload` | ✅ | 10MB 流式上限 + 魔数嗅探 + 路径越界 |
| 解析简历（PDF/DOCX/MD/TXT） | `app/services/resume/parser.py` | ✅ | LLM 解析失败时降级为 `summary=raw_text[:500]` |
| 激活 / 删除 | `POST /resume/{id}/activate` / `DELETE /resume/{id}` | ✅ | 激活用行锁互斥；删除同时尝试清理上传文件 |
| 多维度深度评价 | `POST /resume/{id}/analyze` | ✅ | `ResumeAnalysis`（综合分 + 8 维 + 预测题 + ATS + 改写示例 + 风险点 + 叙事）；强校验 + 容错规范化 |

### 1.3 面试准备 Agent

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 创建 / 同步 / 流式辅导 | `/api/v1/prep/sessions` | ✅ | `PrepAgent`（`app/agents/prep/agent.py`） |
| 工具集 | Prep Agent 内 `ReAct` | ✅ | `web_search`（DuckDuckGo）/ 公司知识 / quiz / `github_*` |
| 历史回溯 | `GET /prep/sessions/{id}/messages` | ✅ | 直接读 `messages` JSON 字段 |

### 1.4 面试会话与实时房间

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 配置面试 | `POST /api/v1/interview/sessions` | ✅ | `InterviewConfig`（岗位/职级/公司/工作流/人格/严格度/风格/人像/场景/简历） |
| 列出 / 详情 / 历史消息 | `GET /sessions`、`GET /sessions/{id}`、`GET /sessions/{id}/messages` | ✅ | |
| 同步开场 / 同步回合 | `POST /sessions/{id}/start`、`POST /sessions/{id}/message` | ✅ | 含面部 / 图像 base64 多模态字段 |
| 实时 WebSocket | `ws://.../api/v1/ws/interview/{session_id}` | ✅ | `app/realtime/ws_handler.py`，每会话单连接，新连接踢旧 |
| 提前结束 | `POST /sessions/{id}/finish` | ✅ | 幂等（已结束返回 `already_completed`） |

### 1.5 工作流与人格

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 工作流注册 | `app/services/interview/workflows.py` | ✅ | `technical` / `hr` / `management` 三种 |
| 人格 prompt | `PERSONALITY_PROMPTS` | ✅ | gentle / professional / pressure / hr / expert（5 种） |
| 风格 prompt | `STYLE_PROMPTS` | ✅ | guided / deep_dive / continuous / challenging（4 种，前端选项） |
| 严格度 prompt | `STRICTNESS_DESCRIPTIONS` | ✅ | 1–10 级 |
| 选项 API | `GET /api/v1/options` | ✅ | 由 `workflows.WORKFLOWS` 自动驱动 `workflow_types`，由 `AVATARS` / `SCENES` / `TTS_VOICES` 静态暴露 |

> ⚠️ 注意：后端 `InterviewConfig` schema 仅允许 `interview_style ∈ {"deep_dive", "concise"}`，与 `options.py` 中暴露给前端的 4 种风格不一致。前端 UI 实际可选范围以后端 schema 为准。

### 1.6 RAG（企业知识）

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| `RAGBackend` 协议 | `app/services/rag/base.py` | ✅ | `ensure_index` / `is_empty` / `query` / `query_for_company` |
| 本地 Chroma 后端 | `LocalEmbeddingRAG` | ✅ | 默认；走 LLM 的 OpenAI 兼容 `/embeddings`；数据来自 `BUILTIN_COMPANIES` |
| StepFun retrieval 后端 | `StepFunRetrievalRAG` | ✅ | 上传 KB 到 `vector_stores`，检索在 chat 时由服务端完成 |
| none 占位 | `_NullRAG` | ✅ | `RAGBackendKind.NONE` 时关闭检索 |
| 工厂 | `build_rag_backend` | ✅ | 按 `settings.rag_backend` 选择 |
| 数据层（避免循环导入） | `app/services/rag/_kb_data.py` | ✅ | `COLLECTION_NAME` / `_build_documents` / `_data_dir` / `format_context` |
| 兼容包装 | `CompanyKnowledgeRAG` | ✅ | 老 API 委托工厂选出的后端，保留测试兼容 |

### 1.7 GitHub 工具（MCP 语义）

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| REST 客户端 | `app/services/github/client.py` | ✅ | 60 req/h 未认证；配置 `GITHUB_TOKEN` 后 5000/h |
| 工具定义 | `app/services/github/tools.py` | ✅ | `github_get_user` / `list_repos` / `get_readme` / `list_commits` / `list_pulls` / `get_file` / `languages` |
| 面试 function calling 循环 | `InterviewRunner._run_tool_rounds` | ✅ | 最多 `INTERVIEW_MAX_TOOL_ROUNDS` 轮；无 tool_calls 时短路避免二次 LLM |
| Prep Agent 集成 | `PrepAgent` | ✅ | 标记调用 |

### 1.8 STT / TTS

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| Edge TTS | `app/services/tts/edge.py` | ✅ | `synthesize_to_base64` + 句子切分 + emotion 抽取 |
| Whisper STT | `app/services/stt/whisper.py` | ✅ | faster-whisper，本地 CPU；base 模型默认 |
| 串行 TTS 队列 | `app/realtime/ws_handler.py` | ✅ | `TTS_QUEUE_MAX_SIZE` 上限 |

### 1.9 追问与上下文压缩

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 结构化追问信号分析 | `app/services/interview/followup.py` | ✅ | 多类别分类 + 正则 |
| 上下文压缩 | `app/services/context/manager.py:compress_messages` | ✅ | 30% 阈值；保留全部 system + 最近 N 条 user/assistant |
| 多模态 token 估算 | `estimate_messages_tokens` | ✅ | 支持 list content |
| Agent state 注入 system prompt | `InterviewAgent` + `InterviewRunner` | ✅ | `asked_questions` / `weak_points` / `github_findings` / `tool_trace` |

### 1.10 视觉（拟真面试官）

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 面部状态 Agent | `app/agents/vision/agent.py` | ✅ | `VisionAgent.summarize(face_analysis)`，纯文本提示 |
| 视觉信息整合 | `app/agents/orchestrator.py` | ✅ | `InterviewOrchestrator.build_context_prefix` / `build_silence_nudge` |
| CSS 矢量面试官半身像 | `frontend/src/features/avatar/InterviewerAvatar.tsx` | ✅ | 3 种人像配置 + SVG 头像 + 嘴型 / 眨眼 / 情绪 |
| 视频面板 | `frontend/src/components/interview/VideoPanel.tsx` | ✅ | 摄像头取流（不含服务端实时检测） |
| 场景背景（SVG / 渐变回退） | `InterviewerAvatar` 内 `SCENES` / `SCENE_FALLBACK` | ✅ | `meeting_room` / `glass_office` / `online_interview` |

### 1.11 报告与成长

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 报告生成 | `app/services/interview/agent.py:generate_and_persist_report` | ✅ | 单次 LLM 完成 JSON 生成与持久化，避免双倍计费 |
| 流式报告（SSE） | `GET /api/v1/reports/{id}/stream` | ✅ | JSON 伪流式分片推送；`done` 携带完整 `report` |
| 报告详情 | `GET /api/v1/reports/{id}` | ✅ | 仅在 `session.report` 已生成时返回 |
| 候选人成长 | `GrowthRecord` 表 + `get_growth_history` | ✅ | 弱项聚合 + 训练计划（最近 20 条） |
| 系统自我成长 | `system_learning.json` + `get_system_insights` | ✅ | 跨面试聚合公司/岗位/工具命中/薄弱线索 |

### 1.12 前端页面与基础设施

| 能力 | 入口 | 状态 | 说明 |
|---|---|---|---|
| 根级 Error Boundary / 404 / loading | `app/error.tsx` / `not-found.tsx` / `loading.tsx` | ✅ | |
| 首页（流体感视觉） | `app/page.tsx` + `components/effects/*` | ✅ | `FluidBackground` / `ParticleField` / `StaggerContainer` / `AnimatedCounter` / `FadeInView` |
| 配置（设置） | `app/settings/` | ✅ | BYOK 表单 |
| 档案 | `app/profile/` | ✅ | 含扩展字段 |
| 简历管理 / AI 深度评价 | `app/resume/` | ✅ | |
| 准备辅导 | `app/prep/` | ✅ | 流式 + 思考过程折叠（`feat/prep`） |
| 面试配置 | `app/interview/page.tsx` | ✅ | |
| 实时面试房间 | `app/interview/[id]/page.tsx` | ✅ | WS Hook `useInterviewWS` |
| 报告 | `app/report/[id]/page.tsx` | ✅ | |
| 成长 / 历史 | `app/growth/` / `app/history/` | ✅ | |
| 强类型契约 | `src/types/index.ts` | ✅ | SSE / WS discriminated union + REST 响应 |
| 本地 API 代理 | `app/api/`（Next） | ✅ | 流式请求同源转发（`fix/frontend` 同源代理） |
| Toast / LoadError | `components/Toast.tsx` / `LoadError.tsx` | ✅ | 零依赖 |

---

## 2. 关键实现路径（怎么实现的）

### 2.1 实时面试主链路

```
浏览器
  └─ WS: ws://host/api/v1/ws/interview/{sid}  → InterviewWSHandler.handle
       ├─ STT（faster-whisper，PCM → text）
       ├─ 视觉（face_analysis → VisionAgent.summarize）
       ├─ 组装 user_text / user_turn_end 帧
       ▼
InterviewRunner.stream_turn
       1) 追问信号分析（followup.analyze）
       2) RAG 检索（CompanyKnowledgeRAG / StepFun retrieval tool）
       3) 上下文压缩（30% 阈值）
       4) Function tools 循环（GitHub / 公司 / 简历 / 面经搜索，最多 N 轮）
       5) 组装 system prompt + 结构化 agent_state → LLM 流式
       6) assistant_token / assistant_done（含 emotion）
       ▼
TTS Queue → Edge TTS → tts_audio 帧 → 浏览器 useTTSPlayer 播放
       ▼
[结束] /finish → generate_and_persist_report → GrowthRecord + system_learning.json
```

> 关键文件：`backend/app/services/interview/runner.py` `agent.py` `tools.py` `followup.py` `workflows.py`，`backend/app/realtime/ws_handler.py`。

### 2.2 上下文压缩与 Agent state

- `compress_messages(messages, max_tokens, threshold=0.3)`：
  - 总是保留全部 `system`；
  - 总 token 数 `> max_tokens * 0.3` 才触发；
  - user/assistant 仅保留最近 `keep_recent=20` 条；
  - 在 system 段追加 `[上下文压缩]` 说明。
- `agent_state` 写入 `InterviewSession.agent_state`（JSON），由 `InterviewAgent` 在每回合推进 `asked_questions` / `weak_points` / `tool_trace` 等字段；`_build_api_messages` 把这些结构化字段拼入 system prompt。

### 2.3 RAG 多后端

- 协议：`RAGBackend`（`runtime_checkable` Protocol）；
- 工厂：`build_rag_backend(llm, settings)` 按 `settings.rag_backend`（`local` / `stepfun` / `none`）选择；
- 数据层：`BUILTIN_COMPANIES`（7 家）→ `_build_documents` 切成 style/focus_areas/sample_question/flow 四类 Chroma 文档；
- StepFun 后端：检索通过 `tools[].type=retrieval` 在 chat 时由服务端完成（不走本地 Chroma）；
- 兼容包装：`CompanyKnowledgeRAG` 委托工厂选出的后端，公共 API 保持不变。

### 2.4 GitHub 工具调用

- `GitHubClient` 用 `httpx.AsyncClient` 直接调 `api.github.com`；
- `tools.py` 把 `get_user` / `list_repos` / `get_readme` / `list_commits` / `list_pulls` / `get_file` / `languages` 包装为 OpenAI function tool 格式；
- 面试 Runner 通过 `_run_tool_rounds` 最多 N 轮调用；无 tool_calls 时短路避免二次 LLM（首轮直接 stream）；
- Prep Agent 通过 ReAct 循环集成同一套工具。

### 2.5 BYOK 与安全

- API Key 入库前 `app/core/secrets.py:encrypt_secret`（AES-256-GCM + `cryptography`），格式 `enc:v2:<salt>:<nonce>:<tag>:<ct>`；
- 旧 `enc:v1:` 显式抛 `LegacySecretFormatError`，引导用户在设置页重设；
- `api_base` 入参经 `is_safe_http_url`（多 A 记录 + IPv6 + 端口白名单 80/443），PROD 强制 https 公网；
- `LLMClient._http_client` 在出站 transport 层 DNS pin 解析结果，缓解 DNS rebinding TOCTOU；
- 上传：`10MB` 流式上限 + `sanitize_filename` + `assert_within_dir` + 魔数嗅探（`%PDF-` / `PK\x03\x04` / OLE）；
- WebSocket：30s 服务端 ping → 客户端 5s 内回 pong，3 次未回 graceful close；同一 session 仅允许一条活跃连接，新连接踢旧；
- 错误响应统一 envelope `{error:{code,message,trace_id}}`（同时保留 `detail` 兼容）。

---

## 3. 关键数据模型（实现状态）

| 表 | 行示例 | 用途 |
|---|---|---|
| `user_profiles` | id=1 单行 | 档案（基础 + GitHub/作品集/LinkedIn/城市/语言/亮点/远程/到岗） |
| `llm_settings` | id=1 单行 | BYOK 配置；`api_key` 加密存储 |
| `resumes` | 多行；`is_active` 互斥 | 简历原文 + 解析 + 评价 |
| `interview_sessions` | 多行；`status` ∈ pending/active/completed | 面试会话（含 `agent_state` / `messages` / `report` JSON） |
| `prep_sessions` | 多行 | 辅导会话 |
| `growth_records` | 多行；按 `created_at desc` 取最近 20 | 候选人成长 |

迁移：`app/core/migrate.py` 在 lifespan 中调用 `engine.begin()` 事务执行；幂等且异常回滚。

---

## 4. 与权威设想 / PRD 的对照（差距清单）

| 设想（InterviewOS.md / PRD.md） | 当前状态 | 备注 |
|---|---|---|
| 用户注册登录 | ❌ 未做 | MVP 定位本地单机工具；`profile_id=1` 单行 |
| 摄像头面试 + 实时视频 | ⚠️ 部分 | `VideoPanel` 取流；服务端 `VisionAgent.summarize` 仅基于上传的 `face_analysis` JSON，**未做服务端实时人脸检测** |
| 提交简历 → AI 解析 | ✅ | 多维度评价 + ATS + 风险点 + 改写 |
| 按简历/岗位提问 + 追问 | ✅ | Runner + Followup（阶段感知）+ 工具循环；追问触发记录薄弱线索 |
| 候选人反问公司 | ✅ | `reverse_qa` 阶段 + **专门公司代表 prompt**（角色切换 + 公司资料 + 坦诚说明） |
| 态度 / 严厉度可调 | ✅ | 5 种人格 + 1–10 严格度 |
| 模拟字节 / 腾讯等 | ⚠️ 部分 | 7 家内置 + 风格描述；RAG 索引这些切片（local Chroma），但 **未接入真实面经数据** |
| 面经收集 | ❌ 未做 | 仅内置 + 公开面经搜索（duckduckgo）；不做爬虫 |
| BYOK | ✅ | AES-256-GCM |
| ≥40 分钟上下文 | ⚠️ 机制具备 | 30% 阈值压缩 + 结构化 agent_state；但 **未做真实长时压测**，摘要质量待打磨 |
| 工具调用 | ✅ | GitHub / 公司 / 简历 / 面经搜索 |
| GitHub MCP | ⚠️ 语义对齐 | REST 客户端 + function tools；**未走官方 MCP stdio/HTTP 传输** |
| 自我成长 | ✅ 双轨闭环 | 候选人（GrowthRecord）+ 系统（system_learning.json **反哺 system prompt**）；系统学习摘要注入开场 prompt |
| 多 workflow | ✅ | technical / hr / management |
| RAG 决策 | ✅ | 公司用 RAG（local Chroma / StepFun retrieval），简历 / GitHub 不用 |
| 拟真人像 + 真声 | ✅ | CSS 矢量 SVG + Edge TTS |
| 等待叫号 / 排队大厅 | ❌ 未做 | 创建会话即可开始，无 pending → called 状态机 |
| 40–60 分钟实战压测 | ❌ 未做 | 机制具备但无实证 |
| Live2D 视频人像 | ❌ 未做 | 当前为 CSS SVG |
| 面经众包上传 | ❌ 未做 | 仅有 web_search |
| 多用户鉴权 | ❌ 未做 | 单机单用户 |

---

## 5. 测试与质量

- 后端 `pytest -q`：`backend/tests/` 共 18 个测试文件（`test_*.py` 16 个 + `conftest.py` / `fakes.py`），覆盖 Runner / Followup / RAG（含多后端）/ Context 压缩 / TTS Queue / WS handler / Migrate / Secrets / Security / v1 路径 / 简历评价规范化 / GitHub 工具 / LLM 客户端重试 / 报告 SSE / 成长学习；
- 前端 `npx tsc --noEmit`：`noUncheckedIndexedAccess` / `noImplicitOverride` / `noFallthroughCasesInSwitch` 全开；
- `FakeLLMClient` 用于所有 LLM 交互测试（`tests/fakes.py`）。

---

## 6. 修改意见（对未实现 / 低优先级 / 风险项）

按"建议优先级"降序排列，每条均给出 **现状 → 风险 → 建议** 三段式。

### 6.1 面试风格 enum 不一致（schema vs options）—— ✅ 已修复（2026-08）

- **现状**：`backend/app/api/options.py` 暴露 4 种风格 `guided` / `deep_dive` / `continuous` / `challenging`，但 `app/schemas/__init__.py:InterviewConfig.interview_style` 仅允许 `deep_dive` / `concise`。
- **风险**：前端 UI 让用户选了 `guided` 之后 PUT 会被 Pydantic 422；用户体验与文档宣传不符。
- **已修复**：采用中期方案——`InterviewStyle` 枚举扩展为 4 种（移除未使用的 `concise`），`STYLE_PROMPTS` 已含全部 4 种模板，schema Literal 同步对齐。测试 `test_interview_style_options_match_schema` 断言 options 与 schema 一致。

### 6.2 实时面试中的服务端人脸检测

- **现状**：服务端 `VisionAgent` 仅接受客户端上传的 `face_analysis` JSON；浏览器侧 `VideoPanel` 只取流，**未做实时人脸 / 表情检测**。
- **风险**：文档 / 首页宣传"压迫感语音 + 表情联动"实际依赖客户端实现，如果客户端未启用 `face_analysis`，情绪与紧张度提示永远不会进入 system prompt。
- **建议**：
  1. 前端 `VideoPanel` 中接入一个轻量浏览器侧检测（如 `face-api.js` / `MediaPipe Face Landmarker`），把 `face_analysis` 写入每帧 `user_text` / `user_turn_end`；
  2. 后端记录 `face_analysis_source`（client vs none）到 `agent_state`，便于诊断"为什么模型没看到表情提示"。

### 6.3 拟真人像 Live2D 升级路径

- **现状**：CSS SVG 半身像 + 嘴型 / 眨眼 / 情绪；满足"拟真"基本门槛，但视觉表现力上限较低。
- **风险**：竞品中 Live2D 已是常见做法，"半身像"在未来 1–2 年视觉差异化会变弱。
- **建议**：
  1. 在 `frontend/src/features/avatar/` 下新增 `Live2DAvatar.tsx`，对外接口（`avatarId` / `emotion` / `audioB64`）与现有 `InterviewerAvatar.tsx` 对齐；
  2. 通过 `options.py` 增加 `engine: "svg" | "live2d"` 字段，控制渲染方式；
  3. 在初始化时按 `settings.avatar_engine` 延迟加载 Live2D SDK，避免不需要时拖慢首屏。

### 6.4 叫号 / 排队大厅

- **现状**：创建会话即开始；无 `pending → called` 状态机。
- **风险**：与 PRD §3.7 的"提交简历 → 等待叫号"叙述不一致；用户期待"候考氛围"。
- **建议**：
  1. `InterviewSession.status` 新增 `waiting` 状态（已存在 `pending` → 改名或复用）；
  2. 前端 `/interview/[id]` 渲染等待页（倒计时 + "面试官正在查看您的简历"提示）；
  3. 由用户手动点 "叫号开始" 或后端延时自动进入 `active`。

### 6.5 真实面经数据接入（合规边界）

- **现状**：仅有 7 家内置 + DuckDuckGo 搜索；项目所有者已明确不爬牛客 / 看准。
- **风险**：内置知识会过时；不同公司面经差异巨大，内置覆盖面不足。
- **建议**：
  1. 允许用户上传面经（PDF / Markdown）→ 走与简历相同的解析路径 → 写入 Chroma 的 `user_uploaded_experiences` 集合；
  2. 在 `RAG` 检索时合并内置 + 用户上传两个集合的命中；
  3. 用户上传的面经仅在本地落盘，不上报；明确告知用户。

### 6.6 系统学习的"自动改写 prompt"闭环 -- ✅ 第一阶段已修复（2026-08）

- **现状**：`system_learning.json` 记录了 `effective_probes` / `company_session_counts` / `avg_scores_by_company` 等，但**未**自动修改 prompt。
- **风险**：与文档宣传"系统自我成长"含义有差距。
- **已修复（第一阶段）**：`InterviewAgent._system_learning_section()` 从 `get_system_insights()` 读取跨面试积累数据，在开场 system prompt 注入两类信号：目标公司历史均分过低（<80）时提示加大考察力度；近期同公司/同岗位常见薄弱线索供针对性考察。`refresh_system_memory` 以记忆段落为分割点刷新，不误删系统学习摘要。
- **待办（第二/三阶段）**：表现最差的"公司 × 岗位 × 阶段"组合加入重点追问指令；memory 摘要反馈给用户（成长页 + 设置页可关闭）。

### 6.7 40–60 分钟实战压测

- **现状**：30% 阈值压缩 + `agent_state` 已就位；但无真实长时测试数据。
- **风险**：摘要质量与 token 控制经验不足，可能在长会话后期丢失关键事实。
- **建议**：
  1. 用真实 LLM 跑 40–60 分钟面试，逐回合记录 `agent_state` 大小 + `compress_messages` 触发频率；
  2. 调参 `keep_recent`（当前 20）与 `threshold`（当前 0.3），观察报告质量与 token 成本；
  3. 在 `tests/test_context_compress.py` 中加入长会话 fixture（模拟 ≥ 60 个回合）。

### 6.8 官方 MCP 传输

- **现状**：GitHub 工具为 REST 客户端 + function tools；语义对齐常见 GitHub MCP 工具。
- **风险**：未来若官方 MCP 协议修订，REST 客户端需手动跟进。
- **建议**：
  1. 在 `app/services/github/` 上增加 `mcp_adapter.py`，封装 stdio / HTTP MCP 客户端；
  2. 通过 `INTERVIEWOS_GITHUB_TRANSPORT` 环境变量选择 `rest` / `mcp_stdio` / `mcp_http`；
  3. 短期保留 REST 默认路径，避免引入新依赖。

### 6.9 多用户 / 鉴权

- **现状**：无登录，`profile_id=1` 单行；`SECURITY.md §1` 已声明。
- **风险**：公网部署立即泄漏所有人数据。
- **建议**：
  1. 短期：README / SECURITY 顶部加重警告；
  2. 中期：JWT + `Sec-WebSocket-Protocol: bearer.<jwt>`；
  3. 长期：`User` 表 + 会话归属 `profile_id`。

### 6.10 前端流式请求同源代理

- **现状**：`frontend/src/app/api/*` 路由代理流式请求到后端（避免跨域 / Next 缓冲）。
- **风险**：Next App Router 代理对长连接 / SSE 可能有差异；不同 Next 版本行为可能变化。
- **建议**：
  1. 把代理逻辑收敛到 `src/lib/api.ts` + `src/lib/env.ts` 的 `NEXT_PUBLIC_API_BASE`；
  2. 在文档中说明"开发 / 生产模式下分别走 Next 代理 / 直连后端"；
  3. 在 CI 中加一个"前端 dev 模式 → 后端 /v1/.../stream 连通性"冒烟用例。

### 6.11 系统学习文件并发写

- **现状**：`system_learning.json` 通过 `_load` / `_save` 同步读写，无文件锁。
- **风险**：FastAPI 单 worker 下尚可，多 worker / 并发 finish 会丢数据或损坏。
- **建议**：
  1. 短期：用 `threading.Lock` + 进程内互斥；
  2. 中期：迁移到 SQLite `system_events` 表，与 `growth_records` 同库；
  3. 长期：替换为外部存储（如 Redis Streams）。

---

## 7. 推荐的下一步优先级（基于上面的风险）

1. **P0（修一致性）**：~~6.1 面试风格 enum 收紧~~ ✅ 已修复；6.2 前端人脸检测接线；
2. **P1（补能力）**：6.4 叫号状态机；6.5 用户上传面经；6.7 长会话压测；
3. **P2（产品化）**：~~6.6 系统学习反哺 prompt（第一阶段）~~ ✅ 已修复；6.3 Live2D；6.8 MCP 适配器；
4. **P3（合规 / 部署）**：6.9 多用户鉴权；6.10 代理路径收敛；6.11 并发写。

> **2026-08 Agent 能力审查修复**（本次新增）：激活 `refresh_system_memory` 每回合刷新结构化记忆（防重复提问）；激活 `note_weak_point` 记录薄弱线索；系统学习洞察反哺开场 prompt；followup 阶段感知（反问/总结不触发技术追问）；修正 `followup_category_hits` 名实不符；反问环节专门公司代表 prompt；Orchestrator 静默追问索引 bug（A-12）；`interview_style` 前后端枚举一致（S-05）。共 8 项，新增 22 个测试，全量 216 passed。

---

## 8. 一句话总结

> 仓库当前在 `main` 分支，已具备 **BYOK + 多简历 + 实时面试（WS + STT + TTS + 拟真人像）+ 追问（阶段感知 + 薄弱线索记录）+ 压缩 + 结构化记忆每回合刷新 + 工具循环（GitHub）+ RAG（local/stepfun/none）+ 多 Workflow + 反问环节公司代表 prompt + 多维评价 + 报告 + 双重成长（系统学习反哺 prompt）** 的闭环。
> 主要缺口：**叫号大厅、Live2D、官方 MCP 传输、面经众包、多用户鉴权、40–60 分钟实战压测**。
> 这些不影响主路径演示，但需要在文档与代码中**明确标注为未实现**，避免后续贡献者按文档宣传反向误解项目状态。