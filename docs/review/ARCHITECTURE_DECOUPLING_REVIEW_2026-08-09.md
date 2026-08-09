# InterviewOS 架构脱耦审查报告 v3（2026-08-09）

> **审查日期**：2026-08-09（v3 扩展版，取代同日 v2）
> **v3 相对 v2 的增量**：新增**错误码体系**审查（问题族 E6，见 §8、§12.6），错误码完整规范与逐站点迁移表独立成文 → [`docs/ERROR_CODES.md`](../ERROR_CODES.md)；路线图扩展至 PR-11。
> **v2 相对 v1 的增量**：新增**启动时脱耦**审查（第 5、7、11 章，问题族 S1-S4）与**企业级韧性缺口**审查（第 8、12 章，问题族 E1-E5），目标架构、路线图、故障注入矩阵同步扩展。
> **审查范围**：`backend/app` 全部 100+ Python 文件（import 全量扫描 + 核心链路逐行通读）、启动路径（模块 import 副作用 + lifespan 引导全步骤）、前端 `src/lib/api.ts`、openwiki 架构页
> **验证状态声明**：import 依赖、文件行号、代码片段均为**已核实（verified）**；测试套件**未运行**（沿用 2026-08-04 审查的 269/273 通过基线，每个改动项都附了必须执行的验证命令）
> **本报告只含分析与改动指南，未对任何代码做修改。**

---

## 0. 给执行者的话（先读这里）

这份报告面向"可能完全不了解本项目"的执行者（人或 AI）。每一项改动都包含：

1. **为什么改** —— 耦合路径与真实会发生的故障/维护场景；
2. **改动位置** —— 精确的 文件路径:行号；
3. **改前代码 / 改后代码** —— 可直接复制的完整片段；
4. **影响面排查命令** —— Windows cmd 下可直接运行的 `rg` 命令；
5. **验证步骤** —— 具体的 pytest 命令与手工故障注入方法。

**严格遵守以下纪律：**

- 按第 13 章的 PR 路线顺序实施，每个 PR 独立验证通过后再做下一个；
- 不要顺手重构任何与本报告无关的代码（scope creep 是本项目 AGENTS.md 明令禁止的）；
- 测试命令（来自 `openwiki/development.md`）：后端测试在 `backend/` 目录下执行 `python -m pytest -q`；集成测试在仓库根执行 `python -m pytest test/ -q`（需先启动后端）；
- 任何一步验证失败：停下来，把失败输出完整保留并报告，不要静默绕过。

---

## 1. 结论摘要（TL;DR）

### 1.1 核心诉求对账

| 诉求 | 现状结论 | 证据 |
| --- | --- | --- |
| 简历分析坏了，不影响面试（运行时） | **已满足**：运行时无调用关系，双侧均有降级 | §4.1 |
| 面试坏了，不影响简历深度分析（运行时） | **已满足** | §4.2 |
| 各服务**启动时**脱耦 | **未满足**：引导步骤单体化（一步炸全站起不来）、迁移失败"带病启动"、import 时副作用建引擎、RAG 按连接重建 | §5、§7 |
| 架构企业级、经得起考验和冲击 | **部分满足**：超时/重试/降级/限流齐备；缺熔断、并发舱壁、就绪探针、SQLite 并发加固 | §8 |
| 前端友好错误处理（中文说明 + 错误码，便于排查定位） | **未满足**：后端 code 为通用 `http_*`、WS/SSE 错误帧无 code、前端 `ApiError` 丢弃 code/trace_id | §8-E6 |

### 1.2 总体评分

| 维度 | 评分(10) | 说明 |
| --- | --- | --- |
| 运行时故障隔离 | **8.5** | RAG/工具/搜索/学习沉淀/简历解析全部有降级路径；仅 REST 报告生成一处故障放大（C3） |
| **启动时故障隔离** | **5.0** | 引导单体化；迁移失败静默带病；RAG 实例化与连接生命周期绑定（S1-S4） |
| 包级依赖方向 | **6.5** | `agents ↔ realtime` 包级环（C1）；`agents/prep` 依赖 `services/interview` 内部（C2） |
| 域边界（简历/面试/准备/成长） | **6.0** | 3 处直读简历表、1 处直写成长表、工具循环双实现 |
| 韧性工程（熔断/舱壁/探针） | **4.5** | 有重试与超时，但无熔断（宕机时每次调用卡 ~3.5s+ 才报错）、无并发舱壁、无 ready 探针、SQLite 默认 journal |
| 错误可观测性（错误码/前端友好） | **3.5** | 中文 message 与 trace_id 已有；但 code 通用无语义、WS/SSE 无码、前端丢弃 code/trace_id，无处置建议（E6） |
| 可拓展性 | **8.0** | RAG 工厂、STT/TTS 供应商目录、workflow 注册表是良好扩展点 |

### 1.3 问题清单总览（三族）

**结构耦合族 C（运行时/维护期）**：

| 编号 | 严重度 | 一句话 | 章节 |
| --- | --- | --- | --- |
| C1 | P0 | `app/agents` 与 `app/realtime` 包级环：`SessionSnapshot` 放错了层 | §10.1 |
| C2 | P0 | `agents/prep` 复用 `services/interview` 的内部函数 `parse_tool_arguments` | §10.2 |
| C3 | P0 | REST `send_message` 把报告生成绑进回合请求，报告故障 = 回合故障 | §10.3 |
| C4 | P1 | 面试/准备域 3 处直读简历表，各自重复 JSON 解析与降级逻辑 | §10.4 |
| C5 | P1 | 工具调用循环在面试域与准备域各写一份，逻辑漂移风险 | §10.5 |
| C6 | P1 | 实时层亲手组装面试运行时，装配知识泄漏到网关层 | §10.6 |
| C7 | P2 | 面试报告模块直接构造 `GrowthRecord` 写成长域的表 | §10.7 |
| C8 | P2 | 5 处模块级 `settings = get_settings()` import 时固化配置 | §10.8 |
| C9 | P2 | 仓库卫生：重构脚本残留、111+ 个 `chroma_*` 空目录、审计/调试文件 | §10.9 |

**启动耦合族 S（启动时）**：

| 编号 | 严重度 | 一句话 | 章节 |
| --- | --- | --- | --- |
| S1 | P0 | RAG 后端按 WS 连接/请求实例化：`LocalEmbeddingRAG` 每次连接重开 Chroma `PersistentClient` | §11.1 |
| S2 | P1 | 启动引导单体化：`init_db + 迁移 + 种子` 一个函数包揽，无分步失败语义、无启动摘要 | §11.2 |
| S3 | P1 | 迁移失败按表静默吞掉，应用"带病启动"（注意：有测试明确断言该行为，改动需同步改测试） | §11.3 |
| S4 | P2 | `database.py` import 时即建引擎（模块级 `engine = get_engine()`），import 副作用 | §11.4 |

**企业级韧性族 E（考验与冲击）**：

| 编号 | 严重度 | 一句话 | 章节 |
| --- | --- | --- | --- |
| E1 | P0 | SQLite 未开 WAL / busy_timeout：WS 每回合写库 + 后台报告 + REST 并发下有 `database is locked` 风险 | §12.1 |
| E2 | P1 | LLM 出口无熔断：提供商宕机时每次调用都走完 3 次指数退避（数秒到十数秒）才报错，且反复重试放大冲击 | §12.2 |
| E3 | P1 | LLM 并发无舱壁：简历深分析（180s 超时）/后台报告/实时回合共抢同一出口，后台可饿死实时 | §12.3 |
| E4 | P1 | 只有静态 `/health`，无就绪探针：子系统降级状态对外不可见 | §12.4 |
| E5 | P2 | 面试工具执行无超时（prep 域有 18s），GitHub/搜索慢时会拖住整个回合 | §12.5 |
| E6 | P1 | 无业务错误码体系：REST code 通用 `http_*`、WS/SSE 错误帧无码、前端丢弃 code/trace_id，排查定位靠翻日志 | §12.6 |

**明确不做的**（防止过度设计）：不拆微服务、不引入消息队列/事件总线、不引入外部缓存/Redis、不重写 WS mixin 类型契约（上次审查已知 mypy 222 错，属另一专题）、不把 SQLite 换库。本项目定位是**本地优先单进程应用**，进程内共享（注册表、锁、限流）是有意取舍，见 §9.3。

---

## 2. 审查范围与方法

### 2.1 已核实的证据来源

1. **全量 import 扫描**（命令：`rg -n --no-heading "^(from|import) app\." backend/app -g "*.py"`），覆盖 `agents/`、`api/`、`realtime/`、`services/` 四个包，结果去重后构成附录 A 的依赖矩阵；
2. **逐行通读**（25 个文件，合计约 5500 行）：
   - 简历链：`api/resume.py`(551 行)、`services/resume/parser.py`(99 行)
   - 面试链：`services/interview/{agent,runner,streaming_consumer,tool_round_runner,tools,prompt_assembler,report}.py`
   - 实时链：`realtime/{ws_handler,connection_lifecycle,turn_coordinator,turn_control,turn_streaming,voice_pipeline,hint_service,report_scheduler,events,session_registry}.py`
   - 编排链：`agents/{orchestrator,prep/agent,vision/agent}.py`
   - 启动链：`main.py`(319 行)、`database.py`(109 行)、`core/migrate.py`(187 行)、`services/seed.py`(37 行)、`tests/test_migrate.py`（断言扫描）
   - 基础设施：`services/llm/client.py`(594 行)、`services/rag/*`（含 `local_backend.py`、`stepfun_backend.py` 构造路径）、`services/stt/whisper.py`、`services/growth/learning.py`、`config.py`、`models/__init__.py`
3. **启动路径专项**：模块 import 时副作用逐个登记（第 5 章）；lifespan 每一步的失败语义逐个核实。
4. **openwiki 分层声明比对**（`openwiki/architecture/overview.md` 的"模块依赖收敛"一节）。

### 2.2 审查聚焦的问题

- 包与包之间的 import 方向是否符合分层声明；
- 一个域的故障（异常、超时、数据损坏）是否会传播到另一个域——**运行时**与**启动时**两个维度；
- 外部依赖（LLM/ASR/TTS/搜索/GitHub）受冲击时，系统是否快速失败、自动恢复、互不抢占；
- 改一个域的代码时，是否会被迫改动另一个域（维护耦合）。

---

## 3. 现状架构总览

### 3.1 业务域清单

| 域 | 代码位置 | 入口 | 状态存储 |
| --- | --- | --- | --- |
| 简历（上传/解析/AI 深度评价） | `services/resume/` + `api/resume.py` | REST `/api/v1/resume/*` | `resumes` 表 + `uploads/` 文件 |
| 面试（实时对话） | `services/interview/` + `realtime/` + `api/interview.py` | WS `/api/v1/ws/interview/{id}` + REST `/api/v1/interview/*` | `interview_sessions` 表（含 messages/agent_state JSON） |
| 面试准备（辅导 agent） | `agents/prep/` + `api/v1/prep.py` | REST/SSE `/api/v1/prep/*` | `prep_sessions` 表 |
| 报告与成长沉淀 | `services/interview/report.py` + `services/growth/` + `api/reports.py` | REST `/api/v1/reports/*` | `interview_sessions.report`、`growth_records` 表、`data/system_learning.json` |
| 企业知识库 RAG | `services/rag/` | 被面试域调用（无独立入口） | `data/chroma/`（正确路径）+ 启动时建索引 |
| 共享基础设施 | `services/llm/`、`services/stt/`、`services/tts/`、`services/voice/`、`services/search/`、`services/github/`、`services/company/`、`services/context/` | 无独立入口 | `llm_settings` 表（单行 id=1） |

### 3.2 实测依赖方向（import 扫描，附录 A 全量）

```
api ──► services ──► core / models / schemas / config        ✅ 符合声明
realtime ──► services/{interview,llm,stt,tts,voice}          ✅ 网关只编排
realtime ──► agents/{orchestrator,vision}                    ✅ 方向正确（上层调下层）
agents ──► services/{company,context,github,llm,search}      ✅ 方向正确
agents/orchestrator ──► realtime/events (SessionSnapshot)    ❌ 方向倒挂（C1）
agents/prep ──► services/interview/tools                     ❌ 跨域内部复用（C2）
services/rag/_kb_data ──► services/company/knowledge         ⚠️ 可接受（数据下沉，方向合理）
services/interview ──► models.Resume（直读简历表）            ⚠️ 域边界渗漏（C4）
services/interview/report ──► models.GrowthRecord（直写成长表）⚠️ 域边界渗漏（C7）
```

### 3.3 运行时数据流（已核实）

- **简历深度分析**：`POST /resume/{id}/analyze` → 联网检索（失败可跳过）→ `LLMClient.chat_json` → 容错规范化 → `ResumeAnalysis` 校验 → 写 `resumes.analysis`。全程不触碰面试域任何代码。
- **面试回合**：WS `user_turn_end` → STT（云端失败回退本地 Whisper）→ `InterviewRunner.stream_turn` → 追问分析（纯本地规则）→ RAG 检索（失败返 None）→ 工具循环（工具异常转为字符串结果）→ LLM 流式 → TTS 队列（失败仅记日志）。全程不触碰简历解析/评价代码，只在开场 prompt 构建时**读一次** `resumes` 表。
- **报告**：WS 路径后台任务生成；REST 路径在 `send_message`/`finish` 内生成；报告页 `/reports/{id}/stream` 可独立补生成（有哨兵 CAS 防双打）。

---

## 4. 运行时故障隔离：已经做对的部分（逐条 verified）

### 4.1 简历分析故障 → 面试：不传播

| # | 隔离机制 | 位置（文件:行号） |
| --- | --- | --- |
| 1 | 简历 LLM 解析失败 → 降级为基础 profile（`CandidateProfile(summary=raw_text[:500])`），上传仍成功 | `backend/app/services/resume/parser.py:94-99` |
| 2 | 面试域读简历时 JSON 损坏 → `get_candidate` 返回 `None`，开场 prompt 按"无简历"继续 | `backend/app/services/interview/agent.py:150-159` |
| 3 | 简历列表接口单条 JSON 损坏 → 该条降级空 profile，接口不 500 | `backend/app/api/resume.py:256-274` |
| 4 | 深度评价联网检索失败 → 仅记 warning，评价继续 | `backend/app/api/resume.py:487-496` |
| 5 | 深度评价 LLM 失败 → 该端点 502，与面试 WS 无任何共享运行时状态 | `backend/app/api/resume.py:502-515` |
| 6 | 面试工具 `lookup_resume_projects` 查不到简历 → 返回 `{"error": "no_resume_bound"}` 字符串，回合继续 | `backend/app/services/interview/tools.py:128-133` |

**运行时调用关系核实**：面试域（`services/interview/*`）对简历域（`services/resume/*`）的 import 为 **0**（附录 A）。两者唯一的接触面是共享数据库里的 `resumes` 表——这正是 C4 要收口的点，但它是"读数据"耦合，不是"调用"耦合，故障不会双向传播。

### 4.2 面试服务故障 → 简历深度分析：不传播

| # | 隔离机制 | 位置 |
| --- | --- | --- |
| 1 | 简历分析不 import 面试域任何模块（`api/resume.py` 只依赖 `services/resume` + `services/llm`） | `backend/app/api/resume.py:41-42` |
| 2 | 面试 WS 全面异常 → 只关闭该 WS 连接（`_fail_and_close` / 主循环 catch） | `backend/app/realtime/connection_lifecycle.py:112-124, 296-309` |
| 3 | 面试 LLM 流式失败 → 只产出 `StreamEvent.make_error("面试官服务暂时不可用")`，不崩进程 | `backend/app/services/interview/streaming_consumer.py:111-113, 251-253, 332-334` |
| 4 | 进程内限流按 key 分桶 + client_id 区分：WS 用 `ws-{session_id}`，HTTP 用客户端 IP，互不占额度 | `backend/app/realtime/connection_lifecycle.py:368-374`；`backend/app/core/ratelimit.py` |

### 4.3 面试内部的次级故障隔离（也已具备）

- **RAG 实例化失败** → `rag=None` 无 RAG 模式继续：`realtime/connection_lifecycle.py:167-173`
- **RAG 检索失败** → warning + `None`，不注入 prompt：`services/interview/tool_round_runner.py:67-69`
- **RAG 启动建索引失败** → 不阻断应用启动：`main.py:137-141`
- **工具执行异常** → 转为 `"工具执行失败: ..."` 字符串喂回 LLM：`services/interview/tool_round_runner.py:181-184`
- **GitHub/搜索工具失败** → 工具结果含 `error` 字段，LLM 继续：`services/interview/tools.py:156-165`；`services/search/web.py:108-120`（ddgs 双后端 + 旧包回退 + `SEARCH_UNAVAILABLE` 兜底文案）
- **系统学习文件损坏/读取失败** → 面试 prompt 少一段摘要，继续：`services/interview/agent.py:168-174`；学习写入失败被吞：`services/interview/report.py:303-308`
- **Prep 工具超时** → 18s `asyncio.wait_for` + `SEARCH_UNAVAILABLE` 兜底文案：`agents/prep/agent.py:164-192`
- **STT 云端失败** → 回退本地 Whisper（`SttResult.fallback` 通知前端）：`realtime/turn_coordinator.py:222-242`
- **TTS 队列** → 有界队列（50 句）丢旧保新，单句合成失败只记日志：`realtime/voice_pipeline.py:85-100`
- **Whisper 不可用/转写失败** → 返回空串，走"未识别请重说"路径：`services/stt/whisper.py:28-35, 83-85`

### 4.4 运行时唯一的故障传播漏洞

REST `send_message` 在 `is_complete=True` 时**同步**生成报告，报告失败会让整个回合请求返回 502——用户最后一个回答明明已被处理、面试官回复已生成并落库，但前端看到的是"请求失败"。WS 路径没有这个问题（报告在后台任务，失败只发一条 error 消息）。**这就是 C3（§10.3）**。

---

## 5. 启动路径审查（v2 新增）

用户要求"启动时也要脱耦"。本章把启动全过程拆开，逐步登记**触发时机、失败语义、是否影响其它子系统**。

### 5.1 模块 import 时副作用清单（`import app.xxx` 即执行的代码）

| # | 位置 | 副作用 | 失败后果 | 评价 |
| --- | --- | --- | --- | --- |
| 1 | `backend/app/database.py:85-86` | `engine = get_engine()` + `SessionLocal = get_session_factory()`——**import 即建引擎/会话工厂** | DATABASE_URL 异常时 import 即炸，且测试必须"setenv 之后再导入"（注释自承已咬过人） | ❌ S4 |
| 2 | `backend/app/main.py:44-46` | `configure_logging()` + `settings = get_settings()` | `.env` 校验失败（如 prod+allow_local_llm）import 即炸 | ✅ 合理（prod fail-fast） |
| 3 | `backend/app/main.py:193, 211` | import 时执行 `_check_cors_policy` / `_check_secret_key_policy` | prod 通配 CORS / 缺 SECRET_KEY 时 import 即 `RuntimeError` | ✅ 合理（安全门禁 fail-fast，保留） |
| 4 | `api/resume.py:46`、`realtime/connection_lifecycle.py:39`、`realtime/ws_handler.py:59`、`realtime/voice_pipeline.py:19` | 模块级 `settings = get_settings()` | 运行期改配置不生效；monkeypatch 需抢 import 前 | ⚠️ C8（结构性问题，非启动崩溃） |
| 5 | `services/llm/client.py:130-132` | `_is_local_allowed()` 每次调用重算 settings | — | ✅ 正确姿势（说明 4 的坑真实存在过） |
| 6 | `services/rag/local_backend.py:35` | `import chromadb` 延迟到首次实例化 | — | ✅ 正确姿势 |

### 5.2 lifespan 引导步骤的失败语义矩阵（`main.py:63-141`）

```
lifespan 启动顺序：
  1. Path(settings.upload_dir).mkdir(...)                    [main.py:70]
  2. asyncio.to_thread(_bootstrap_db_and_seed)               [main.py:71]
       ├─ init_db()            建表                          [main.py:100]
       ├─ run_migrations(engine)  列补全 + alembic 戳        [main.py:101]
       └─ seed_llm_settings(db)  环境变量 → LLMSettings 种子 [main.py:104]
  3. _ensure_rag_index(rag_db)  RAG 索引                     [main.py:73-80]
```

| 步骤 | 失败时当前行为 | 问题 |
| --- | --- | --- |
| 1. 建上传目录 | 异常直接抛出 → **整个应用启动失败** | 它是文件系统操作，理应 CRITICAL（简历上传是核心功能），fail-fast 可接受；但与 2 捆在同一线性流程里，无独立报告 |
| 2a. init_db / 建表 | 异常抛出 → **启动失败** | DB 是 CRITICAL，fail-fast 正确 |
| 2b. 列迁移 | **按表 try/except 吞掉，仅记 error 日志，启动继续**（`core/migrate.py:131-139`）；且 `tests/test_migrate.py:106` 有测试 `test_failed_alter_silently_continues_other_tables` **明确断言该行为** | ❌ S3：应用"带病启动"——schema 缺列，之后所有读写该列的接口运行时 500。启动时"看起来健康"比直接起不来更危险 |
| 2c. 种子 | 异常抛出 → 启动失败 | 可接受（DB 操作的子集） |
| 3. RAG 索引 | 异常吞掉，启动继续（`main.py:137-141`） | ✅ 正确的 OPTIONAL 语义；但**失败状态无处可查**（没有 ready 探针，E4） |

**额外发现（贯穿启动与运行时）**：步骤 3 实例化一次 RAG 后端建索引；之后**每次 WS 连接**又新建一次 `CompanyKnowledgeRAG`（`connection_lifecycle.py:167-173`）→ `LocalEmbeddingRAG.__init__` 每次重开 `chromadb.PersistentClient`（`local_backend.py:33-47`）。REST 路径（C6 落地后）也会每次请求新建。这是 S1。

### 5.3 关闭路径（已核实，无需改动）

- lifespan 关闭时 `engine.dispose()`（`main.py:86-94`），测试模式跳过（避免 `:memory:` 库丢失）；
- WS 断开时 `_cancel_bg_tasks` 取消全部后台任务（`ws_handler.py:143-153`）；
- 进程在报告生成中途被杀：报告列为哨兵 `{"_generating":true}`，下次访问时等待 6s → 清哨兵 → 重新生成（`report.py:205-229`）。**崩溃恢复路径已存在** ✅。

### 5.4 启动时脱耦的结论

启动路径当前是"**一条线性流程 + 两类混乱的失败语义**"：关键步骤（目录/建表/种子）fail-fast 但无独立报告；迁移 fail-soft 到危险程度；RAG 正确的 fail-soft 但状态不可见；外加 RAG 后端生命周期错配（按连接重建）。目标：**每个子系统独立引导、独立失败语义、启动摘要可观测、共享资源进程级单例**——见 §11、§12。

---

## 6. 问题清单：结构耦合族 C（运行时/维护期）

### C1（P0）`agents ↔ realtime` 包级环

**证据**：

```python
# backend/app/agents/orchestrator.py:7
from app.realtime.events import SessionSnapshot
```

```python
# backend/app/realtime/connection_lifecycle.py:14
from app.agents.orchestrator import InterviewOrchestrator
# backend/app/realtime/ws_handler.py:23
from app.agents.orchestrator import InterviewOrchestrator
```

**为什么是问题**：openwiki 分层声明中 `realtime` 是"网关层"（编排 services），`agents` 是被编排的下层。`SessionSnapshot` 这个 DTO 的所有者明明是 `InterviewOrchestrator`（agents 层的状态容器，realtime 只是往里写视觉/STT 数据），却定义在 `realtime/events.py`，导致下层 `agents` 反向 import 上层 `realtime`。当前不是 Python 循环 import（`realtime/events.py` 本身无内部依赖，碰巧安全），但：

1. 任何人在 `realtime/events.py` 里加一个对 services/agents 的 import，立刻制造**真正的循环 import**，启动即炸；
2. 想独立复用/单测 `agents` 包必须连带拖入整个 realtime 包；
3. 分层声明（openwiki）从此不可信——下一个人会照着错误的先例继续倒挂。

### C2（P0）prep 域复用 interview 域内部函数

**证据**：

```python
# backend/app/agents/prep/agent.py:18
from app.services.interview.tools import parse_tool_arguments
```

`parse_tool_arguments`（`services/interview/tools.py:170-182`）是一个 13 行的纯函数（把 LLM 返回的 tool arguments 解析成 dict），与面试业务**零关系**，却住在面试域内部。prep 域为了用它，import 了 `services.interview.tools` 模块——该模块同时 import 了 `models.Resume`、`services.github.tools`、`services.search.web`，即 prep 域被迫拖入面试域的全部传递依赖。

**为什么是问题**：面试域重构 `tools.py`（拆分、改名、改签名）时，作者检查的是面试域的调用点，**几乎必然漏掉 prep 域**；prep 会在面试域的一次"内部"改动中莫名其妙地坏掉。这正是"面试服务出问题影响其他业务"的编译期版本。

### C3（P0）REST 回合与报告生成绑定，降级语义双轨

**证据**：

```python
# backend/app/api/interview.py:215-223（send_message 内）
    if is_complete:
        try:
            await generate_and_persist_report(session, llm, db)
        except Exception as e:
            logger.exception("报告生成失败 sid=%s", session_id)
            raise HTTPException(
                status_code=502, detail="报告生成失败，请稍后重试"
            ) from e
```

**为什么是问题**：

1. **故障放大**：报告生成是独立的次级功能（面试完成后的事后产物），它的失败让主体功能（回合对话）的 HTTP 请求表现为失败。用户视角：面试最后一句聊完了，前端收到 502，可能误重试 `send_message`，把已完成的会话再打一轮。
2. **双轨语义**：WS 路径（`realtime/turn_control.py:144-148` → `report_scheduler.py`）报告在后台任务生成，失败只发 error 消息；REST 路径同步绑定。同一个"面试完成"事件，两条入口的故障行为不一致——维护者改一处忘另一处。
3. 报告页已有独立的补生成能力（`api/reports.py:89-139`，报告为空时自动调 `generate_and_persist_report`，且有哨兵 CAS 防双打），REST 路径的同步生成**本来就不是必需的**。

### C4（P1）面试/准备域 3 处直读简历表，解析与降级逻辑三份

**证据（三处独立的"读 resumes 表 + 解 JSON + 降级"实现）**：

```python
# ① backend/app/services/interview/agent.py:150-159
    def get_candidate(self, db: Session) -> CandidateProfile | None:
        if not self.session.resume_id:
            return None
        resume = db.query(Resume).filter(Resume.id == self.session.resume_id).first()
        if not resume:
            return None
        try:
            return CandidateProfile(**json.loads(resume.parsed_profile))
        except (json.JSONDecodeError, Exception):
            return None
```

```python
# ② backend/app/services/interview/tools.py:128-137（lookup_resume_projects 内）
        r = db.query(Resume).filter(Resume.id == resume_id).first()
        ...
        profile = json.loads(r.parsed_profile or "{}")
```

```python
# ③ backend/app/agents/prep/agent.py:125-131
    def _get_resume_context(self, db: Session) -> str:
        ...
        r = db.query(Resume).filter(Resume.id == self.session.resume_id).first()
        ...
        return f"简历：{r.filename}\n{r.parsed_profile[:3000]}"
```

**为什么是问题**：`resumes` 表的结构知识（`parsed_profile` 是 JSON 字符串、损坏时要降级、截断长度）散落在三个域。简历域未来任何演进——加字段、把 profile 拆成独立列、加缓存、迁移到对象存储——都要改三个域的代码，而且 ①②③ 的降级行为各不相同（None / `{}` / 空字符串 + 截断 3000），行为漂移已经存在。这是"DB 即集成层"反模式：跨域读应该走简历域提供的只读接口。

### C5（P1）function-calling 工具循环双实现

**证据**：

- 面试版：`services/interview/tool_round_runner.py:107-194`（串行执行、写 `agent_state.tool_trace`、上限 `min(settings, MAX_TOOL_ROUNDS=3)`、**无单工具超时**）
- prep 版：`agents/prep/agent.py:194-245`（每轮最多 3 个工具、并发 `asyncio.gather`、单工具 18s 超时、收集 `search_groups`、上限 `_MAX_TOOL_ROUNDS=3`）

两份代码骨架完全相同（`chat_message` → 有 `tool_calls` 就执行并 append → 循环 N 轮 → 首轮无工具且有 content 就 early return），差异只在执行策略与钩子。**为什么是问题**：LLM 工具协议是易变区，两处必须同步改；历史已经证明这种重复会漂移（prep 有超时保护，面试版至今没有单工具超时——`execute_interview_tool` 里 GitHub/web 搜索慢时会拖住整个回合，即 E5）。

### C6（P1）实时层亲手组装面试运行时

**证据**：

```python
# backend/app/realtime/connection_lifecycle.py:160-175
            self.llm = LLMClient.from_db(db)
            if not self.llm.api_key:
                await self._fail_and_close("请先配置面试思考处理器的 API Key")
                return
            self.agent = InterviewAgent(session, self.llm)

            rag = None
            try:
                from app.services.rag.company_rag import CompanyKnowledgeRAG
                rag = CompanyKnowledgeRAG(self.llm)
            except Exception as e:
                logger.warning("RAG 实例化失败，继续无 RAG 模式: %s", e)

            self.runner = InterviewRunner(session, self.llm, self.agent, rag=rag)
```

同样的"LLM → Agent → (可选 RAG) → Runner"组装逻辑在 `api/interview.py:160-165`（start）和 `api/interview.py:200-205`（message）又各写了一遍（且 REST 版**漏了 RAG**，与 WS 版行为不一致——HTTP 回合没有知识库检索）。

**为什么是问题**：装配知识（RAG 可选、实例化失败要降级、agent 要先于 runner 构造）属于面试域，网关层和 API 层不该各自实现。面试域新增一个依赖时，要同时改 3 个组装点，漏一个就是线上行为不一致。S1（RAG 单例）落地后，组装逻辑更应收口。

### C7（P2）面试报告模块直写成长域的表

**证据**：`services/interview/report.py:288-294` 直接构造 `GrowthRecord`（`weak_skills/common_mistakes/training_plan` 的 JSON 序列化格式硬编码在面试域）；读侧 `api/reports.py:38-49` 的 `_safe_json_list` 也各自解析。改动 GrowthRecord 结构要动两个域。

### C8（P2）模块级 settings 固化

5 处 `settings = get_settings()` 写在模块顶层（import 时执行）：`api/resume.py:46`、`realtime/connection_lifecycle.py:39`、`realtime/ws_handler.py:59`、`realtime/voice_pipeline.py:19`、`main.py:46`。`get_settings()` 有 `lru_cache`，调用近乎零成本，完全可以延迟到使用点。模块级固化让运行期改配置不生效、测试 monkeypatch 必须抢在 import 前（`llm/client.py:130-132` 的 `_is_local_allowed()` 就是为了绕这个坑特意写成每次重算的——证据是这个坑已经咬过人）。

### C9（P2）仓库卫生

- 重构脚本残留：`backend/_split_agent.py`、`backend/_split_turn.py`；
- 残留状态目录：仓库根与 `backend/` 下 111+ 个 `chroma_XXXXXX/` 空目录（Chroma 以 CWD 持久化的历史泄漏；正确路径已由 `services/rag/_kb_data.py:21-32` 收口到 `data/chroma/`）；
- 审计/调试残留：根目录 `_audit_be.txt`、`_audit_fe.txt`、`debug-c65d67.log`、`.git.backup-20260709-222320/`。

这些不进包、不影响运行，但会让新人/AI 误判哪些是活代码（上次审查的 AI 就误报过"552 个 chroma 目录被 git 收录"）。

---

## 7. 问题清单：启动耦合族 S（v2 新增）

### S1（P0）RAG 后端按连接/请求实例化

**证据**：

```python
# backend/app/services/rag/local_backend.py:33-47
    def __init__(self, llm: LLMClient | None = None, settings: Settings | None = None):
        import chromadb
        from chromadb.config import Settings as ChromaSettings
        ...
        self._client = chromadb.PersistentClient(path=str(_data_dir()), ...)
        self._collection = self._client.get_or_create_collection(...)
```

构造即打开 Chroma 持久化客户端。而实例化点有三处：启动时 `main.py:138`（建索引，一次，合理）、**每次 WS 连接** `connection_lifecycle.py:171`（`CompanyKnowledgeRAG(self.llm)`）、C6 落地后的每次 REST 请求。

**为什么是问题**：

1. **资源重复初始化**：向量库客户端是重量级对象，每个连接重建是无谓开销（连接建立延迟增加）；
2. **文件锁风险**：Windows 上对同一目录反复打开持久化客户端，遇到异常退出残留锁时，下一次初始化可能失败——表现为"重启电脑后第一场面试 RAG 挂了"这类时序 bug；
3. **生命周期错配**：RAG 后端是**进程级共享资源**（同一份知识库、同一个索引），却绑定在**连接级生命周期**上。这正是"启动时/运行时不脱耦"的典型：一个连接的异常（如 Chroma 初始化失败）本该只影响自己，但修复它却要在每个连接的组装代码里处理（当前靠 connection_lifecycle 的 try/except 兜底，C6 会把这份兜底再复制两份）；
4. **凭据刷新语义混乱**：用户在设置页更新 LLM Key 后，已存在的后端实例仍持旧 `llm` 引用——当前靠"下次连接新建"碰巧掩盖了这个问题；一旦改成单例（正确方向），必须显式处理凭据刷新。

### S2（P1）启动引导单体化

**证据**：`main.py:98-107` `_bootstrap_db_and_seed` 一个函数包揽 建表→迁移→种子；`main.py:70-80` 把 建目录、DB 引导、RAG 索引 串成一条线性流程；任一步骤的结果（成功/失败/耗时）只散落在日志里，**没有结构化的启动摘要**，也没有供外部查询的就绪状态。

**为什么是问题**：企业级服务要求启动过程**可观测、可分步问责**：哪一步失败、是关键还是可选、当前是否就绪，必须能回答（负载均衡/守护进程/用户自查都依赖它）。当前：迁移失败 → 启动"成功"（S3）；RAG 失败 → 只在日志里；目录失败 → 整个进程死掉。三种语义隐式混在一起，启动时各子系统互相牵连。

### S3（P1）迁移失败"带病启动"

**证据**：

```python
# backend/app/core/migrate.py:131-139（apply_column_migrations 内，按表捕获）
        except (OperationalError, IntegrityError) as e:
            logger.error("迁移失败 %s（事务已回滚）: %s", table, e, exc_info=True)
        except Exception as e:
            logger.error("迁移失败 %s（事务已回滚，未知异常类型）: %s", table, e, exc_info=True)
```

失败后启动继续。且 `backend/tests/test_migrate.py:106` 的 `test_failed_alter_silently_continues_other_tables` **明确断言该静默行为**——说明这是当初的有意设计（大概率为"尽量能启动"的本地友好考虑）。

**为什么是问题（企业级视角）**：schema 是全体功能的公共地基。迁移失败意味着 ORM 模型与真实表结构不一致，之后所有读写该列的请求在运行时 500——但进程"活着"，`/health` 返回 ok。这是经典的 **fail-soft 用错地方**：对可选子系统（RAG）fail-soft 是韧性，对地基 fail-soft 是掩盖。**企业级答案是 fail-fast：schema 迁移失败 = 停止启动，用清晰的错误信息告诉用户如何处置**（备份后修复/删除重建），而不是带病服务。改动时必须同步修改 `test_migrate.py:106` 的断言（该测试应改为验证"失败会抛出并阻止启动"）。

### S4（P2）database 模块 import 时建引擎

**证据**：

```python
# backend/app/database.py:83-86
# 向后兼容：模块级别名。首次访问时调用工厂，确保总是最新的实例。
# 注意：导入这些模块级名称后会触发首次实例化，请在 setenv 之后再导入。
engine = get_engine()
SessionLocal = get_session_factory()
```

注释自己承认了坑（"请在 setenv 之后再导入"）。`get_engine()` 内部已是双检锁懒创建，但模块级这两行让"懒"失效——任何 `import app.database` 都立刻建引擎。**为什么是问题**：启动顺序被迫依赖 import 顺序；单元测试无法先 import 再配环境；未来做启动编排（S2）时，"数据库何时初始化"不由编排器控制而由 import 时机控制。影响面已核实：模块级 `engine` 仅 `main.py:38` 一个消费方；`SessionLocal` 有 6 个消费方（`main.py` + `realtime/` 5 个文件），全部以 `SessionLocal()` 调用形态使用，可用函数化 shim 无缝替换。

---

## 8. 问题清单：企业级韧性族 E（v2 新增）

### E1（P0）SQLite 未做并发加固

**证据**：

```python
# backend/app/database.py:44-55
        settings = get_settings()
        url = settings.database_url
        connect_args: dict = {}
        pool_kwargs: dict = {}
        if url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
            if url.endswith(":memory:") or url == "sqlite://":
                pool_kwargs["poolclass"] = StaticPool
        _engine = create_engine(url, connect_args=connect_args, **pool_kwargs)
```

默认 journal 模式（DELETE）、无 `busy_timeout`、默认 `synchronous=FULL`。

**为什么是问题**：本项目的写路径比典型"本地小工具"密集：WS 每回合 `save_state` 提交、后台报告写库、REST 端点写库、限流/会话锁之外的并发写真实存在（例：面试回合写状态的同时，后台报告任务在写报告、hint 服务在独立 session 读）。SQLite 默认模式下**写锁是全库排他的**，并发写+读在默认配置下会抛 `OperationalError: database is locked`——当前靠 WAL 缺失下的"运气好"（写入快、冲突窗口小）没有爆发。企业级标配三件套：`journal_mode=WAL`（读写不互斥）+ `busy_timeout=N`（写冲突时等待而非立刻报错）+ `synchronous=NORMAL`（WAL 下安全的性能档）。这是**一行不改业务代码、纯连接层**的加固，收益/成本比全报告最高。

### E2（P1）LLM 出口无熔断

**证据**：`services/llm/client.py:72-127` `_retry_request` 对 429/5xx/网络错误做 3 次指数退避（0.5s→1s→2s，合计最多约 3.5s 等待，叠加连接/读超时最多十数秒）——**每次调用独立重试**。`LLMClient` 每请求新建（`from_db`），无任何跨调用的故障记忆。

**为什么是问题**：LLM 提供商宕机时（BYOK 场景常见：额度耗尽、厂商故障、网络断）：

1. 用户每次操作（面试回合、简历分析、hint、报告）都要**卡 3.5s~10+s 才收到错误**；
2. 重试风暴放大对故障方的冲击（企业级要"快速失败、给故障方喘息"）；
3. 恢复感知滞后：提供商已恢复，用户仍因上一次的重试体验而流失。

熔断器模式：连续失败 N 次 → 打开（冷却 30s，期间调用**毫秒级**失败并给出明确文案）→ 冷却后半开（放一个试探请求）→ 成功则闭合。这是分布式韧性的基础件，且本项目所有降级路径（§4）天然兼容它：`CircuitOpenError` 就是一种异常，简历分析照样 502、面试照样发 error 事件——只是从"卡 10 秒"变成"立刻"。

### E3（P1）LLM 并发无舱壁

**证据**：全系统 LLM 出口（`chat`/`chat_message`/`chat_stream`/`embed`）无并发控制。可并发的真实场景：用户开实时面试（每回合 1-2 次 LLM 调用）的同时，点一次简历深度分析（`timeout=180s` 的长调用，`api/resume.py` 的 `LLM_HEAVY_TIMEOUT_MS`）、后台报告生成、hint 服务、RAG 建索引 embed（`local_backend.py:64` 一次 embed 全部文档）。

**为什么是问题**：厂商端通常有并发/速率限制；本地体验上，长任务（深分析、报告）占住出口时，**实时回合的 token 延迟被拖长**——面试是强实时交互，简历分析是弱实时任务，两类流量必须有优先级隔离。舱壁模式：按流量类型分信号量池（interactive 池大、background 池小），互不饿死。这是"经得起冲击"的直接体现：突发流量只打满自己的池子。

### E4（P1）无就绪探针

**证据**：`main.py:317-319` `/health` 是静态返回 `{"status": "ok"}`，不检查任何依赖。

**为什么是问题**：S2/S3 的各种降级（RAG 没建上、迁移带病、LLM 未配置）当前只能翻日志才知道。企业级要求探针分级：`/health/live`（进程活着）与 `/health/ready`（关键依赖就绪 + 可选子系统状态清单）。用户/前端/守护进程据此回答"现在能不能用、哪些功能降级了"。

### E5（P2）面试工具执行无超时

**证据**：`services/interview/tool_round_runner.py:172-179` 直接 `await execute_interview_tool(...)`，无 `wait_for`；对比 prep 域 `_TOOL_TIMEOUT_SEC = 18.0`（`agents/prep/agent.py:26, 175-179`）。GitHub API 或搜索慢/挂时，面试回合被拖住（占着回合锁 `_turn_busy`），候选人干等。**改法**：合并进 C5 的工具循环统一改造（§10.5），统一 15s 超时。

### E6（P1）无业务错误码体系，错误对前端不透明、排查靠翻日志（v3 新增）

**证据（三处断点，均已核实）**：

1. **REST**：`main.py:237-275` 的 envelope handler 产出的 `error.code` 是通用 `http_{status}`（如 `http_400`/`http_404`），不区分"简历不存在"与"面试会话不存在"等语义迥异的错误；`docs/API.md:53` 文档化的 envelope 同样只有 code/message/trace_id 三字段，无处置建议。
2. **WS/SSE**：实时通道错误帧只有 `{"type":"error","message":...}`（`streaming_consumer.py:113,253,334` 的 `StreamEvent.make_error`、`connection_lifecycle.py:284-413`、`turn_coordinator.py:207-300`、`report_scheduler.py:75`、`voice_pipeline.py:284` 等全部 `send("error", ...)` 调用点均无 code 字段）；`StreamEvent.make_error`（`services/interview/events.py:57-58`）签名只有 `message` 参数。SSE 侧（`api/v1/prep.py:166`、`api/reports.py:133`）同样无码。
3. **前端**：`frontend/src/lib/api.ts:69-109` 的 `ApiError` 只有 `message`+`status` 两字段，`parseErrorResponse` 读取了 `data.error.message` 却**丢弃 `error.code` 与 `error.trace_id`**；`useInterviewWS.ts:184-202` 的 dispatch 对 error 帧也只消费 `message`。

**为什么是问题**：用户看到报错后无法自助定位——"AI 服务暂时不可用"可能是 Key 没配（A 类）、后端 bug（B 类）、LLM 宕机（C 类）或熔断保护中（C 类），当前只能靠翻后端终端日志逐行找；用户反馈问题时也没有可引用的稳定标识（"我报 C0001"远比"报了个错，弹窗说服务不可用"可检索）。企业级要求错误像日志一样可检索、可分类、可聚合统计。

**设计决策（已定稿，完整规范见 [`docs/ERROR_CODES.md`](../ERROR_CODES.md)）**：

- **格式**：`来源字母 + 域数字 + 两位序号`（如 `A1004`/`C0003`），来源三分法 A（用户端/4xx）/B（本系统/5xx）/C（第三方/502-503）对齐《阿里巴巴 Java 开发手册》错误码规约——本项目故障排查的第一分流问题恰好就是"用户操作、本地系统、BYOK 第三方，谁的错"；
- **信封扩展**：REST envelope 增加 `hint`（中文处置建议，前端直接展示）与 `retryable` 两字段；WS/SSE error 事件增加 `code`/`retryable`；
- **目录集中**：错误码注册表 `app/core/errors.py`（`ErrorSpec` dataclass + `CATALOG` + `raise_error()`），`ApiBusinessError` 继承 `HTTPException` 使既有 `except HTTPException` 与 envelope handler 零改动兼容，未迁移的旧 raise 自动落 `http_{status}` 兜底码；
- **前端**：`ApiError` 扩展 `code/hint/traceId/retryable`，展示约定 `[code] message` + hint 小字，dev 模式附 trace_id；无后端响应场景用前端本地码 `NET0000`。

**改法**：见 §12.6，全部站点迁移对照表见 ERROR_CODES.md §5.3/§5.4。

---

## 9. 目标架构设计

### 9.1 依赖规则（改动完成后应成立，用 §9.5 的脚本长期守护）

| 包 | 允许 import | 禁止 import |
| --- | --- | --- |
| `app/core/*` | 标准库、第三方库 | `app.api` / `app.services` / `app.realtime` / `app.agents` |
| `app/config.py`、`app/models`、`app/schemas` | `app.core` | 业务包 |
| `app/services/llm`、`services/context` 等共享服务 | `core`、`models`、`schemas`、`config` | 业务域服务（resume/interview/growth） |
| `app/services/<业务域>` | `core`、`models`、`schemas`、`config`、共享服务、**其它域的 `queries` 接口模块** | 其它域的内部模块、`api`、`realtime`、`agents` |
| `app/agents/*` | `services`、`core`、`models`、`schemas` | `realtime`（！C1 修正后为零） |
| `app/realtime/*` | `services`、`agents`、`core`、`models` | 无新增限制 |
| `app/api/*` | `services`、`agents`、`core`、`models`、`schemas` | 无新增限制 |

跨域数据访问的唯一合法姿势：**消费域 import 产出域的 `queries` 模块**（纯只读函数，含降级语义），不直接读产出域的表。

### 9.2 目标分层图（含启动编排与韧性件）

```
启动期：
  main.lifespan ──► core/bootstrap（步骤注册表：每步独立失败语义 + 摘要）
                       ├─ CRITICAL: upload_dir / database(init+migrate+seed)
                       └─ OPTIONAL: rag_index
  就绪状态写入进程级 registry ──► /health/ready 对外暴露

运行期：
┌─────────────────────────────────────────────────────────┐
│ api/ (REST+SSE)            realtime/ (WS 网关)           │
│   │                          │                           │
│   ▼                          ▼                           │
│ agents/prep            agents/orchestrator               │
│   │                          │  (SessionSnapshot 在本层)  │
└───┼──────────────────────────┼───────────────────────────┘
    ▼                          ▼
 services/interview ──► services/resume/queries.py（只读接口）
 services/interview ──► services/growth/learning.py（写入接口）
 services/interview ──► services/interview/runtime.py（装配工厂）
    │                        └─► services/rag/registry.py（进程级单例）
    ▼
 services/llm（client + tool_args + tool_loop
               + circuit_breaker〔按 api_base 熔断〕
               + bulkhead〔interactive/background 双池〕）
 services/{rag, stt, tts, voice, search, github, company, context}
    │
    ▼
 core / config / models / schemas
 database（WAL + busy_timeout + 惰性引擎）
```

### 9.3 有意的共享（不是缺陷，不要"修"它们）

- **`llm_settings` 单行配置**：所有 AI 域共享同一个 BYOK 思考模型。简历分析与面试的隔离**不依赖**配置分离，而依赖"各自调用、各自处理异常"（已具备，§4）。LLM 提供商挂掉 = 全部 AI 功能降级，这是单用户 BYOK 的固有语义，用户自己换 key 即可，不存在"一个域搞坏另一个域"的放大。E2 熔断器按 `api_base` 维度做，与该语义一致。
- **进程内存态**（`session_registry`、`report._REPORT_LOCKS`、`ratelimit` 滑动窗口、`growth._write_lock`、E2 熔断状态、E3 信号量）：本地单用户单进程是正确选择。若未来要多 worker 部署，这些点才需要换成外部存储——届时再议。
- **`services/rag/_kb_data.py` → `services/company/knowledge.py`**：company 是纯数据模块（`BUILTIN_COMPANIES`），数据下沉被 RAG 引用，方向合理。
- **main.py import 时的 CORS/secret 门禁**：prod 环境的 fail-fast 安全检查，是企业级正确姿势，保留。

### 9.4 启动时脱耦的目标状态（回答"启动时怎么才算脱耦"）

| 子系统 | 失败语义 | 启动后状态可见性 |
| --- | --- | --- |
| 配置校验（CORS/SECRET/prod 规则） | CRITICAL：import 时 fail-fast（现状保留） | 进程不启动，错误即原因 |
| 数据库（建表+迁移+种子） | CRITICAL：fail-fast，**含迁移**（S3 修正后） | 进程不启动 |
| 上传目录 | CRITICAL：fail-fast | 进程不启动 |
| RAG 索引/后端 | OPTIONAL：降级为无 RAG 模式 | `/health/ready` 显示 `rag: degraded` |
| Whisper 模型 | OPTIONAL（保持连接时预热，不入启动关键路径） | 首次转写空结果时走"未识别"降级（现状） |
| LLM 配置 | 非启动项（BYOK 允许未配置启动） | `/health/ready` 显示 `llm_configured: bool` |

### 9.5 长期守护：CI 依赖规则检查脚本

新增 `scripts/check_architecture_rules.py`（改动全部落地后接入 CI）：

```python
"""架构依赖规则守护：扫描禁止的 import，违规则以非零码退出。

用法（仓库根，cmd）：
    python scripts\\check_architecture_rules.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "backend" / "app"

# (相对包路径, 禁止的 import 正则, 规则说明)
RULES: list[tuple[str, str, str]] = [
    ("core", r"from app\.(api|services|realtime|agents)",
     "core 不得依赖上层包"),
    ("services", r"from app\.(api|realtime)",
     "services 不得依赖 api/realtime"),
    ("agents", r"from app\.realtime",
     "agents 不得依赖 realtime（C1：SessionSnapshot 已归属 agents/snapshot）"),
    ("agents\\prep", r"from app\.services\.interview",
     "prep 不得依赖 interview 域内部模块（C2：用 services/llm/tool_args）"),
    ("services\\interview", r"from app\.models import[^\n]*\bResume\b",
     "interview 不得直读 Resume 表（C4：用 services/resume/queries）"),
    ("services\\interview", r"from app\.models import[^\n]*\bGrowthRecord\b",
     "interview 不得直写 GrowthRecord 表（C7：用 services/growth 接口）"),
]


def iter_py_files(pkg: Path):
    yield from pkg.rglob("*.py")


def main() -> int:
    violations: list[str] = []
    for rel_pkg, pattern, desc in RULES:
        pkg_dir = APP / rel_pkg
        if not pkg_dir.is_dir():
            continue
        rx = re.compile(pattern)
        for f in iter_py_files(pkg_dir):
            if "__pycache__" in f.parts:
                continue
            for lineno, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if rx.search(line):
                    violations.append(f"{f}:{lineno}: {line.strip()}  -- 违反: {desc}")
    if violations:
        print("架构依赖规则违规：")
        print("\n".join(violations))
        return 1
    print("架构依赖规则检查通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

> 注意：C4/C7 的两条规则在对应 PR 合并前会误报，应按 PR 顺序落地、逐个打开规则（先加脚本但注释掉未完成的规则，或按 §13 的 PR 顺序在最后统一启用）。

---

## 10. 逐项改动指南：结构耦合族 C

> 每一项都是独立可验证的最小改动。"改前"代码均逐字摘自当前代码库；"改后"代码可直接粘贴。行号以当前版本为准，若已漂移，用 `rg` 按代码内容定位。

### 10.1 C1：把 `SessionSnapshot` 从 realtime 移到 agents

**为什么**：见 §6-C1。修正依赖方向为 `realtime → agents` 单向；通过 re-export 保持旧 import 路径可用，**零行为变化、测试不用改**。

**改动 1：新建 `backend/app/agents/snapshot.py`**（内容 = 把 `SessionSnapshot` 类从 `realtime/events.py` 原样搬来，仅改模块 docstring）：

```python
"""会话快照：各子 Agent 写入的最新状态容器。

归属 agents 层（所有者是 :class:`app.agents.orchestrator.InterviewOrchestrator`）。
realtime 层只负责写入（视觉/STT 数据）与读取，依赖方向保持 realtime → agents 单向。
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class SessionSnapshot:
    """各 Agent 写入的最新状态快照。"""

    stt_partial: str = ""
    stt_final: str = ""
    vision_summary: str = ""
    face_analysis: dict[str, Any] = field(default_factory=dict)
    last_user_text: str = ""
    token_usage: int = 0
    phase: str = ""
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def merge_face(self, face: dict[str, Any] | None) -> None:
        if not face:
            return
        self.face_analysis = face
        hints: list[str] = []
        if not face.get("face_detected", True):
            hints.append("未检测到人脸")
        elif face.get("looking_away"):
            hints.append("未看镜头")
        if face.get("nervousness", 0) > 0.5:
            hints.append("略显紧张")
        if hints:
            self.vision_summary = "候选人状态：" + "、".join(hints)
        self.updated_at = datetime.now(timezone.utc)
```

**改动 2：`backend/app/realtime/events.py`** —— 删除 `SessionSnapshot` 类定义，改为 re-export（保持 `app.realtime.events.SessionSnapshot` 旧路径不断裂）：

```python
"""面试会话事件类型与快照。

注意 ``SessionEvent.schema_version``：每次事件协议变更递增；前端可据此
做兼容判断。``SessionSnapshot`` 已归属 :mod:`app.agents.snapshot`，此处仅
向后兼容 re-export。
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.agents.snapshot import SessionSnapshot

__all__ = ["TurnState", "SessionSnapshot", "SessionEvent"]


class TurnState(str, Enum):
    AI_SPEAKING = "AI_SPEAKING"
    USER_SPEAKING = "USER_SPEAKING"
    PROCESSING = "PROCESSING"
    IDLE = "IDLE"


@dataclass
class SessionEvent:
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # 事件协议版本，演进时 +1；ws_handler 在首个事件注入
    schema_version: int = 1
```

**改动 3：`backend/app/agents/orchestrator.py:7`**

```python
# 改前
from app.realtime.events import SessionSnapshot
# 改后
from app.agents.snapshot import SessionSnapshot
```

**影响面排查**（cmd 下执行，确认没有遗漏的直接使用者）：

```
rg -n "SessionSnapshot" backend -g "*.py" -g "!__pycache__"
```

预期：改后只剩 `agents/snapshot.py`（定义）、`agents/orchestrator.py`（使用）、`realtime/events.py`（re-export）。测试 `backend/tests/test_orchestrator.py` 若从 `app.realtime.events` import，re-export 保证不炸。

**验证**：

```
cd backend && python -m pytest tests/test_orchestrator.py tests/test_ws_handler.py -q
```

再跑全量：`python -m pytest -q`。

### 10.2 C2：`parse_tool_arguments` 上移到 `services/llm`

**为什么**：见 §6-C2。该函数与面试业务无关，是 LLM 工具协议的一部分，应住在共享 LLM 服务里。

**改动 1：新建 `backend/app/services/llm/tool_args.py`**（函数体从 `services/interview/tools.py:170-182` 原样搬移）：

```python
"""LLM function-calling 工具参数解析（共享，不属任何业务域）。"""

from __future__ import annotations

import json
from typing import Any


def parse_tool_arguments(raw: str | dict[str, Any] | None) -> dict[str, Any]:
    """解析 LLM 返回的 tool arguments（可能是 JSON 字符串）。

    始终返回 dict；无法解析时返回 {}，由工具执行层处理缺参。
    """
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}
```

**改动 2：`backend/app/services/interview/tools.py`** —— 删除本地定义（170-182 行），在文件头部 import 区加一行 re-export，保证 `from app.services.interview.tools import parse_tool_arguments` 的旧调用方（含 `tests/test_github_tools.py:14`）不断裂：

```python
from app.services.llm.tool_args import parse_tool_arguments  # noqa: F401 — 兼容旧引用
```

**改动 3：`backend/app/agents/prep/agent.py:18`**

```python
# 改前
from app.services.interview.tools import parse_tool_arguments
# 改后
from app.services.llm.tool_args import parse_tool_arguments
```

**影响面排查**：

```
rg -n "parse_tool_arguments" backend -g "*.py" -g "!__pycache__"
```

预期：定义在 `services/llm/tool_args.py`；使用在 `agents/prep/agent.py`、`services/interview/tool_round_runner.py`（经 `services/interview/tools` re-export 或同步改为直接 import 新位置，二选一，建议一并改）、`services/interview/tools.py`（re-export）、`tests/test_github_tools.py`（旧路径，靠 re-export 通过）。

**验证**：

```
cd backend && python -m pytest tests/test_github_tools.py tests/test_runner.py -q
```

### 10.3 C3：REST `send_message` 报告生成改为后台任务

**为什么**：见 §6-C3。让 REST 路径与 WS 路径语义一致——回合归回合，报告归报告；报告失败由报告页（`/reports/{id}/stream`）兜底重试，该端点在报告缺失时会自动调 `generate_and_persist_report`（`api/reports.py:112-118`），且有进程内锁 + DB 哨兵 CAS 防双打（`services/interview/report.py:192-251`），并发安全已由现有机制保证。

**改动：`backend/app/api/interview.py`**

1. 文件头部 import 区补 `import asyncio`；
2. 在 `_collect_turn_result` 之后新增后台辅助函数：

```python
async def _generate_report_background(session_id: int) -> None:
    """后台生成报告（独立 DB session）。

    与 WS 路径 :mod:`app.realtime.report_scheduler` 语义对齐：
    失败仅记日志，由报告页 /reports/{id}/stream 兜底重试。
    """
    bg_db = SessionLocal()
    try:
        bg_session = bg_db.query(InterviewSession).filter(
            InterviewSession.id == session_id
        ).first()
        if not bg_session:
            return
        bg_llm = LLMClient.from_db(bg_db)
        if not bg_llm.api_key:
            return
        await generate_and_persist_report(bg_session, bg_llm, bg_db)
    except Exception:
        logger.exception("后台报告生成失败 sid=%s", session_id)
    finally:
        try:
            bg_db.close()
        except Exception:
            pass
```

import 区需要补 `from app.database import SessionLocal`（当前只 import 了 `get_db`，见 `api/interview.py:25`）。

3. 替换 `send_message` 中的同步报告块（当前 215-223 行）：

```python
# 改前
    if is_complete:
        try:
            await generate_and_persist_report(session, llm, db)
        except Exception as e:
            # 对外通用文案，细节仅日志（防上游异常泄漏）
            logger.exception("报告生成失败 sid=%s", session_id)
            raise HTTPException(
                status_code=502, detail="报告生成失败，请稍后重试"
            ) from e

# 改后
    if is_complete:
        # 报告生成与回合响应解耦：后台任务独立 DB session，失败不影响本回合。
        # 前端报告页在报告缺失时会自动触发生成（api/reports.py 的哨兵 CAS 防双打）。
        asyncio.create_task(_generate_report_background(session_id))
```

**注意**：`finish_interview`（`api/interview.py:235-279`）保持同步生成不变——它是"我要报告"的显式请求，502 语义正确。`send_message` 是"继续对话"的请求，不该被报告绑架。

**行为变化确认（要告诉前端/用户的）**：REST 路径下，面试最后一回合的响应不再等待报告生成；前端跳转报告页后，报告页 `/{session_id}/stream` 端点会自动补生成（现有逻辑）。`InterviewMessageResponse` schema 不变。

**影响面排查**：

```
rg -n "generate_and_persist_report" backend/app -g "*.py" -g "!__pycache__"
```

预期剩余调用点：`report_scheduler.py:60`（WS 后台）、`api/reports.py:116`（报告页兜底）、`api/interview.py`（仅 `finish_interview` + 新的后台函数）。

**验证**：

```
cd backend && python -m pytest tests/test_report_stream.py -q
```

手工故障注入：把 `.env` 的 `LLM_API_BASE` 改成 `https://127.0.0.1:9/v1`（不可达），走 REST 面试到最后一回合 → 期望 `send_message` 返回 200（回合正常），日志出现"后台报告生成失败"；随后改回正确配置，打开报告页 → 报告自动补生成成功。

### 10.4 C4：简历只读查询收口到 `services/resume/queries.py`

**为什么**：见 §6-C4。三处直读合并为一个带降级语义的只读接口，简历域存储演进只改一个文件。

**改动 1：新建 `backend/app/services/resume/queries.py`**：

```python
"""简历域只读查询接口：其它域获取候选人档案的唯一入口。

``resumes`` 表结构、parsed_profile 的 JSON 解析与降级策略集中在此；
存储层演进（字段调整、缓存、外部化）只需修改本模块。
所有函数对坏数据降级（返回 None / 空串 / 空 dict），不向调用方抛错。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models import Resume
from app.schemas import CandidateProfile

logger = logging.getLogger(__name__)


def get_resume(db: Session, resume_id: int | None) -> Resume | None:
    """按 id 取简历；id 为空或不存在时返回 None。"""
    if not resume_id:
        return None
    return db.query(Resume).filter(Resume.id == resume_id).first()


def get_candidate_profile(db: Session, resume_id: int | None) -> CandidateProfile | None:
    """读取候选人结构化档案；简历不存在或 JSON 损坏时返回 None。"""
    resume = get_resume(db, resume_id)
    if not resume:
        return None
    try:
        return CandidateProfile(**json.loads(resume.parsed_profile))
    except Exception:
        logger.warning("简历 parsed_profile 损坏 resume_id=%s，按无档案降级", resume_id)
        return None


def get_profile_dict(db: Session, resume_id: int | None) -> dict[str, Any]:
    """读取档案原始 dict（工具层做关键词过滤用）；损坏时返回 {}。"""
    resume = get_resume(db, resume_id)
    if not resume:
        return {}
    try:
        data = json.loads(resume.parsed_profile or "{}")
    except json.JSONDecodeError:
        logger.warning("简历 parsed_profile 非法 JSON resume_id=%s，按空档案降级", resume_id)
        return {}
    return data if isinstance(data, dict) else {}


def get_resume_context_text(db: Session, resume_id: int | None, *, max_chars: int = 3000) -> str:
    """供 prompt 注入的简历上下文文本；无简历时返回空串。"""
    resume = get_resume(db, resume_id)
    if not resume:
        return ""
    return f"简历：{resume.filename}\n{resume.parsed_profile[:max_chars]}"
```

**改动 2：`backend/app/services/interview/agent.py:150-159`** —— `get_candidate` 委托：

```python
# 改前（逐字删除 150-159 行的查询+解析实现）
    def get_candidate(self, db: Session) -> CandidateProfile | None:
        if not self.session.resume_id:
            return None
        resume = db.query(Resume).filter(Resume.id == self.session.resume_id).first()
        if not resume:
            return None
        try:
            return CandidateProfile(**json.loads(resume.parsed_profile))
        except (json.JSONDecodeError, Exception):
            return None

# 改后
    def get_candidate(self, db: Session) -> CandidateProfile | None:
        from app.services.resume.queries import get_candidate_profile

        return get_candidate_profile(db, self.session.resume_id)
```

（函数内 lazy import 与本文件 `agent.py:169` 的既有风格一致；同时可移除 `agent.py:16` import 行的 `Resume`——先 `rg -n "\bResume\b" backend/app/services/interview/agent.py` 确认无其它使用再删。）

**改动 3：`backend/app/services/interview/tools.py:128-137`** —— `lookup_resume_projects` 的数据获取部分换成 `get_profile_dict`：

```python
# 改前（128-137 行）
    if name == "lookup_resume_projects":
        if not resume_id:
            return json.dumps({"error": "no_resume_bound"}, ensure_ascii=False)
        r = db.query(Resume).filter(Resume.id == resume_id).first()
        if not r:
            return json.dumps({"error": "resume_not_found"}, ensure_ascii=False)
        try:
            profile = json.loads(r.parsed_profile or "{}")
        except json.JSONDecodeError:
            profile = {}

# 改后
    if name == "lookup_resume_projects":
        if not resume_id:
            return json.dumps({"error": "no_resume_bound"}, ensure_ascii=False)
        from app.services.resume.queries import get_profile_dict, get_resume

        r = get_resume(db, resume_id)
        if not r:
            return json.dumps({"error": "resume_not_found"}, ensure_ascii=False)
        profile = get_profile_dict(db, resume_id)
```

（该函数其余部分——`focus` 过滤、payload 组装、`_truncate`——保持不变；`tools.py:19` 的 `Resume` import 若不再有其它使用则一并移除。）

**改动 4：`backend/app/agents/prep/agent.py:125-131`** —— `_get_resume_context` 委托：

```python
# 改前
    def _get_resume_context(self, db: Session) -> str:
        if not self.session.resume_id:
            return ""
        r = db.query(Resume).filter(Resume.id == self.session.resume_id).first()
        if not r:
            return ""
        return f"简历：{r.filename}\n{r.parsed_profile[:3000]}"

# 改后
    def _get_resume_context(self, db: Session) -> str:
        from app.services.resume.queries import get_resume_context_text

        return get_resume_context_text(db, self.session.resume_id)
```

（`prep/agent.py:14` 的 `Resume` import 若无其它使用则移除。）

**影响面排查**：

```
rg -n "db.query(Resume" backend/app -g "*.py" -g "!__pycache__"
rg -n "parsed_profile" backend/app -g "*.py" -g "!__pycache__"
```

预期：改后 `db.query(Resume...)` 只出现在 `api/resume.py`（简历域自己的 CRUD，合法）与 `services/resume/queries.py`；`parsed_profile` 的读取只在 `queries.py` 与 `api/resume.py`。

**验证**：

```
cd backend && python -m pytest tests/test_runner.py tests/test_github_tools.py tests/test_resume_analysis_normalize.py -q
```

手工故障注入：在数据库里把某简历的 `parsed_profile` 改成 `{broken json`（可用 SQLite 命令行或 DB 工具），然后：
1. 开启绑定该简历的面试 → 开场白正常生成（按无档案降级，不报错）；
2. `GET /api/v1/resume/list` → 200，该条为空 profile（`api/resume.py:260-262` 已有降级）。

### 10.5 C5：抽取通用工具循环 `services/llm/tool_loop.py`（含 E5 超时）

**为什么**：见 §6-C5、§8-E5。**本项为中等风险重构，必须在 C1-C4 全部落地、全量测试通过后单独一个 PR 做。** 两域差异通过回调注入，行为保持逐字一致；顺带给面试域补上单工具超时（对齐 prep 的 18s，取 15s）。

**改动 1：新建 `backend/app/services/llm/tool_loop.py`**：

```python
"""通用 OpenAI function-calling 工具循环。

interview 与 prep 两域共用骨架；域差异通过参数注入：
- ``tools``：本域工具定义；
- ``execute``：执行单个 tool_call 的回调，返回 ``(observation, tool_call_id)``；
- ``parallel``：True 时本轮 tool_calls 并发执行（prep 语义），False 串行（interview 语义）；
- ``tool_timeout_sec``：单个工具执行超时（超时的 observation 为超时文案，不抛出）。

契约（与重构前两份实现一致）：
- 首轮即无 tool_calls 且已有 content：返回 ``(messages, content)``，调用方直接用文案；
- 执行过工具：返回 ``(enriched_messages, None)``，调用方再发起最终生成；
- 任何一轮 LLM 调用失败：跳出循环，返回 ``(working, None)``。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)


async def _execute_one(
    execute: Callable[[dict[str, Any]], Awaitable[tuple[str, str]]],
    tc: dict[str, Any],
    *,
    round_i: int,
    tool_timeout_sec: float,
) -> tuple[str, str]:
    """执行单个工具并套上超时/异常双保险；返回 (observation, tool_call_id)。"""
    fn = tc.get("function") or {}
    name = str(fn.get("name") or "")
    tc_id = str(tc.get("id") or f"call_{round_i}_{name}")
    try:
        return await asyncio.wait_for(execute(tc), timeout=tool_timeout_sec)
    except asyncio.TimeoutError:
        logger.warning("工具执行超时 tool=%s (%.0fs)", name, tool_timeout_sec)
        return f"工具执行超时（>{tool_timeout_sec:.0f}s），请基于已有信息继续。", tc_id
    except Exception as tool_exc:  # execute 应自处理；此处双保险
        logger.warning("工具执行异常 tool=%s: %s", name, tool_exc)
        return f"工具执行失败: {tool_exc}", tc_id


async def run_tool_loop(
    llm: LLMClient,
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]],
    execute: Callable[[dict[str, Any]], Awaitable[tuple[str, str]]],
    parallel: bool = False,
    max_rounds: int = 3,
    temperature: float = 0.7,
    tool_timeout_sec: float = 15.0,
) -> tuple[list[dict[str, Any]], str | None]:
    """执行工具循环，返回 ``(messages, early_content_or_none)``。"""
    working = list(messages)
    any_tool_used = False
    for round_i in range(max_rounds):
        try:
            msg = await llm.chat_message(working, temperature=temperature, tools=tools)
        except Exception as e:
            logger.warning("工具轮次 LLM 失败 round=%s: %s", round_i, e)
            break

        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            content = msg.get("content")
            if content and not any_tool_used:
                return working, str(content)
            break

        any_tool_used = True
        working.append({
            "role": "assistant",
            "content": msg.get("content"),
            "tool_calls": tool_calls,
        })
        if parallel:
            results = await asyncio.gather(*[
                _execute_one(execute, tc, round_i=round_i, tool_timeout_sec=tool_timeout_sec)
                for tc in tool_calls
            ])
        else:
            results = [
                await _execute_one(execute, tc, round_i=round_i, tool_timeout_sec=tool_timeout_sec)
                for tc in tool_calls
            ]
        for observation, tc_id in results:
            working.append({
                "role": "tool",
                "tool_call_id": tc_id,
                "content": observation,
            })
    return working, None
```

**改动 2：`services/interview/tool_round_runner.py` 的 `run_tool_rounds`（107-194 行）改为委托**——保留原有函数签名与 `tool_trace` 写入、保留 `max_rounds = min(settings.interview_max_tool_rounds, MAX_TOOL_ROUNDS)` 的收口逻辑、`parallel=False`：

```python
    async def run_tool_rounds(
        self,
        api_messages: list[dict[str, Any]],
        db: Session,
        *,
        temperature: float = 0.75,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """非流式工具循环：执行 tool_calls 最多 N 轮（语义与重构前一致）。"""
        from app.services.llm.tool_loop import run_tool_loop

        settings = get_settings()
        if not settings.interview_tools_enabled:
            return api_messages, None
        max_rounds = min(settings.interview_max_tool_rounds, MAX_TOOL_ROUNDS)
        if max_rounds <= 0:
            return api_messages, None
        tools = self.collect_chat_tools(include_function_tools=True)
        if not tools:
            return api_messages, None

        async def _exec(tc: dict[str, Any]) -> tuple[str, str]:
            fn = tc.get("function") or {}
            name = str(fn.get("name") or "")
            args = parse_tool_arguments(fn.get("arguments"))
            tc_id = str(tc.get("id") or f"call_{name}")
            logger.info("工具调用: session=%s tool=%s", self.session.id, name)
            try:
                result = await execute_interview_tool(
                    name, args, db=db,
                    resume_id=self.session.resume_id,
                    profile_id=self.session.profile_id,
                    agent_state=self.agent.agent_state,
                )
                ok = True
            except Exception as tool_exc:
                result = f"工具执行失败: {tool_exc}"
                ok = False
                logger.warning("工具执行异常 tool=%s: %s", name, tool_exc)
            trace = self.agent.agent_state.setdefault("tool_trace", [])
            trace.append({"round": -1, "tool": name, "ok": ok})  # round 精确还原见下方注释
            if len(trace) > 40:
                del trace[:-40]
            return result, tc_id

        return await run_tool_loop(
            self.llm, api_messages,
            tools=tools, execute=_exec, parallel=False,
            max_rounds=max_rounds, temperature=temperature,
        )
```

> 注：原实现 `trace` 会记录 `round` 序号；通用循环里 `_exec` 不知道自己在第几轮。若需精确还原，可在 `_exec` 外套一层按 `tool_calls` 出现顺序计数的闭包，或接受 `round: -1` 的元数据差异（`tool_trace` 仅用于 prompt 摘要与统计，不影响对外行为）。**实施时以测试为准**：`tests/test_runner.py` 覆盖的是对外行为。

**改动 3：`agents/prep/agent.py:194-245` 的 `_run_tool_rounds` 改为委托**——保留每轮最多 3 个工具（`limited = tool_calls[:_MAX_TOOLS_PER_ROUND]`）、`parallel=True`、`tool_timeout_sec=18.0`、`search_groups` 收集逻辑（放在 prep 自己的 `_exec` 与结果包装里）。

**验证**：

```
cd backend && python -m pytest tests/test_runner.py tests/test_github_tools.py tests/test_rag_backends.py -q
```

外加 prep 的手工验证：创建一个 prep 会话发一条会触发搜索的消息（如"字节跳动后端面试常考什么"），确认工具轮次、search_results 事件、最终回答均正常。

### 10.6 C6：面试运行时装配收口到 `services/interview/runtime.py`

**为什么**：见 §6-C6。消除 3 个各自为政的组装点，并顺带修复"REST 回合没有 RAG"的行为不一致。S1 落地后，本工厂的 RAG 获取改走 `services/rag/registry.py` 单例（§11.1）。

**改动 1：新建 `backend/app/services/interview/runtime.py`**：

```python
"""面试运行时装配工厂：LLM / Agent / RAG / Runner 的组装知识收口在面试域内。

api 与 realtime 只调用 :func:`build_interview_runtime`，不再各自拼装；
RAG 为可选依赖：未配置 API Key 或不可用时降级为无 RAG 模式。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession
from app.services.interview.agent import InterviewAgent
from app.services.interview.runner import InterviewRunner
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)


@dataclass
class InterviewRuntime:
    """一次面试会话的运行时组件集合。"""

    llm: LLMClient
    agent: InterviewAgent
    runner: InterviewRunner
    rag: Any  # RAGBackend 协议实现或 None


def build_interview_runtime(
    session: InterviewSession,
    db: Session,
    *,
    with_rag: bool = True,
) -> InterviewRuntime:
    """组装面试运行时。

    ``llm.api_key`` 为空时仍返回 runtime（调用方负责按既有语义拒绝/降级），
    但跳过 RAG 获取。RAG 后端来自进程级注册表（单例，见 services/rag/registry.py）；
    该模块未落地前，可暂时保留原 try/except 实例化逻辑，行为不变。
    """
    llm = LLMClient.from_db(db)
    agent = InterviewAgent(session, llm)

    rag = None
    if with_rag and llm.api_key:
        try:
            from app.services.rag.registry import get_rag_backend

            rag = get_rag_backend(llm)
        except Exception as e:
            logger.warning("RAG 获取失败，继续无 RAG 模式: %s", e)

    runner = InterviewRunner(session, llm, agent, rag=rag)
    return InterviewRuntime(llm=llm, agent=agent, runner=runner, rag=rag)
```

**改动 2：`backend/app/realtime/connection_lifecycle.py:160-175`** —— 替换组装段：

```python
# 改前（160-175 行，逐字见 §6-C6 证据块）
# 改后
            from app.services.interview.runtime import build_interview_runtime

            runtime = build_interview_runtime(session, db)
            self.llm = runtime.llm
            if not self.llm.api_key:
                await self._fail_and_close("请先配置面试思考处理器的 API Key")
                return
            self.agent = runtime.agent
            self.runner = runtime.runner
```

（顶部 `from app.services.interview.agent import InterviewAgent` 等 import 若仅用于类型标注可保留；原函数内 RAG lazy import 段删除。）

**改动 3：`backend/app/api/interview.py` 的 `start_interview`（160-165 行）与 `send_message`（200-205 行）**：

```python
# 改前（两处相同的组装）
    llm = LLMClient.from_db(db)
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 LLM API Key")

    agent = InterviewAgent(session, llm)
    runner = InterviewRunner(session, llm, agent)

# 改后（两处）
    from app.services.interview.runtime import build_interview_runtime

    runtime = build_interview_runtime(session, db)
    llm = runtime.llm
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 LLM API Key")
    agent = runtime.agent
    runner = runtime.runner
```

> 行为变化（有意为之，要在 PR 描述里写明）：REST 回合从此与 WS 回合一样带 RAG 检索；若不希望 REST 开 RAG，`build_interview_runtime(..., with_rag=False)`。

**验证**：

```
cd backend && python -m pytest tests/test_ws_handler.py tests/test_runner.py tests/test_smoke.py -q
```

手工：分别用 WS 与 REST 各开一场绑定同一公司的面试，确认两条路径的日志都出现 `RAG 命中`（或都无命中），行为一致。

### 10.7 C7：`GrowthRecord` 构造收口到 growth 域

**改动 1：`backend/app/services/growth/learning.py` 新增**：

```python
def build_growth_record(session: InterviewSession, report: Any) -> "GrowthRecord":
    """从面试报告构造 GrowthRecord（growth_records 表结构知识归 growth 域）。

    面试报告模块只调用本函数，不再直接拼装字段 JSON。
    """
    import json as _json

    from app.models import GrowthRecord

    weaknesses = list(getattr(report, "weaknesses", None) or [])
    training_plan = list(getattr(report, "training_plan", None) or [])
    return GrowthRecord(
        profile_id=session.profile_id,
        session_id=session.id,
        weak_skills=_json.dumps(weaknesses, ensure_ascii=False),
        common_mistakes=_json.dumps(weaknesses[:3], ensure_ascii=False),
        training_plan=_json.dumps(training_plan, ensure_ascii=False),
    )
```

**改动 2：`backend/app/services/interview/report.py:288-294`** —— 替换构造段：

```python
# 改前
            growth = GrowthRecord(
                profile_id=session.profile_id,
                session_id=session.id,
                weak_skills=json.dumps(report.weaknesses, ensure_ascii=False),
                common_mistakes=json.dumps(report.weaknesses[:3], ensure_ascii=False),
                training_plan=json.dumps(report.training_plan, ensure_ascii=False),
            )

# 改后
            from app.services.growth.learning import build_growth_record

            growth = build_growth_record(session, report)
```

（`report.py` 函数内 `from app.models import GrowthRecord` 的 lazy import 行同时删除；`db.add(growth)` 不变。）

**验证**：

```
cd backend && python -m pytest tests/test_growth_learning.py tests/test_report_stream.py -q
```

### 10.8 C8：模块级 settings 延迟到使用点

逐文件处理（每处都是同一模式：删模块级赋值，使用点改调 `get_settings()`）：

| 文件:行 | 现状 | 改法 |
| --- | --- | --- |
| `api/resume.py:46` | `settings = get_settings()` 模块级 | 删除；`upload_resume`（190 行）、`delete_resume`（450 行）内改 `settings = get_settings()` 局部变量 |
| `realtime/connection_lifecycle.py:39` | 模块级 | 删除；`handle()` 内用到 `settings.whisper_model` 的两处（187、216 行附近）改为局部取值 |
| `realtime/ws_handler.py:59` | 模块级，供 `__init__` 默认值 | 删除；`__init__` 开头加 `settings = get_settings()` 局部变量即可（`__init__` 内全部引用不动） |
| `realtime/voice_pipeline.py:19` | 模块级，`_SentenceTTSQueue.__init__` 使用 | 删除；`_SentenceTTSQueue.__init__` 内局部取值 |
| `main.py:46` | 模块级 | lifespan / CORS 检查是启动期一次性代码，**可保留**，但建议统一改为函数内取值以保持一致性 |

**验证**：全量 `cd backend && python -m pytest -q`（settings 相关 monkeypatch 测试集中在 `tests/test_main.py`、`tests/test_security*.py`）。

### 10.9 C9：仓库卫生（需用户确认后执行删除）

> AGENTS.md 规则："never remove pre-existing code unless asked"。以下删除项**先向用户确认**再执行。

1. 删除一次性重构脚本：`backend/_split_agent.py`、`backend/_split_turn.py`；
2. 删除残留状态目录：仓库根 `chroma_07e848/` 及 `backend/chroma_*/` 共 111+ 个目录（先 `dir /b /ad backend | rg "^chroma_"` 确认全部为空或仅为历史残留；正确的 Chroma 目录是 `backend/data/chroma/`，**不要碰它**）；
3. 删除审计/调试残留：`_audit_be.txt`、`_audit_fe.txt`、`debug-c65d67.log`；`.git.backup-20260709-222320/`（确认当前仓库无 `.git` 或已有远端备份后删除）；
4. 检查 `.gitignore` 是否已含 `chroma_*/`、`*.log`、`.uploads/`、`uploads/`（没有则补上）。

**验证**：删除后 `cd backend && python -m pytest -q` 全绿 + 手动启动 `uvicorn app.main:app --port 8000` 正常。

---

## 11. 逐项改动指南：启动耦合族 S（v2 新增）

### 11.1 S1：RAG 后端进程级单例（`services/rag/registry.py`）

**为什么**：见 §7-S1。RAG 后端是进程级共享资源，必须只初始化一次；每次获取时刷新 llm 引用以支持用户更新 BYOK 凭据。

**改动 1：新建 `backend/app/services/rag/registry.py`**：

```python
"""RAG 后端进程级注册表：全进程共享一个后端实例。

背景：``LocalEmbeddingRAG`` 构造即打开 Chroma ``PersistentClient``，
按 WS 连接 / REST 请求实例化会反复初始化向量库（Windows 上还有文件锁风险）。
用户在设置页更新 LLM 凭据后无需重启：每次 :func:`get_rag_backend` 刷新
后端持有的 llm 引用，不重建后端。
"""

from __future__ import annotations

import logging
import threading

from app.config import get_settings
from app.services.llm.client import LLMClient
from app.services.rag.base import RAGBackend
from app.services.rag.factory import build_rag_backend

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_backend: RAGBackend | None = None
_backend_kind: str | None = None


def get_rag_backend(llm: LLMClient) -> RAGBackend | None:
    """获取进程级 RAG 后端；配置为 none 或实例化失败时返回 None。

    - 实例按 ``settings.rag_backend`` 的 kind 缓存，kind 变更时重建；
    - 每次调用刷新 llm 引用，保证 BYOK 配置更新即时生效；
    - 实例化失败返回 None（上层按无 RAG 模式运行，与既有降级语义一致）。
    """
    global _backend, _backend_kind
    settings = get_settings()
    kind = str(settings.rag_backend)
    with _lock:
        if _backend is not None and _backend_kind == kind:
            try:
                setattr(_backend, "_llm", llm)  # 刷新凭据引用，不重建
            except Exception:
                pass
            return _backend
        try:
            _backend = build_rag_backend(llm=llm, settings=settings)
            _backend_kind = kind
        except Exception as e:
            logger.warning("RAG 后端实例化失败，保持无 RAG 模式: %s", e)
            _backend = None
            _backend_kind = None
            return None
        return _backend


def reset_rag_backend_for_tests() -> None:
    """测试用：清空缓存的后端实例。"""
    global _backend, _backend_kind
    with _lock:
        _backend = None
        _backend_kind = None
```

**改动 2：`backend/app/realtime/connection_lifecycle.py:167-173`**（若 C6 已落地则此处已被 runtime 工厂取代，改工厂内部即可）：

```python
# 改前
            rag = None
            try:
                from app.services.rag.company_rag import CompanyKnowledgeRAG

                rag = CompanyKnowledgeRAG(self.llm)
            except Exception as e:
                logger.warning("RAG 实例化失败，继续无 RAG 模式: %s", e)

# 改后
            from app.services.rag.registry import get_rag_backend

            rag = get_rag_backend(self.llm) if self.llm.api_key else None
```

**改动 3：`backend/app/main.py:118-141` `_ensure_rag_index`** —— 用注册表替代手工实例化：

```python
# 改前（137-141 行）
    try:
        rag = CompanyKnowledgeRAG(llm)
        await rag.ensure_index()
    except Exception as e:
        logger.warning("RAG 索引构建失败（启动继续）: %s", e)

# 改后
    try:
        from app.services.rag.registry import get_rag_backend

        backend = get_rag_backend(llm)
        if backend is not None:
            await backend.ensure_index()
    except Exception as e:
        logger.warning("RAG 索引构建失败（启动继续）: %s", e)
```

> 兼容性说明：`CompanyKnowledgeRAG` 包装器保留不动（测试与旧代码直接使用它，见 `rg -n "CompanyKnowledgeRAG" backend`）；`runner`/`tool_round_runner` 构造参数类型标注可从 `CompanyKnowledgeRAG | None` 放宽为 `RAGBackend | None`（两者 duck-type 兼容：`query/query_for_company/kind/build_retrieval_tool` 都被协议覆盖，`tool_round_runner.py:97` 的 `getattr(self.rag, "build_retrieval_tool", None)` 已做防御）。

**验证**：

```
cd backend && python -m pytest tests/test_rag.py tests/test_rag_backends.py -q
```

手工：连开/断开 3 次 WS 面试连接，日志只出现一次 `RAG 后端 = local`（工厂日志）；设置页改 LLM Key 后新开面试，RAG 检索正常（凭据已刷新）。

### 11.2 S2：启动引导注册表（`core/bootstrap.py`）

**为什么**：见 §7-S2。把线性引导流程改为**步骤注册表**：每步自包含、失败语义显式（CRITICAL/OPTIONAL）、结果结构化、供 `/health/ready`（E4）读取。

**改动 1：新建 `backend/app/core/bootstrap.py`**：

```python
"""启动引导编排：每个子系统独立引导、独立失败语义、结果可观测。

原则（启动时脱耦）：
- CRITICAL 步骤失败 → 抛出 RuntimeError 中止启动（缺了它应用无意义，如数据库）；
- OPTIONAL 步骤失败 → 降级继续，结果写入就绪状态；
- 每步自包含，不得 import 其它业务域的引导逻辑。
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class StepResult:
    """单个引导步骤的结果。"""

    name: str
    ok: bool
    critical: bool
    detail: str = ""
    elapsed_ms: int = 0


# 供 /health/ready 读取的进程级状态
_results: list[StepResult] = []


def bootstrap_results() -> list[StepResult]:
    """返回最近一次引导的步骤结果（启动完成前为空列表）。"""
    return list(_results)


async def _run_step(name: str, critical: bool, fn: Callable[[], Any]) -> StepResult:
    start = time.monotonic()
    try:
        if inspect.iscoroutinefunction(fn):
            await fn()
        else:
            await asyncio.to_thread(fn)
        r = StepResult(name=name, ok=True, critical=critical,
                       elapsed_ms=int((time.monotonic() - start) * 1000))
        logger.info("启动步骤 %-16s OK (%dms)", name, r.elapsed_ms)
        return r
    except Exception as e:
        r = StepResult(name=name, ok=False, critical=critical,
                       detail=str(e)[:200],
                       elapsed_ms=int((time.monotonic() - start) * 1000))
        if critical:
            logger.error("启动步骤 %-16s 失败（关键，中止启动）: %s", name, e)
        else:
            logger.warning("启动步骤 %-16s 失败（可选，降级继续）: %s", name, e)
        return r


async def run_bootstrap_steps(
    steps: list[tuple[str, bool, Callable[[], Any]]],
) -> list[StepResult]:
    """顺序执行引导步骤；关键步骤失败抛出 RuntimeError 中止启动。

    Args:
        steps: ``(步骤名, 是否关键, 无参可调用)`` 列表，按声明顺序执行。
    """
    global _results
    _results = []
    for name, critical, fn in steps:
        r = await _run_step(name, critical, fn)
        _results.append(r)
        if critical and not r.ok:
            raise RuntimeError(f"关键启动步骤失败: {name}: {r.detail}")
    ok = sum(1 for r in _results if r.ok)
    degraded = [r.name for r in _results if not r.ok]
    logger.info(
        "启动完成: %d/%d 步骤成功%s",
        ok, len(_results),
        f"，降级: {', '.join(degraded)}" if degraded else "",
    )
    return _results
```

**改动 2：`backend/app/main.py` lifespan（63-96 行）改为步骤声明**：

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭钩子：步骤化引导，关键失败中止、可选失败降级。"""
    from app.core.bootstrap import run_bootstrap_steps

    await run_bootstrap_steps([
        ("upload_dir", True, _ensure_upload_dir),
        ("database", True, _bootstrap_db_and_seed),
        ("rag_index", False, _ensure_rag_index_safe),
    ])
    logger.info("InterviewOS 后端已启动 env=%s", settings.env)
    try:
        yield
    finally:
        # （关闭逻辑保持不变：测试模式跳过 dispose，否则 to_thread 释放引擎）
        if not settings.is_prod and os.environ.get("INTERVIEWOS_TEST_MODE") == "1":
            logger.debug("测试模式：跳过 engine dispose")
        else:
            try:
                await asyncio.to_thread(_shutdown_engine)
            except Exception:
                logger.exception("关闭阶段释放引擎失败")
        logger.info("InterviewOS 后端已关闭")


def _ensure_upload_dir() -> None:
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)


async def _ensure_rag_index_safe() -> None:
    """OPTIONAL 步骤包装：内部仍保留既有 try/except，双保险。"""
    rag_db = SessionLocal()
    try:
        await _ensure_rag_index(rag_db)
    finally:
        try:
            rag_db.close()
        except Exception:
            pass
```

（`_bootstrap_db_and_seed`、`_ensure_rag_index`、`_shutdown_engine` 保持原样。）

**验证**：

```
cd backend && python -m pytest tests/test_main.py tests/test_smoke.py -q
```

手工：把 `RAG_BACKEND` 设为 `stepfun` 且不给 key → 启动日志出现 `rag_index 失败（可选，降级继续）` 与 `启动完成: 2/3 步骤成功，降级: rag_index`，应用正常服务；把 `DATABASE_URL` 指向无权限目录 → 启动中止，日志明确写 `关键启动步骤失败: database`。

### 11.3 S3：迁移失败改为 fail-fast（含测试同步修改）

**为什么**：见 §7-S3。**注意：这是对既有有意设计的语义反转，必须在 PR 描述中明确写出权衡**：当前的"静默继续"有测试背书（`test_migrate.py:106`），改后该测试必须反转。

**改动 1：`backend/app/core/migrate.py`** —— `apply_column_migrations` 收集失败并在最后抛出：

```python
# 改前（108-149 行的 except 段，逐字见 §7-S3 证据块）
        except (OperationalError, IntegrityError) as e:
            logger.error("迁移失败 %s（事务已回滚）: %s", table, e, exc_info=True)
        except Exception as e:
            logger.error(...)

# 改后：函数开头加 failures 收集，结尾统一抛出
def apply_column_migrations(engine: Engine) -> dict[str, list[str]]:
    """幂等补齐缺失列。返回 ``{table: [applied_sql, ...]}``。

    任何一张表迁移失败：记录后**继续尝试其余表**，最后统一抛出
    ``RuntimeError``——schema 是公共地基，带病启动会把启动期错误
    放大为运行期全量 500（企业级 fail-fast 语义）。
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: dict[str, list[str]] = {}
    failures: list[str] = []

    for table, statements in MIGRATIONS.items():
        # ……（中间逻辑保持不变：跳过缺失表、按列过滤、事务执行）……
        try:
            with engine.begin() as conn:
                for stmt in to_apply:
                    conn.execute(text(stmt))
                    logger.info("迁移成功: %s", stmt[:80])
            applied[table] = to_apply
        except (OperationalError, IntegrityError) as e:
            logger.error("迁移失败 %s（事务已回滚）: %s", table, e, exc_info=True)
            failures.append(f"{table}: {e}")
        except Exception as e:
            logger.error("迁移失败 %s（事务已回滚，未知异常类型）: %s", table, e, exc_info=True)
            failures.append(f"{table}: {e}")

    if failures:
        raise RuntimeError(
            "数据库迁移失败（已中止启动）：" + "；".join(failures)
            + "。处置建议：备份 data/interviewos.db 后检查表结构，"
              "或在确认数据可重建时删除该文件重新初始化。"
        )
    # ……（原有日志与 return applied 保持不变）……
```

**改动 2：`backend/tests/test_migrate.py:106`** —— 反转断言：

```python
# 改前：test_failed_alter_silently_continues_other_tables（断言静默继续）
# 改后：
def test_failed_alter_aborts_startup() -> None:
    """企业级 fail-fast：任一表迁移失败 → 抛出 RuntimeError 中止启动。"""
    # （构造与原来相同的"故意语法错误的 ALTER"场景）
    with pytest.raises(RuntimeError, match="数据库迁移失败"):
        apply_column_migrations(engine)
```

（保留原测试的夹具构造，仅把"静默继续"断言换成 `pytest.raises`；具体夹具代码以原测试为准复用。）

**验证**：

```
cd backend && python -m pytest tests/test_migrate.py tests/test_main.py -q
```

### 11.4 S4：移除 database 模块 import 时建引擎

**为什么**：见 §7-S4。影响面已核实：模块级 `engine` 仅 `main.py:38` 使用；`SessionLocal` 有 6 个消费方，全部以 `SessionLocal()` 调用。

**改动：`backend/app/database.py:83-86`**：

```python
# 改前
# 向后兼容：模块级别名。首次访问时调用工厂，确保总是最新的实例。
# 注意：导入这些模块级名称后会触发首次实例化，请在 setenv 之后再导入。
engine = get_engine()
SessionLocal = get_session_factory()

# 改后（零 import 时副作用；保持全部既有调用形态）
def SessionLocal() -> Session:  # noqa: N802 — 保留既有 ``SessionLocal()`` 调用形态
    """惰性构造一个 Session（内部走双检锁工厂）。

    替代原模块级 ``SessionLocal = get_session_factory()``：
    import 本模块不再触发引擎实例化，启动顺序由 lifespan 编排控制。
    """
    return get_session_factory()()


def get_default_engine() -> Engine:
    """语义化别名：替代原模块级 ``engine`` 变量。"""
    return get_engine()
```

**`backend/app/main.py`** 相应替换（import 行 38 + 三处使用）：

```python
# 改前
from app.database import engine, init_db, SessionLocal
# ...
    await asyncio.to_thread(_bootstrap_db_and_seed)   # 内部 run_migrations(engine)
# ...
        engine.dispose()

# 改后
from app.database import get_engine, init_db, SessionLocal
# ...
# _bootstrap_db_and_seed 内：run_migrations(get_engine())
# _shutdown_engine 内：get_engine().dispose()
```

**影响面排查**：

```
rg -n "from app.database import engine|database\.engine" backend -g "*.py" -g "!__pycache__"
```

预期：改后零命中；`SessionLocal()` 调用方零改动。

**验证**：

```
cd backend && python -m pytest tests/test_main.py tests/test_migrate.py -q
```

---

## 12. 逐项改动指南：企业级韧性族 E（v2 新增）

### 12.1 E1：SQLite 并发加固（WAL + busy_timeout + synchronous）

**为什么**：见 §8-E1。纯连接层改动，业务代码零修改。

**改动：`backend/app/database.py`**：

```python
# 在 get_engine() 的 create_engine 之后（54 行附近）追加：

def _sqlite_pragmas(dbapi_conn, _conn_record) -> None:
    """SQLite 连接级加固（企业级标配三件套 + 外键）。

    - WAL：读写不互斥，解决 WS 回合写状态与后台报告/REST 并发写的锁冲突；
    - busy_timeout：写冲突时等待 5s 而非立刻 ``database is locked``；
    - synchronous=NORMAL：WAL 下仍保证崩溃安全的性能档；
    - foreign_keys=ON：当前模型无外键，开启防未来漏配。
    """
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


# get_engine() 内，create_engine 之后、返回之前：
        _engine = create_engine(url, connect_args=connect_args, **pool_kwargs)
        if url.startswith("sqlite") and ":memory:" not in url and url != "sqlite://":
            from sqlalchemy import event

            event.listen(_engine, "connect", _sqlite_pragmas)
```

> 注意：`:memory:` 测试库跳过（WAL 对内存库无意义，且 StaticPool 单连接无并发问题）；测试全量回归确认无 fixture 依赖默认 journal 模式。

**验证**：

```
cd backend && python -m pytest -q
```

手工并发对拍：开一场 WS 面试连续对话，同时在另一浏览器标签触发简历深度分析与报告生成，观察日志无 `database is locked`；用 SQLite 命令行确认 `PRAGMA journal_mode;` 返回 `wal`。

### 12.2 E2：LLM 出口熔断器（`services/llm/circuit_breaker.py`）

**为什么**：见 §8-E2。提供商宕机时快速失败 + 自动恢复，且与全部既有降级路径兼容（熔断错误就是一种异常）。

**改动 1：新建 `backend/app/services/llm/circuit_breaker.py`**：

```python
"""LLM 出口熔断器：提供商连续故障时快速失败，冷却后半开试探。

为什么需要：``LLMClient`` 每请求新建（from_db），熔断状态必须独立于
实例存在——按 ``api_base`` 维度进程级共享。

状态机：
    闭合（正常）── 连续失败 ≥3 ──► 打开（30s 内调用快速失败）
    打开 ── 冷却结束，放行一个试探 ── 成功 ──► 闭合
                                   └── 失败 ──► 重新打开（重新计时）

只统计"提供商侧故障"（429 / 5xx / 网络错误）；4xx（如 Key 错误）不计数——
那是用户配置问题，不是提供商宕机，熔断无意义。
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_FAILURE_THRESHOLD = 3       # 连续失败几次后打开
_COOLDOWN_SEC = 30.0         # 打开后冷却时长


class CircuitOpenError(RuntimeError):
    """熔断打开：调用方应视为"提供商暂时不可用"（快速失败语义）。"""


@dataclass
class _Breaker:
    consecutive_failures: int = 0
    opened_until: float = 0.0  # time.monotonic() 时间戳


_lock = threading.Lock()
_breakers: dict[str, _Breaker] = {}


def before_call(api_base: str) -> None:
    """调用前检查：熔断打开且未过冷却期 → 抛 CircuitOpenError（快速失败）。"""
    with _lock:
        b = _breakers.get(api_base)
        if b is None or b.opened_until <= 0:
            return
        if time.monotonic() < b.opened_until:
            raise CircuitOpenError(
                f"LLM 提供商熔断中（连续失败 {b.consecutive_failures} 次，"
                "冷却 30s），请稍后重试或检查 API 配置"
            )
        # 冷却结束：放行试探（不重置计数，由 after_call 决定闭合/重开）


def after_call(api_base: str, ok: bool) -> None:
    """调用后上报结果：成功闭合；失败累计，达阈值打开。"""
    with _lock:
        b = _breakers.setdefault(api_base, _Breaker())
        if ok:
            if b.consecutive_failures or b.opened_until:
                logger.info("LLM 熔断恢复 api_base=%s", api_base)
            b.consecutive_failures = 0
            b.opened_until = 0.0
            return
        b.consecutive_failures += 1
        if b.consecutive_failures >= _FAILURE_THRESHOLD:
            b.opened_until = time.monotonic() + _COOLDOWN_SEC
            logger.warning(
                "LLM 熔断打开 api_base=%s 连续失败=%d 冷却=%.0fs",
                api_base, b.consecutive_failures, _COOLDOWN_SEC,
            )


def reset_breakers_for_tests() -> None:
    with _lock:
        _breakers.clear()
```

**改动 2：`backend/app/services/llm/client.py`** —— 在 `chat` / `chat_message` / `chat_stream` / `embed` 四个方法的请求块前后接入：

```python
# 以 chat() 为例（220-262 行），在 pinned client 块前后包裹：

        from app.services.llm.circuit_breaker import after_call, before_call

        before_call(self.api_base)
        try:
            async with make_pinned_async_client(
                self.api_base, allow_local=_is_local_allowed(), require_https=_require_https(), timeout=180.0
            ) as client:
                try:
                    resp = await _retry_request(
                        lambda: client.post(url, headers=headers, json=payload)
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPStatusError as e:
                    logger.warning(...)
                    raise
            after_call(self.api_base, True)          # 成功：闭合
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response else 0
            # 只有 429/5xx 计入熔断；4xx 是用户配置问题
            after_call(self.api_base, ok=not (status == 429 or status >= 500))
            raise
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteError, httpx.RemoteProtocolError):
            after_call(self.api_base, False)          # 网络故障：计入
            raise
```

（`UnsafeURLError` 等本地校验异常在 `before_call` 之前抛出，不经过熔断统计——它们不是提供商故障。`chat_stream` 的接入点同理：建连阶段失败计入；**已开始 yield token 后的中流断开也计入失败**（提供商不稳定），但不做重试——与现有语义一致。）

**各调用方无需改动**：`CircuitOpenError` 是 `RuntimeError` 子类，现有 `except Exception` 降级路径（面试 error 事件、简历 502、prep SSE error）全部自动生效，只是从"卡数秒"变成"毫秒级"。

**验证**：

```
cd backend && python -m pytest tests/test_llm_client_retry.py -q
```

新增单元测试建议（可放进 `tests/test_llm_client_retry.py` 或新文件）：mock 连续 3 次 5xx → 第 4 次调用在 5ms 内抛 `CircuitOpenError`；monkeypatch `time.monotonic` 推进 31s → 下一次调用放行并成功 → 熔断闭合。

手工：把 `LLM_API_BASE` 改为不可达地址，连续触发 3 次面试回合（每次仍会重试，符合预期）→ 第 4 次起毫秒级报"熔断中"；31 秒后自动恢复。

### 12.3 E3：LLM 并发舱壁（`services/llm/bulkhead.py`）

**为什么**：见 §8-E3。交互流量（面试回合/hint/prep/简历分析）与后台流量（报告生成/RAG 建索引 embed）分池，互不饿死。

**改动 1：新建 `backend/app/services/llm/bulkhead.py`**：

```python
"""LLM 并发舱壁：交互式与后台流量分池，互不饿死。

- interactive 池（6）：面试回合 / hint / prep / 简历分析 —— 用户正在等的；
- background 池（2）：报告生成 / RAG 索引 embed —— 可以慢慢做的。

 sizing 依据：本地单用户场景下，厂商端常见并发限制为个位数；
 交互池保证实时回合永远拿得到出口，后台池防止长任务（180s 深分析）
 占满全部出口拖慢面试。
"""

from __future__ import annotations

import asyncio

_INTERACTIVE = asyncio.Semaphore(6)
_BACKGROUND = asyncio.Semaphore(2)


def lane_semaphore(lane: str) -> asyncio.Semaphore:
    """按流量类型取信号量；未知 lane 一律按交互处理（宁可优先，不可饿死）。"""
    return _BACKGROUND if lane == "background" else _INTERACTIVE
```

**改动 2：`backend/app/services/llm/client.py`** —— 四个方法加 `lane` 参数，在 HTTP 块外套信号量：

```python
# 方法签名（chat / chat_message / chat_stream / chat_json / embed 同样处理）：
    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        response_format: dict[str, str] | None = None,
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int | None = None,
        *,
        lane: str = "interactive",
    ) -> str:

# 请求块外（before_call 之后）：
        from app.services.llm.bulkhead import lane_semaphore

        async with lane_semaphore(lane):
            ...原有请求逻辑...
```

**改动 3：后台流量显式声明 lane**：

| 位置 | 调用 | 改动 |
| --- | --- | --- |
| `services/interview/report.py:166` | `llm.chat_json(...)`（报告生成） | 加 `lane="background"` |
| `services/interview/report.py:342` | `llm.chat_stream(...)`（流式报告） | 加 `lane="background"` |
| `services/rag/local_backend.py:64` | `self._llm.embed(texts)`（索引构建） | 加 `lane="background"` |

其余调用（面试回合、hint、prep、简历分析、报告页手动补生成）保持默认 `interactive`。

**验证**：

```
cd backend && python -m pytest tests/test_llm_client_retry.py tests/test_report_stream.py -q
```

手工：触发简历深度分析（180s 长调用）的同时进行面试对话，对比改动前后的 token 出字延迟；后台报告生成与面试回合并发，回合延迟无显著劣化。

### 12.4 E4：就绪探针（`/health/live` + `/health/ready`）

**为什么**：见 §8-E4。依赖 S2 的 bootstrap 状态。

**改动：`backend/app/main.py`**（在既有 `/health` 旁新增；保留 `/health` 兼容）：

```python
@app.get("/health/live")
def health_live():
    """存活探针：进程活着即 200，不查任何依赖。"""
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """就绪探针：关键依赖 + 各引导步骤状态清单。

    - db 不可查 → 503（未就绪）；
    - 有 OPTIONAL 步骤失败 → 200 + ``degraded`` 清单（服务可用，部分功能降级）；
    - 全绿 → 200 + ``ready``。
    """
    from sqlalchemy import text as _text

    from app.core.bootstrap import bootstrap_results

    db_ok = True
    try:
        def _probe() -> None:
            db = SessionLocal()
            try:
                db.execute(_text("SELECT 1"))
            finally:
                db.close()

        await asyncio.to_thread(_probe)
    except Exception:
        db_ok = False

    steps = [
        {"name": r.name, "ok": r.ok, "critical": r.critical, "detail": r.detail}
        for r in bootstrap_results()
    ]
    degraded = [s["name"] for s in steps if not s["ok"] and not s["critical"]]

    llm_configured = False
    try:
        def _llm_row() -> bool:
            db = SessionLocal()
            try:
                row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
                return bool(row and row.api_key)
            finally:
                db.close()

        llm_configured = await asyncio.to_thread(_llm_row)
    except Exception:
        pass

    payload = {
        "status": "ready" if db_ok and not degraded else ("degraded" if db_ok else "not_ready"),
        "db": db_ok,
        "llm_configured": llm_configured,
        "degraded": degraded,
        "bootstrap": steps,
    }
    if not db_ok:
        return JSONResponse(status_code=503, content=payload)
    return payload
```

（import 区补 `from app.models import LLMSettings`、`from fastapi.responses import JSONResponse`——`main.py` 已有 `JSONResponse`。）

**验证**：启动后 `curl http://127.0.0.1:8000/health/ready` 返回 `ready`；模拟 `rag_index` 降级（§11.2 的手工步骤）后返回 `degraded` 且 `degraded: ["rag_index"]`。

### 12.5 E5：面试工具超时

已并入 §10.5（C5 的 `tool_loop.py` 统一实现，`tool_timeout_sec=15.0`）。不单独实施。

### 12.6 E6：错误码体系落地（指向权威规范文档）

**为什么独立成文**：错误码目录表 + 逐站点迁移对照表篇幅大，且是"新增/修改错误码必须先改文档"的长期权威来源，单独维护在 [`docs/ERROR_CODES.md`](../ERROR_CODES.md)。本节只给落地要点与验证方法。

**改动清单（五个文件新建/修改 + 一批站点迁移）**：

| 顺序 | 位置 | 动作 | 说明 |
| --- | --- | --- | --- |
| 1 | `backend/app/core/errors.py` | **新建** | `ErrorSpec` + `CATALOG` + `ApiBusinessError(HTTPException)` + `raise_error()`，完整可复制代码见 ERROR_CODES.md §5.1 |
| 2 | `backend/app/main.py:237-275` | 修改 | `_envelope` 增加 `hint`/`retryable` 字段；`_http_exception_handler` 优先读 `exc.error_code`；RequestValidationError→`A0001`、UnsafeURLError→`A0007`、兜底 Exception→`B0001`。完整代码见 ERROR_CODES.md §5.2 |
| 3 | `frontend/src/lib/api.ts:69-109` | 修改 | `ApiError` 扩展 `code/hint/traceId/retryable`；`parseErrorResponse` 返回结构化对象不再丢弃 code/trace_id。完整代码见 ERROR_CODES.md §6.1 |
| 4 | REST 报错点逐文件迁移 | 修改 | 按 ERROR_CODES.md §5.3 对照表逐站点迁移（共 51 处，已用 `rg -c "raise HTTPException"` 实测核对）：`api/resume.py` 15 处 → `api/interview.py` 12 处 → `api/reports.py` 4 处 → `api/v1/prep.py` 5 处 → `api/settings.py` 8 处 → `core/{session_auth,local_only,ratelimit}.py` 7 处 |
| 5 | WS/SSE 错误帧带码 | 修改 | 按 ERROR_CODES.md §5.4 对照表：`StreamEvent.make_error` 加 `code` 参数、全部 `send("error", ...)` 调用点加 `code=`、SSE error 事件 JSON 加 `code`；前端 `ServerEvent`/`PrepSSEEvent`/`ReportSSEEvent` 类型同步补字段 |

**关键兼容设计**（保证本项低风险、可分步）：

- `ApiBusinessError` 继承 `HTTPException`，未迁移的旧 `raise HTTPException(...)` 走 `http_{status}` 兜底码——**迁移可以按文件分多次提交，中途任何状态都是自洽的**；
- 前端 `code`/`hint`/`retryable`/`trace_id` 全部可选字段，旧后端响应（无 hint）正常解析；
- WS 无 code 的旧 error 帧前端按 `B0001` 兜底显示，新旧后端都能配新旧前端。

**验证**：

1. `pytest tests/test_main.py tests/test_security.py -q` 全绿（envelope 结构变化是**新增字段**，不断言字段缺失的测试不受影响）；
2. 手工五连抽查（rest）：`curl -X POST http://127.0.0.1:8000/health`（404→`A0404`兜底 http_404）；连续刷接口触发 429→`A0002`；`GET /api/v1/resume/99999`→`A1005`；断网/错 Key 触发分析→`C0001`；响应体五字段（code/message/hint/retryable/trace_id）齐全且为中文；
3. 面试中断开 LLM（改错 api_base），WS error 帧 `{"type":"error","code":"C0001",...}` 到达前端，页面显示 `[C0001] 面试官服务暂时不可用，请稍后重试`；
4. `rg -n "raise HTTPException" backend/app` 命中数降为 0；`rg -n -U 'send\(\s*\n?\s*"error"' backend/app` 全部命中带 `code=`（多行模式，理由见 ERROR_CODES.md §7）；
5. `npx tsc --noEmit` 通过。

---

## 13. 实施路线图（PR 拆分）

| PR | 内容 | 风险 | 验证门槛 |
| --- | --- | --- | --- |
| PR-1 | C1（SessionSnapshot 搬家）+ C2（tool_args 上移） | 极低（纯代码移动 + re-export） | `pytest tests/test_orchestrator.py tests/test_ws_handler.py tests/test_github_tools.py -q` 全绿 + 全量 `pytest -q` |
| PR-2 | E1（SQLite WAL 三件套） | 极低（连接层，业务零改动） | 全量 `pytest -q` + §12.1 并发对拍 |
| PR-3 | C3（REST 报告后台化） | 低（行为变化已论证，前端无感） | `pytest tests/test_report_stream.py -q` + §10.3 故障注入 |
| PR-4 | C4（resume queries 收口）+ C7（growth 工厂） | 低 | `pytest tests/test_runner.py tests/test_github_tools.py tests/test_growth_learning.py tests/test_resume_analysis_normalize.py -q` + §10.4 坏 JSON 验证 |
| PR-5 | S3（迁移 fail-fast，含测试反转）+ S4（惰性引擎） | 中（语义反转，需 PR 描述写明权衡） | `pytest tests/test_migrate.py tests/test_main.py -q` |
| PR-6 | S2（bootstrap 注册表）+ E4（ready 探针） | 低-中 | `pytest tests/test_main.py tests/test_smoke.py -q` + §11.2 手工降级/中止对拍 |
| PR-7 | S1（RAG 单例）+ C6（runtime 工厂） | 低-中（REST 回合新增 RAG，行为变化需声明） | `pytest tests/test_rag.py tests/test_rag_backends.py tests/test_ws_handler.py tests/test_smoke.py -q` + §11.1 三次连接对拍 + WS/REST 对拍 |
| PR-8 | C5（tool_loop 抽取，含 E5 超时） | 中（并发语义参数化） | `pytest tests/test_runner.py tests/test_rag_backends.py -q` + prep 手工触发搜索 |
| PR-9 | E2（熔断器）+ E3（舱壁） | 中（LLM 出口横切） | `pytest tests/test_llm_client_retry.py -q` + §12.2/§12.3 手工对拍 |
| PR-10 | C8（settings 延迟）+ C9（卫生，先确认）+ 启用 §9.5 守护脚本进 CI | 低 | 全量 `pytest -q` + 启动 smoke |
| PR-11 | E6（错误码体系：`core/errors.py` + envelope 扩展 + REST/WS/SSE 全站点迁移 + 前端 ApiError） | 低-中（横切全部报错点，但兼容设计保证可分步） | §12.6 验证五步（pytest + 五连抽查 + WS 故障注入 + rg 清零 + tsc） |

> 顺序理由：PR-1/2 零风险先行建立信心；PR-5/6 是启动脱耦主体，放在结构清理之后、RAG 单例之前（S2 的 ready 探针要展示 S1 的单例状态）；PR-8/9 横切 LLM 出口，放在所有域边界收口完成之后，避免与前面的改动互相冲突。PR-11 与结构改动正交（只动报错姿势不动调用关系），但因 E2 熔断器会抛出 `C0003`（见 ERROR_CODES.md 目录），建议排在 PR-9 之后；若提前做，熔断器落地时再补 `C0003` 一处映射即可。

**完成判定标准**（全部满足才算收工）：

1. `cd backend && python -m pytest -q` 全绿；
2. `python scripts/check_architecture_rules.py` 输出"检查通过"；
3. `rg -n "from app.realtime" backend/app/agents` 零结果；
4. `rg -n "from app.services.interview" backend/app/agents` 零结果；
5. `rg -n "db.query(Resume" backend/app/services backend/app/agents` 仅命中 `services/resume/queries.py`；
6. `rg -n "engine = get_engine()$" backend/app` 零结果（无模块级引擎实例化）；
7. 附录 B 故障注入矩阵全部条目按预期表现；
8. `rg -n "raise HTTPException" backend/app` 零结果（`main.py` docstring 文字命中除外）、`rg -n -U 'send\(\s*\n?\s*"error"' backend/app` 全部命中带 `code=`（错误码迁移完成判定，详见 ERROR_CODES.md §7）。

---

## 14. 附录 A：实测跨域 import 证据清单（ripgrep 原始结果摘要）

命令：`rg -n --no-heading "^(from|import) app\." backend/app/{services,agents,api,realtime} -g "*.py" | rg -v "__pycache__"`

**跨业务域依赖（审查关注对象）**：

| 消费方 | 被依赖方 | 性质 | 处置 |
| --- | --- | --- | --- |
| `agents/orchestrator.py:7` | `realtime.events.SessionSnapshot` | ❌ 层级倒挂 | C1 |
| `agents/prep/agent.py:18` | `services/interview/tools.parse_tool_arguments` | ❌ 跨域内部复用 | C2 |
| `agents/prep/agent.py:14` | `models.Resume`（直读） | ⚠️ 域边界渗漏 | C4 |
| `services/interview/agent.py:16` | `models.Resume`（直读） | ⚠️ 域边界渗漏 | C4 |
| `services/interview/tools.py:19` | `models.Resume`（直读） | ⚠️ 域边界渗漏 | C4 |
| `services/interview/report.py`（lazy） | `models.GrowthRecord`（直写） | ⚠️ 域边界渗漏 | C7 |
| `services/rag/_kb_data.py:16` | `services/company/knowledge.BUILTIN_COMPANIES` | ✅ 数据下沉，方向合理 | 不动 |
| `services/interview/*` | `services/company/knowledge.get_company_context` | ✅ 经公开函数 | 不动 |
| `services/interview/tools.py:21-22`、`agents/prep/agent.py:17,20` | `services/github`、`services/search` | ✅ 共享工具服务 | 不动 |
| `services/interview/{runner,streaming_consumer,tool_round_runner}` | `services/rag.company_rag` | ✅ 经工厂/协议，运行时可降级 | 不动 |
| `services/voice/*` | `services/stt`、`services/tts` | ✅ voice 本就是 stt/tts 的编排层 | 不动 |
| 全部 AI 域 | `services/llm/client.LLMClient` | ✅ 有意共享（§9.3） | 不动 |

**符合声明的干净区域**（无跨域依赖）：`core/*`（零上层依赖）、`api/*`（只向下）、`services/resume`（只依赖 llm/core/schemas）、`services/growth`（只依赖 core/models）、`realtime` 内部 mixin 之间。

## 15. 附录 B：故障注入验证矩阵（运行时 + 启动 + 冲击）

### 15.1 运行时（脱耦）

| # | 注入故障 | 预期：简历深度分析 | 预期：实时面试 | 预期：prep 辅导 |
| --- | --- | --- | --- | --- |
| 1 | LLM base 改不可达 | `/analyze` 502，文案脱敏 | WS 收到 error 事件，连接保持，可重试 | SSE error 事件 |
| 2 | LLM 恢复正常后 | 可重试成功 | 同会话继续可用 | 可重试成功 |
| 3 | `resumes.parsed_profile` 写成非法 JSON | `/list` 仍 200（该条降级） | 开场正常（按无档案） | 正常（无简历上下文） |
| 4 | `data/system_learning.json` 写成垃圾 | 不受影响 | 开场正常（少学习摘要，日志 warning） | 不受影响 |
| 5 | GitHub API 不可达 | 不受影响 | 工具结果含 error，回合继续 | 工具降级文案，辅导继续 |
| 6 | `RAG_BACKEND=stepfun` 但无有效 key | 不受影响 | 日志"RAG 获取失败"，面试继续 | 不受影响 |
| 7 | 报告生成时 LLM 超时（C3 后） | 不受影响 | `send_message` 200，报告页稍后补生成 | 不受影响 |

### 15.2 启动时（S 族落地后）

| # | 注入故障 | 预期启动行为 |
| --- | --- | --- |
| 8 | `data/chroma` 目录删除或只读 | 启动继续，日志 `rag_index 失败（可选）`；`/health/ready` 显示 `degraded: ["rag_index"]`；面试无 RAG 照常 |
| 9 | `data/interviewos.db` 换成损坏文件 | 启动**中止**，日志 `关键启动步骤失败: database`，错误信息含处置建议 |
| 10 | 人为制造一条语法错误的 ALTER（改 MIGRATIONS 后启动） | 启动**中止**（S3 后），`RuntimeError: 数据库迁移失败`；测试 `test_failed_alter_aborts_startup` 通过 |
| 11 | `UPLOAD_DIR` 指向无权限路径 | 启动中止（CRITICAL），错误明确 |
| 12 | 无 LLM Key 启动（BYOK 合法状态） | 启动正常，`/health/ready` 显示 `llm_configured: false`；配置 Key 后无需重启即可用 |

### 15.3 冲击（E 族落地后）

| # | 注入冲击 | 预期表现 |
| --- | --- | --- |
| 13 | LLM 连续 3 次 5xx/超时 | 第 4 次调用起毫秒级 `CircuitOpenError`；30s 后半开；恢复后自动闭合（日志"熔断恢复"） |
| 14 | 简历深分析（180s 长调用）+ 面试回合并发 | 回合 token 延迟无显著劣化（交互池 6/后台池 2 隔离） |
| 15 | WS 回合写状态 + 后台报告写库 + REST 列表读并发 | 无 `database is locked`（WAL + busy_timeout=5000） |
| 16 | 连开/断开 3 次 WS 面试 | 日志仅一次 RAG 后端初始化；改 LLM Key 后新连接 RAG 正常 |
| 17 | 面试中 GitHub 工具挂起（不响应） | 15s 后工具超时文案喂回 LLM，回合继续，不占回合锁 |

全部通过后，"简历坏不影响面试、面试坏不影响简历、启动任一可选子系统坏不影响整站、外部冲击快速失败且自动恢复"即为**实证成立**，而非推断。

## 16. 附录 C：韧性模式清单（现状 → 目标）

| 模式 | 现状 | 目标（本报告落地后） |
| --- | --- | --- |
| 超时 | ✅ LLM 60-180s 分级、prep 工具 18s、TTS/心跳 30s | ✅ 补面试工具 15s（E5） |
| 重试 | ✅ LLM 429/5xx 指数退避 ×3；4xx 不重试 | 保持 |
| 熔断 | ❌ 无 | ✅ E2（按 api_base，3 次失败/30s 冷却） |
| 舱壁 | ❌ 无 | ✅ E3（interactive=6 / background=2） |
| 降级（fail-soft） | ✅ RAG/工具/搜索/学习/简历解析/Whisper 全链路 | 保持；RAG 改单例后语义不变 |
| 快速失败（fail-fast） | ✅ prod CORS/SECRET 门禁 | ✅ 补 schema 迁移（S3）、DB/目录引导（S2） |
| 限流 | ✅ 进程内滑动窗口，普通 60/min、LLM 10/min、WS 按会话 | 保持 |
| 并发安全 | ✅ 报告哨兵 CAS + 进程锁；激活简历行锁；growth 双层锁 | 保持 |
| 崩溃恢复 | ✅ 报告哨兵卡死自愈（`report.py:205-229`）；WS 断连状态落库可重连 | 保持 |
| 探针 | ⚠️ 静态 /health | ✅ /health/live + /health/ready（E4） |
| 资源生命周期 | ❌ RAG 按连接实例化 | ✅ 进程级单例（S1） |
| 启动编排 | ❌ 线性单体 | ✅ 步骤注册表 + 摘要（S2） |
| 错误可观测性 | ⚠️ envelope 有 trace_id，但 code 通用 `http_*`、WS/SSE 无码 | ✅ 业务错误码 A/B/C 三分 + hint/retryable（E6，规范见 docs/ERROR_CODES.md） |

## 17. 与 2026-08-04 审查（v3）的关系

`docs/review/REVIEW_2026-08-04.md` 聚焦安全/类型/依赖漏洞/覆盖率；本报告聚焦**架构脱耦（运行时 + 启动时）与企业级韧性**单一主题，两者互补不重复。已知交集：v3 提到的"WS handler 5 个 Mixin 共享 30+ 字段无类型契约（mypy 222 错）"属 realtime 包**内部**耦合，不在本报告的跨域脱耦范围内，建议另立专题（引入 `WSHandlerContext` Protocol）处理，不要混进上述 PR。
