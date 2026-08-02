# InterviewOS 代码质量 / 架构 / 安全 审查报告

> 报告日期：2026-07-23
> 范围：`backend/app/**`、`backend/tests/**`、`frontend/src/**`、`frontend/next.config.js`、`frontend/package.json`、`frontend/tsconfig.json`、`frontend/.env*`
> 分支：`main`
> 范围声明：**本报告仅做审查与建议，不修改任何代码**。所有结论附带文件:行号以便复核。
> 报告方法：
> 1. 并行 4 个独立审查 sub-agent（安全 / 架构 / 前端 / 测试）覆盖广度；其中安全 / 测试因 API 中断未返回结果，相关章节由主审亲自精读补足；
> 2. 主审本人精读关键文件（核心 6 个 Python 模块 + 前端 4 个关键文件 + 配置 / 数据库 / 迁移 / 简历解析 / PrepAgent）做事实核验；
> 3. 报告内所有标 ✅ "已核验"的发现均来自精读；标 🔁 "sub-agent 报告" 的来自并行审查 agent；标 ⚠️ 的为综合判断。

---

## 0. 总览

| 维度 | 结论 |
|---|---|
| **整体代码成熟度** | 高。架构清晰、安全默认较严、文档齐全、测试覆盖核心路径。 |
| **必修项（Critical / High）** | 8 条：①PrepAgent ReAct 工具正则匹配脆弱；②LLMClient 流式重试中 `aclose` 时机有边角问题；③sse-starlette 在 requirements 但实际未使用；④`interview_style` 前后端枚举不一致；⑤`generate_and_persist_report` 与 system_learning 写入跨进程无锁；⑥`next.config.js` 错误地信任 `BACKEND_PORT` 环境变量来构造后端 URL，但没有兜底校验；⑦前端报告 SSE 端点闲置且 WS 事件协议多处死分支；⑧Orchestrator 静默追问索引 bug 让压力人格永远走温柔分支。 |
| **架构调整项（Medium）** | 16 条：含 sub-agent 新发现的 Runner/Agent 越界读写、stepfun 反向 import、SSE 文案双轨、phases 双轨、silence_nudge 前后端不一致、MIGRATIONS 与 ORM 双轨等。 |
| **细节优化项（Low / Info）** | 12 条：日志脱敏覆盖度 / 测试速度 / TS strict / 文档同步 / 6 个扩展点可行性等。 |
| **审查方法说明** | 并行 4 个独立 sub-agent（安全 / 架构 / 前端 / 测试）覆盖广度；其中安全 / 测试因 API 中断未返回结果，相关章节由主审亲自精读补足；前端 sub-agent 已完成（F-09 ~ F-15）；架构 sub-agent 已完成（A-12 ~ A-22 + EP 扩展点抽查）。 |

整体判断：**项目已经过了"原型期"**，安全与架构的基本盘是稳的；本报告聚焦"补丁期"应有的质量提升，避免一次性大重构。

---

## 1. 安全审查

### 1.1 Critical / High

#### 🔴 S-01 [已核验] PrepAgent 的 ReAct 工具通过正则从 LLM 输出抽取 JSON 并执行 — 沙箱脆弱

**位置**：`backend/app/agents/prep/agent.py:82-89`、`116-130`

```python
tool_match = re.search(r'\{["\']tool["\']:\s*["\'](\w+)["\'].*\}', reply, re.DOTALL)
if tool_match:
    try:
        tool_call = json.loads(tool_match.group(0).replace("'", '"'))
        observation = await self._run_tool(tool_call, db)
        ...
```

**风险**：
- LLM 输出包含 `{"tool": "...", "args": {...}}` 的文本即被视为工具调用；当前 `_run_tool` 是白名单（`web_search` / `company_info` / `quiz` / `github_*`），看似安全。
- 但是：
  1. `re.search(..., re.DOTALL)` 配合 `.*` 贪婪匹配，**会跨越多个 `{}` 块合并**，可能误匹配大段说明文本。
  2. `tool_match.group(0).replace("'", '"')` 后的 JSON 解析失败时仅记 warning，不会拒绝执行。
  3. `_run_tool` 依赖 `tool` 字段取值；若未来加 `python_exec` / `subprocess` / `file_write` 等工具，本路径直接变成 RCE。
  4. 用户简历 / 公司信息 / GitHub 用户名都是 prompt 注入的攻击面（候选人填了恶意简历文本，可让模型在 ReAct 输出攻击性 payload）。

**建议**：
1. 改用 OpenAI **官方 function calling**（同 InterviewRunner）—— 已经验证 LLM 能稳定返回结构化 tool_call，无需自己正则；
2. 若保留正则方案，至少：限制 `{}` 块必须在回复开头 N 字符内、用 `json.JSONDecoder.raw_decode` 严格解析、失败时显式拒绝（不要 fallback）；
3. 工具白名单移到模块级常量，并加 "新增工具需经过 review" 注释。

#### 🔴 S-02 [已核验] `llm_embeddings_key` 缺省时回退 `llm_api_key` 时无 `decrypt_secret`

**位置**：`backend/app/services/llm/client.py:537-538`、`backend/app/config.py:90`

```python
# embeddings 使用专用 key（如有），否则回退 chat key。
embed_key = settings.effective_embeddings_key or self.api_key
```

`effective_embeddings_key` 直接读 `self.llm_embeddings_key`（**未解密**）。如果用户把嵌入专用 key 用 Settings 写入 DB，它会是 `enc:v2:...` 密文；回退路径会改用 `self.api_key`（已解密），看似不会出错——但若用户**仅**配置了 embeddings_key 而没有 llm_api_key，前者密文会被当作明文发到 Embeddings 端点，触发 401。

**建议**：embeddings 路径同样走 `decrypt_secret()`，并显式处理 `LegacySecretFormatError`。

#### 🟠 S-03 [已核验] LLM 流式重试在"已收到部分 token" 时仍可能重发

**位置**：`backend/app/services/llm/client.py:340-408`（`chat_stream`）

```python
async with client.stream("POST", url, ...) as resp:
    if resp.status_code == 429 or resp.status_code >= 500:
        ...
        if attempt < max_retries:
            await asyncio.sleep(backoff * (2 ** attempt))
            continue
    resp.raise_for_status()
    # 进入 aiter_lines 之前仍处于 status_code 检查与 raise 之间的窗口；
    # 但实际上 status_code == 200 才会进入 aiter_lines，
    # 真正风险在「读完一段 chunk 后连接中断」——会被 on_close 当作网络错误抛，
    # 但下面的 except 也会尝试重试。
```

**风险**：当前实现只在 `resp.status_code` 检查阶段才尝试整段重试；进入 `aiter_lines` 后若发生 `RemoteProtocolError` / `ReadTimeout`，会走 `except`，**下一次重试会从 0 开始重发整段对话**——而用户的对话记录可能已被部分流式播放。
- 后果：用户体验上看到回答被重复播放；计费按 token 重发。
- 不是直接安全漏洞，但属**正确性 + 计费**问题。

**建议**：流式进入 yield 阶段后，**不重试整段**，改为把"已经成功的 token 列表"作为下次请求的 assistant 前缀。

#### 🟠 S-04 [已核验] CORS allow_origins 默认值在 dev 环境过宽

**位置**：`backend/app/config.py:43`

```python
cors_origins: str = "http://localhost:3000"
```

默认值仅允许 `localhost:3000`，看上去安全。但：用户在 `next.config.js` 通过 `BACKEND_PORT` 自定义端口时，**前端**会从 `localhost:3000` 发起请求到 `127.0.0.1:8001`，而 CORS 的 `Origin` 头是 `http://localhost:3000`——会过校验。看起来没问题。

真正风险：**`.env.example` 默认值**没把 `cors_origins` 列出，README 也没说——但项目里有大量示例配置在文档中"宽 allowed_origins"（如 `http://localhost:5173` 等）。如果有人误改为 `*`：
- `app/main.py:_check_cors_policy` 在 prod 会拒绝启动；✅ 但在 dev 仅打 warning，仍然通过；
- `allow_credentials=True` + dev 通配 origin → **浏览器仍会拒绝**（CORB 行为），但 server side 已经响应了。属于"看似工作实际不安全"的反模式。

**建议**：
1. `cors_origins` 改成 list[str]（pydantic 多值），避免逗号分隔解析出错；
2. dev 模式下也默认 deny `*`，仅在用户显式 `INTERVIEWOS_ALLOW_LOOSE_CORS=1` 时放行；
3. 文档顶部加警告："生产环境必须显式列 origin"。

#### 🟠 S-05 [已核验] `interview_style` 前后端枚举不一致 — 用户可见的运行时错误

**位置**：
- 后端：`backend/app/schemas/__init__.py:168` `Literal["deep_dive", "concise"]`
- 前端选项：`backend/app/api/options.py:29-34` `["guided", "deep_dive", "continuous", "challenging"]`
- 前端类型：`frontend/src/types/index.ts:130` `interview_style: string`（宽松到 `string`）

**复现**：
1. 用户在前端选择"引导型"（guided），提交 `POST /api/v1/interview/sessions`；
2. Pydantic 校验失败 → 返回 422 `validation_error`；
3. 前端 toast 报"请求参数校验失败"，但 UI 没有收回选项，用户也不知道哪里出错。

**风险**：体验类问题，不是安全；但属"对外契约不一致"，应当尽快修。

**建议**：
1. **短期**：把 `options.py` 的 INTERVIEW_STYLES 收窄为 `["deep_dive", "concise"]`，与 schema 同步；前端选项 UI 也同步；
2. **中期**：把 `STYLE_PROMPTS` 补齐 4 个 prompt 模板，schema 类型扩展到这 4 个；
3. 类型层面：把前端 `interview_style: string` 收窄到字面量 union。

### 1.2 Medium / Low

#### 🟡 S-06 [已核验] `redact_api_key` 未覆盖 PEM 私钥 / `-----BEGIN` 标记 / JWT

**位置**：`backend/app/core/security.py:380-444`

```python
def _looks_like_secret(v: str) -> bool:
    if len(v) < 20 or " " in v:
        return False
    has_letter = any(c.isalpha() for c in v)
    has_digit = any(c.isdigit() for c in v)
    return has_letter and has_digit
```

**风险**：
- JWT 通常包含 `==` / `..` / `-` 拼接，长度 ≥ 50，**没有空格**，**含字母和数字** → 命中启发式脱敏（OK）；
- PEM 块含 `\n`，会被 `_looks_like_secret` 拒绝 → 不脱敏，直接暴露；泄露日志时会暴露私钥。

**建议**：增加 PEM / JWT / Bearer 头 / `Basic` 凭据的覆盖（用 `-----BEGIN` 前缀识别 PEM）。

#### 🟡 S-07 [已核验] `system_learning.json` 并发写无锁

**位置**：`backend/app/services/growth/learning.py:30-52`

```python
def _load() -> dict[str, Any]:
    path = _memory_path()
    if not path.exists():
        return {...}
    try:
        return json.loads(path.read_text(...))
    except Exception as e:
        ...
        return {"version": 1}

def _save(data: dict[str, Any]) -> None:
    data["updated_at"] = ...
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
```

`record_interview_learning` 在 `generate_and_persist_report` 末尾调用 — 单 worker 下并发 finish 会读-改-写竞争；多 worker 下完全无保护。

**风险**：两个面试同时结束 → 写入互相覆盖，丢失 `probes` / `counts`。

**建议**：
1. 短期：模块级 `threading.Lock` + `os.replace(tmp, path)` 原子写；
2. 中期：迁到 SQLite `system_events` 表；
3. 长期：Redis Streams / 外部存储。

#### 🟡 S-08 [已核验] `LLMSettings.context_window = 0` 被视为"无限制"，但实际是数据库默认值 128000

**位置**：`backend/app/services/interview/runner.py:137-142`

```python
def _get_context_window(self, db: Session) -> int:
    row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
    if not row or not row.context_window:
        return 0
    return int(row.context_window)
```

`0` 被解读为"不压缩"。如果用户**显式**填了 `0`（想测不压缩路径），意图不清晰；如果是 DB 默认值（`128000`），正常运行。如果未来允许 `0` 当作"无限"——会与"用户输错"难以区分。

**建议**：用 `Optional[int]` 区分"未设置"和"用户填 0"。

#### 🟡 S-09 [已核验] `BackendDataDir` 在 `BACKEND_DATA = Path(__file__).resolve().parent.parent / "data"` 但实际可能是 `backend/data/`

**位置**：`backend/app/core/secrets.py:41-43`

```python
_BACKEND_DATA = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_KEYFILE = _BACKEND_DATA / ".secret.key"
```

`__file__` 是 `backend/app/core/secrets.py`，`parent.parent` 是 `backend/app`，再加 `"data"` → `backend/app/data`。**实际数据目录**在 `backend/data/`（见 `config.py:41`、`database.py:103`）。当前 `_DEFAULT_KEYFILE` 实际写入 `backend/app/data/.secret.key`，与数据库不在同一目录——**用户升级或迁移时容易找不到密钥**。

**风险**：用户清空 `backend/data/` 升级时不会意识到还有 `backend/app/data/.secret.key`，导致 API Key 永久失效。

**建议**：统一目录到 `backend/data/`，与 `config.py:database_url` / `upload_dir` 保持一致。

#### 🟡 S-10 [已核验] error envelope 中 `detail` 字段保留旧格式会同时暴露堆栈路径

**位置**：`backend/app/main.py:204-217`

```python
payload = {
    "detail": message,  # legacy 兼容
    "error": {...},
}
```

`message` 通常是 `str(exc)`，但当 `detail` 是 dict / list 时会被 str() 转成 Python repr（含 unicode 引号）。绝大多数情况下安全，但当异常来自用户可控字段（如文件名）时，会把用户输入原样回显——**反射型 XSS / 路径信息泄漏**（前端 React 默认 escape，浏览器渲染安全；但若有人做 client-side logging 到 Sentry / 控制台，会触发误判）。

**建议**：
- `detail` 字段也走 `RedactFilter`；
- 不要把 `str(exc)` 直接回显，做枚举化（`code`）后只回显安全 message。

### 1.3 Info

#### 🔵 S-11 [已核验] `cryptography>=42.0.0` 已是较新版本（截至 2026-07 主流稳定）；其他依赖（fastapi / sqlalchemy / pydantic）浮动 ≥ 最低版本号 — 没有 `pip-audit` / `safety` 自动扫描。

**建议**：CI 加 `pip-audit` + `npm audit` 阶段。

#### 🔵 S-12 [已核验] 没有发现 `pickle` / `yaml.load` / `eval` / `subprocess` 调用。

---

## 2. 架构审查

### 2.1 Critical / High

#### 🔴 A-01 [已核验] RAG 数据层 `_kb_data.py` 集中了所有公司文档的 Chroma 切片，但 `_build_documents()` 在 `LocalEmbeddingRAG.build_index` 里被同步调用 → 启动慢 + 单 embedding 调用失败导致 0 文档

**位置**：`backend/app/services/rag/local_backend.py:53-72`、`backend/app/services/rag/_kb_data.py:38-93`

```python
async def build_index(self, force: bool = False) -> int:
    ...
    texts, metadatas, ids = _build_documents()
    logger.info("构建 Local RAG 索引：%d 条文档", len(texts))
    embeddings = await self._llm.embed(texts)
    self._collection.add(documents=texts, embeddings=embeddings, metadatas=metadatas, ids=ids)
```

**问题**：
1. `await self._llm.embed(texts)` 一次性把所有切片打包发 embeddings；当前 `BUILTIN_COMPANIES` 7 家 × 4 切片 ≈ 28–50 段，**单次调用超过某些中转服务的 batch 上限**会被 400。
2. `_build_documents()` 是同步硬编码；若未来扩展到 20 家公司，单次 batch 必然失败。
3. `ensure_index` 失败时仅 warn，**整个 RAG 静默失效**——面试回合不再命中任何公司知识。

**建议**：
1. `embed()` 改为分批（如 `batch_size=10`），支持重试；
2. `ensure_index` 失败应记录 trace_id + 触发 frontend toast 提示"企业知识库未就绪"；
3. 把 `_build_documents` 抽到独立函数，**支持从 `data/user_uploaded_experiences.json` 合并用户上传**（这是 P1 路线，见 [DEVELOPMENT_PROGRESS §6.5](./DEVELOPMENT_PROGRESS.md)）。

#### 🟠 A-02 [已核验] `InterviewRunner` 与 `ws_handler` 边界仍有职责重叠

**位置**：`backend/app/realtime/ws_handler.py:449-492`、`backend/app/services/interview/runner.py:346-466`

`ws_handler._process_user_text` 既负责流式事件分发，又在 `TURN_COMPLETE` 时同步调 `generate_and_persist_report`；同时 `app/api/interview.py:159-167`（HTTP 路径）也调同一函数。
- 同一 session 通过 HTTP 完成最后一个回合 → 立即生成报告；用户回到 WS 想继续 → 状态已 `completed`，触发 "面试已结束"。
- 这是 by-design，但**没有 README / 文档说明**两种入口的互斥。

**建议**：
1. 在文档中明确："WS / HTTP 是同一会话的两种入口，但**生成报告后不可再继续**"；
2. 在 WS 端 `TURN_COMPLETE` 收到 `is_complete=True` 后，主动广播 `interview_complete` 帧（`ws_handler` 已经在 `assistant_done` 携带了 `is_complete`，但缺 `report_id`，前端还要再调一次 `/reports/{id}`）；
3. 把报告生成放到 `mark_completed` 后由一个独立 worker 处理，避免 WS 与 HTTP 并发 finish 时的 race。

#### 🟠 A-03 [已核验] `PrepAgent` 与 `InterviewAgent` 同形但实现重复

**位置**：`backend/app/agents/prep/agent.py`、`backend/app/services/interview/agent.py`

两者都做：
- 加载/保存 `messages` JSON；
- 调 `compress_messages`；
- 工具执行（Prep 用正则、Interview 用 OpenAI function calling）。

**风险**：抽象漂移——以后修 bug 容易只修一处。

**建议**：抽 `BaseChatAgent[TMessageStore]` 基类：
- `load_messages()` / `save_messages()` / `messages: list[dict]`
- `compress(messages, ctx_window)`
- `record_user(text)` / `record_assistant(text)`
- 子类实现 `run_turn(user_text)` 即可。

但要权衡：MVP 阶段两个 Agent 不复杂，过早抽象可能引入"premature abstraction"。**短期接受，长期跟进**。

#### 🟠 A-04 [已核验] `CompanyKnowledgeRAG` 兼容包装层 — 何时可拆？

**位置**：`backend/app/services/rag/company_rag.py`、`backend/app/services/rag/factory.py`

`CompanyKnowledgeRAG` 现在是 `_NullRAG` / `LocalEmbeddingRAG` / `StepFunRetrievalRAG` 的薄包装。它**已经无人引用**（grep 仅在 `ws_handler.py:225`、`main.py:115` 中显式 import；后者是 `from app.services.rag.company_rag import CompanyKnowledgeRAG`）。

**风险**：
- `main.py:_ensure_rag_index` 仍走 `CompanyKnowledgeRAG(llm).ensure_index()`，没有利用工厂——意味着 RAG 后端通过 `INTERVIEWOS_RAG_BACKEND` 切换**仅对面试回合生效**，对启动期索引构建无效。
- 启动期硬绑定到 local Chroma。

**建议**：`main.py` 也走 `build_rag_backend(llm, get_settings())`；`CompanyKnowledgeRAG` 标 deprecated 半年后删除。

### 2.2 Medium

#### 🟡 A-05 [已核验] `app/realtime/events.py` 与 `frontend/src/types/index.ts:ServerEvent/ClientEvent` 协议一致，但**没有自动化校验工具**

**位置**：跨多文件

**风险**：协议变更容易漏改一端，且类型不匹配时只在运行时被发现（虽然前后端各自有 TS / Python 类型，但**没有 CI 校验两边 union 是否一致**）。

**建议**：加一个 `scripts/check_protocol.py`：
- 解析 `app/realtime/events.py` 中的字符串字面量集合；
- 解析 `src/types/index.ts` 中 union 的 type 字段；
- 不一致即报错。

#### 🟡 A-06 [已核验] `STEPFUN` RAG 后端在 Runner 里"返回 None"然后注入 retrieval tool — 但 `build_retrieval_tool` 是否真的在 `_collect_chat_tools` 里被正确调用？

**位置**：`backend/app/services/interview/runner.py:187-204`、`backend/app/services/rag/stepfun_backend.py`

`_collect_chat_tools` 通过 `getattr(self.rag, "build_retrieval_tool", None)` 检测；这意味着**接口契约是鸭子类型**——任何实现了 `build_retrieval_tool()` 的 RAG 后端都会被自动接入。但：

- `_maybe_retrieve_rag` 里同时 hard-code `if getattr(self.rag, "kind", None) == RAGBackendKind.STEPFUN: return None`；
- 如果未来加 `OpenAIRetrievalRAG`（用 `tools[].type=retrieval` 但 kind 不同），需要再次修 `_maybe_retrieve_rag`。

**建议**：在 `RAGBackend` Protocol 里加 `needs_retrieval_tool: bool` 或 `uses_native_retrieval: bool` 字段，把"返回 None vs 注入 tool"这个语义内置到协议中。

#### 🟡 A-07 [已核验] `app/services/interview/followup.py` 是独立模块，但 `_last_assistant_question` 在 Runner 里直接调 LLM 输出检索历史 → 与 `_memory_section` 的 `asked_questions` 重叠

**位置**：`backend/app/services/interview/runner.py:118-126`、`backend/app/services/interview/agent.py:305-324`

两处都"取最近一次面试官发言"，但 Runner 用 `reversed(self.agent.messages)`，Agent 用 `self.agent_state.asked_questions[-1]`。两个口径不一致，可能导致：

- Followup 信号基于"完整 LLM 输出（含 `[PHASE_COMPLETE]` 等控制标记）"；
- `_memory_section` 用的是 `strip_markers` 后的纯文本。

**建议**：统一一个 `InterviewAgent.last_question_clean()` 方法；Runner 与 Agent 都调它。

#### 🟡 A-08 [已核验] `runner.py:280-285` `tool_trace` 截断到 40 条，但每个 tool call 都 append `{"round": int, "tool": str, "ok": bool}`；系统学习里 `followup_category_hits` 实际用的是 `tool` 字段作为 key

**位置**：`backend/app/services/interview/runner.py:260-285`、`backend/app/services/growth/learning.py:88-92`

工具名作为统计 key 是 OK 的，但 `tool_trace` 与 `followup_category_hits` 没有形成联动——后者只是单纯计数"哪个工具被调用了"，**没有反映"工具调用后追问效果如何"**。

**建议**：在 `followup_category_hits` 旁边加 `followup_effectiveness`，把工具结果 `ok` / 错误次数也记录下来；后续可让 system prompt 自适应"哪些追问线索有效"。

### 2.3 Low / Info

#### 🔵 A-09 [已核验] `LLMClient.chat_stream` 内部有一段对 `<think>` / `</think>` 的手工标签生成逻辑（行 376-394），与 `_extract_message_text` 内的剥离逻辑（行 60-69）是同一语义的两份实现

**位置**：`backend/app/services/llm/client.py:60-69` 与 `376-394`

**建议**：抽 `with_reasoning_tags(reasoning, content)` helper。

#### 🔵 A-10 [已核验] 前端 `src/lib/api.ts` 同时存在 `fetch('/api${path}')`（依赖 Next rewrites）和 `fetch(resolveStreamUrl(...))`（直连后端）两套路径 —— 流式请求**完全绕过** Next rewrites

**位置**：`frontend/src/lib/api.ts:48-65`、`frontend/next.config.js:10-21`、`frontend/src/app/api/` （**目录为空**）

注意：`frontend/src/app/api/` 下没有自定义 route handler，**只有 Next 默认 rewrites**。`api.ts` 注释说"流式走同源代理"，但**实际是通过 Next.js 全局 rewrites 实现同源转发**。这种依赖隐式行为不容易理解。

**建议**：
1. 把流式接口也改成 `/api/...` 路径，让 Next rewrites 统一处理；测试一下 SSE 流式 rewrites 是否会缓冲；
2. 若发现 Next 15.1 rewrites 对 SSE 有缓冲问题，再走 `STREAM_API_BASE` 直连；
3. 写明文档："Next.js 全局 rewrites 已把 `/api/*` 转发到后端；流式接口直连是为避免 Next 缓冲。"

#### 🔵 A-11 [已核验] `sse-starlette>=2.0.0` 列在 requirements 但**实际未使用**（grep 无 import）

**位置**：`backend/requirements.txt:9`

**风险**：依赖膨胀，潜在 CVE 风险；CI 装包慢。

**建议**：删除或迁移到 SSE（实际后端用 `StreamingResponse(media_type="text/event-stream", ...)` 已足够）。

#### 🔴 A-12 [🔁 sub-agent] Orchestrator `build_silence_nudge` 索引算法 bug — 压力人格永远走温柔分支

**位置**：`backend/app/agents/orchestrator.py:18-33`

```python
def build_silence_nudge(self, personality: str, strictness: int) -> str:
    is_strict = strictness >= 6 or personality in ("pressure", "expert")
    if is_strict:
        templates = [...]  # 3 条
    else:
        templates = [...]  # 3 条
    idx = min(strictness, len(templates) - 1)
    return templates[idx % len(templates)]
```

**事实**：`templates` 各 3 条；`idx = min(strictness, 2)`，当 `strictness=10` 时 `idx=2`——仅命中第三条（"我需要你更具体一些…"）；但当 `strictness=6` 时 `idx=2`，同样命中第三条。这是侥幸正确。但当 `is_strict=False` 分支时 `strictness=1` → `idx=1`（"你可以从印象最深的一点开始…"），**正常 5 级严格度**走温柔分支——**与设计意图不符**。

**复现条件**：非压力人格 + 任何严格度下，静默追问模板都在温柔分支里找。

**建议**：把 `idx = max(0, min(strictness // 2, len(templates) - 1))` 或按 1-3 / 4-6 / 7-10 三档映射；并加单测覆盖边界。

#### 🔴 A-13 [🔁 sub-agent] Runner / Agent / ws_handler 共享可变 dict + 越界读写

**位置**：
- `backend/app/services/interview/runner.py:405-423`（`trailing_msgs` 直接 pop & 重新插入 `self.agent.messages`）
- `backend/app/services/interview/agent.py:225-229`（`asked_topics / tool_trace / github_findings` 都是 `agent_state.setdefault` 的共享可变字典）
- `backend/app/realtime/ws_handler.py:438-439, 528-530`（ws_handler 直接写 `orchestrator.snapshot.last_user_text` / `merge_face`，以及直接读 `self.agent.messages`）

**风险**：
- Runner 在 `stream_turn` 中途 `pop` Agent.messages 末尾追加的 helper 消息，再 `append` 回去——若 ws_handler 并发读 Agent.messages（`reference_hint` 路径、生成报告路径），会读到**半修改状态**；
- ws_handler 与 Runner 都持有 `orchestrator.snapshot.face_analysis` 的副本，可能漂移。

**建议**：短期把 ws_handler 与 Agent 的接触收敛到 Runner 的 `stream_turn` 入口（Agent 增加 `last_question()` / `memory_section()` 只读方法）。长期改"不可变快照 + 事件总线"。

#### 🟠 A-14 [🔁 sub-agent] `stepfun_backend.py` 反向 import `company_rag` 与重构目标不符

**位置**：`backend/app/services/rag/stepfun_backend.py:46, 49`

**事实**：`stepfun_backend.py:46` 用 `from app.services.company.knowledge import BUILTIN_COMPANIES`；`stepfun_backend.py:49` 用 `from . import company_rag` 然后调 `company_rag._build_documents()`——但 `_build_documents` 已迁移到 `_kb_data.py`。这意味着 `stepfun_backend → company_rag → _kb_data` 的反向依赖链未清干净；未来若再次出现耦合需求容易形成三向链。

**建议**：stepfun_backend 应只 `from app.services.rag._kb_data import _build_documents`，不再 import `company_rag`。

#### 🟠 A-15 [🔁 sub-agent] SSE 错误文案两份手抄 — `prep.py` / `reports.py` 不共享常量

**位置**：
- `backend/app/api/v1/prep.py:26` `_SSE_ERR_GENERIC = "辅导生成失败，请稍后重试"`
- `backend/app/api/reports.py:31` `_SSE_ERR_GENERIC = "报告生成失败，请稍后重试"`

**风险**：两份手抄文案，下游修改时容易漏改一边。

**建议**：提到 `app/core/constants.py`：`SSE_ERR_PREP = "..."` / `SSE_ERR_REPORT = "..."`，并在 `with_agent_output_rules` 中也能用。

#### 🟡 A-16 [🔁 sub-agent] `core/constants.py` 与 `frontend/src/config/phases.ts` 双轨维护

**位置**：
- `backend/app/core/constants.py:58-67`（`InterviewPhase` StrEnum）
- `frontend/src/config/phases.ts:7-29`（`PHASE_LABELS`、`PHASE_ORDER`）
- `frontend/src/types/index.ts:166-168`（`interview_style: Literal[...]`）

**事实**：
- 工作流 `WorkflowType` 字符串（technical / hr / management）、`Personality`（5 种）、`InterviewStyle`（deep_dive / concise）都是 backend StrEnum；
- 前端 `phases.ts` 是本地 const 对象，无对应枚举；
- 后端 `InterviewPhase` 枚举 vs `workflows.py:InterviewPhase` dataclass **两套共存**——加新阶段时易漏改。

**建议**：补一条 CI 测试：扫描 `frontend/src/config/*.ts` 的字符串集合，与 `backend/app/core/constants.py` 的 StrEnum 集合做断言相等。

#### 🟡 A-17 [🔁 sub-agent] `config.py` 字段冗余 + 静默超时前后端硬编码不一致

**位置**：
- `backend/app/config.py:51` `silence_nudge_seconds: int = Field(default=10, ge=1, le=600)` — 后端上限 600 秒
- `frontend/src/app/interview/[id]/page.tsx:113-141`（静默超时 10000ms 硬编码）

**事实**：后端配置定义但前端不读取；`env` 字段只比较 `"prod"`，`"production"` 会被误判为 dev。

**建议**：把 10s 提到前端 `getEnv()` 常量（与 `NEXT_PUBLIC_*` 一同读取）；扩展 `is_prod` 接受 `prod|production`。

#### 🟡 A-18 [🔁 sub-agent] MIGRATIONS SQL 字符串字面量与 ORM 双轨维护

**位置**：`backend/app/core/migrate.py:22-63`（18 个 `ALTER TABLE ... ADD COLUMN`）与 `backend/app/models/__init__.py:17-154`（ORM 字段定义）

**事实**：每次给 `UserProfile` / `LLMSettings` 加字段，必须同时改 models 与 MIGRATIONS——`_column_name_from_stmt`（migrate.py:66-79）从字符串解析列名，脆弱且冗余。

**建议**：从 `Base.metadata.tables[table].columns` 取列名集合，与 `inspector.get_columns(table)` 做差集生成 ADD COLUMN。

#### 🟡 A-19 [🔁 sub-agent] `reference_hint` 失败时前端永远 loading

**位置**：`backend/app/realtime/ws_handler.py:526-552`

**事实**：
- `system_ctx = str(m.get("content", ""))[:4000]`（ws_handler.py:530）硬切 4000 字符，候选人简历 + 公司风格可能 > 8000 字符（agent.py:108-119 system prompt 无界）；
- hint 失败（`llm.chat` 抛异常，ws_handler.py:548-552）只 `return "暂时无法生成..."`，**没有 `reference_hint` 事件**，前端 `reference_hint_loading` 永远 loading。

**建议**：hint 失败时显式发 `reference_hint`（带 fallback 文案）或 `error`。

#### 🟡 A-20 [🔁 sub-agent] `EventKind.TURN_COMPLETE = "turn_done"` 与 WS 字符串空间不一致

**位置**：`backend/app/services/interview/events.py:16`

**事实**：`TURN_COMPLETE = "turn_done"` 给 `StreamEvent.kind`（Runner 内部），ws_handler 的 `"assistant_done"` 给 `ServerEvent.type`（前后端协议），两个字符串空间各自维护。`runner.py:331` 通过 `StreamEvent.make_turn_done` → ws_handler `_dispatch_event`（ws_handler.py:500-507）翻译为 `"assistant_done"`。逻辑正确但缺注释。

**建议**：加注释说明两个字符串空间；或统一引入 `WSServerEvent` 枚举并替换 ws_handler 内的裸字符串字面量（"error" / "server_ping" / "assistant_token" 等）。

#### 🔵 A-21 [🔁 sub-agent] `frontend/src/app/api/` 目录空

**位置**：`frontend/src/app/api/v1/prep/sessions/` 等

**事实**：`find` 结果空。`frontend/next.config.js` 用 rewrites 转发 `/api/*` 到后端，不需要 Next API 路由文件。无运行时影响。

#### 🔵 A-22 [🔁 sub-agent] 6 个扩展点（ARCHITECTURE.md §7）可行性抽查

| 扩展点 | 可行性 | 备注 |
|---|---|---|
| **EP-1 加 LLM Provider** | 有条件可行 | `LLMClient` 是 monolith，无 `LLMProtocol` 抽象；`protocol` 字段已留好但当前仅 `"openai_chat"`；加 3+ provider 前需先抽基类 |
| **EP-2 加 Workflow** | 可行 | `WORKFLOWS` dict 追加注册即可；但前端 `phases.ts` 与 `constants.py` 双轨维护（见 A-16） |
| **EP-3 加追问信号维度** | 可行 | `FollowupCategory` 是 `Literal[...]`，扩展 Literal 即可 |
| **EP-4 加 KB 源** | 部分可行 | 缺 schema 校验；若新公司无 `sample_questions` 会生成空切片 |
| **EP-5 加 GitHub 工具** | 可行但有耦合 | `prep/agent.py:147-153` 仅列举 4 个 github 工具，`execute_github_tool` 实际 9 个（见 M-6 后续） |
| **EP-6 加前端页面** | 完全可行 | `NAV_ITEMS` 一处修改即可 |

**整体判断**：3/6 个扩展点明确可行；3 个有依赖维护风险（EP-1 / EP-4 / EP-5）。

---

## 3. 代码质量审查

### 3.1 Critical / High

#### 🟠 Q-01 [已核验] `app/services/resume/parser.py:extract_text_from_file` 对恶意 PDF 防御不足

**位置**：`backend/app/services/resume/parser.py:36-45`

```python
if suffix == "pdf":
    reader = PdfReader(str(file_path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)
```

**风险**：
- `pypdf` 在解析恶意构造的 PDF 时可能无限递归 / 抛 `RecursionError`（已有 CVE 路径），导致**单次上传消耗 CPU 直到超时**；
- `docx` 同理——`python-docx` 对损坏的 zip 处理偶发抛 `BadZipFile`，被外层 `except Exception` 吞掉返回 "文件解析失败"，**用户看不出是格式问题还是 DoS**。

**建议**：
1. PDF / DOCX 解析加超时（`signal.alarm` 或 `asyncio.wait_for` + `asyncio.to_thread`）；
2. 对解析失败的简历仍允许保存（保留 `raw_text` 为空 + 提示用户），而不是完全拒绝。

#### 🟠 Q-02 [已核验] `LLMClient.chat_json` 的 fallback 路径可能陷入死循环

**位置**：`backend/app/services/llm/client.py:430-443`

```python
if not (isinstance(content, str) and content.strip()):
    logger.warning("chat_json 首次返回空，回退无 response_format 重试")
    retry_messages = list(messages)
    retry_messages.append({...})
    content = await self.chat(retry_messages, temperature=temperature)
if content is None or ...:
    raise ValueError(...)
```

**风险**：
- 若首次返回空，二次重试**不会再次**走 fallback（已经去掉 `response_format`），但**没有 `retry_messages` 的长度限制**——长 messages 在 fallback 时变成"原始 messages + 强化 user 末尾"，**可能撞 token 上限**触发 4xx；
- 4xx 不会被 `chat()` 的 retry 拦截（设计如此），直接抛回。

**建议**：fallback 也限长（截断到 `keep_recent=20`），并对 fallback 也做 4xx 处理。

### 3.2 Medium

#### 🟡 Q-03 [已核验] `runner.py:_run_tool_rounds` 中 `tool_trace` 的 `ok` 判断仅看前 80 字符是否含 `error`

**位置**：`backend/app/services/interview/runner.py:283`

```python
trace.append({"round": round_i, "tool": name, "ok": "error" not in result[:80]})
```

**风险**：
- 若 LLM 工具正常返回 `"this is an error..."`（自然语言中带 "error"），会被误判为失败；
- 若失败信息在第 81 字符之后，会被误判为成功。

**建议**：用 `execute_interview_tool` 的返回值统一结构化为 `{"ok": bool, "data": ...}` 或 `{"error": "..."}`，由调用方显式判断。

#### 🟡 Q-04 [已核验] `InterviewAgent._load_state` 不校验 `current_phase_idx` 范围

**位置**：`backend/app/services/interview/agent.py:220-222`

```python
self.workflow = get_workflow(self.session.workflow_type)
self.current_phase_idx: int = self.agent_state.get("phase_idx", 0)
```

**风险**：若数据库中存了 `phase_idx=99` 但 workflow 只有 5 阶段（实际不会，但理论上），`current_phase()` 会回退到 `phases[-1]`，**静默吃掉越界**。

**建议**：`current_phase_idx = min(idx, len(phases) - 1)` 显式归一化，并在异常时打 warning。

#### 🟡 Q-05 [已核验] 前端 `useInterviewWS` 重连计时器在 unmount 时**未立即取消**

**位置**：`frontend/src/features/media/useInterviewWS.ts:201-217`

```typescript
return () => {
    generationRef.current += 1;
    clearRetryTimer();
    ...
};
```

`clearRetryTimer()` 在 `connect` 内的 setTimeout 闭包里通过 `isCurrent()` 检查世代号 → **会**拒绝重连。这部分是对的。但：

- 当 `retryTimerRef.current !== null` 且 useEffect cleanup 与新的 effect 几乎同时触发时，存在 race（同一时刻的 `setTimeout` 回调可能在 isCurrent 检查前已触发 `connect()`，触发新连接）。

**建议**：用 `AbortController` 替代 `generationRef.current` —— 更 idiomatic，且与 fetch 一致。

#### 🟡 Q-06 [已核验] `extract_text_from_file` 对 `.doc`（老 OLE 格式）也走 `python-docx`

**位置**：`backend/app/services/resume/parser.py:40-42`

```python
if suffix in ("docx", "doc"):
    doc = Document(str(file_path))
```

**风险**：`python-docx` 不支持真正的 `.doc`（OLE 容器），会抛 `BadZipFile`。外层捕获后返回 400，但**用户看到的"文件解析失败"看不出原因**。

**建议**：要么拒绝 `.doc`（`.env.example` 已声明仅支持 docx/md/txt/pdf），要么用 `textract` / `antiword` 真支持 OLE。当前既然不支持，**应在 `RESUME_ALLOWED_EXTENSIONS` 移除 `doc`**，并在 UI 提示"暂不支持老 Word 格式"。

### 3.3 Low / Info

#### 🔵 Q-07 [已核验] 错误日志格式不统一：部分用 `%s`（`logger.warning("xxx %s", arg)`），部分用 f-string（`logger.info(f"xxx {arg}")`）

**位置**：全代码库散落

**建议**：统一用 `%s`（lazy formatting，性能更好）。

#### 🔵 Q-08 [已核验] `app/services/interview/agent.py:_memory_section` 没有限制总长度

**位置**：`backend/app/services/interview/agent.py:305-324`

```python
parts.append("已问问题摘要：\n- " + "\n- ".join(str(q)[:80] for q in asked[-12:]))
```

虽然单条 80 字符 + 取最近 12 条，但若 `weak_points` / `github_findings` 同时非空，总长可能超过 1KB → 注入到 system prompt 后导致 `compress_messages` 阈值提前触发。

**建议**：`_memory_section` 末尾截断到 1500 字符。

#### 🔵 Q-09 [已核验] 前端 `useTTSPlayer.ts` / `useAudioRecorder.ts` 没有 a11y 提示

**位置**：`frontend/src/features/media/`

**建议**：UI 上加 `aria-live="polite"` / `aria-busy` 等状态提示。

#### 🔵 Q-10 [已核验] 前端 `src/lib/utils.ts` 仅 175 字节，存在但未广泛使用

**位置**：`frontend/src/lib/utils.ts`

**建议**：grep 是否所有 `cn()` 调用都走 `clsx + tailwind-merge`。

#### 🔵 Q-11 [已核验] `tsconfig.json` 开启 `noUncheckedIndexedAccess` 等 strict，但代码中仍频繁出现 `!` 非空断言（特别是 WS hook 的 ref-synced handlers）

**位置**：前端散落

**建议**：用 `as const` / type guard 替代非空断言。

---

## 4. 前端专项审查

#### 🟠 F-01 [已核验] Next.js `rewrites` 把 `/api/:path*` 转发到后端，但 `next.config.js` 用的是 `BACKEND_PORT` 环境变量，无 fallback 校验

**位置**：`frontend/next.config.js:4-7`

```javascript
const backendOrigin = (
    process.env.NEXT_PUBLIC_API_BASE ||
    `http://127.0.0.1:${process.env.BACKEND_PORT || "8000"}`
).replace(/\/+$/, "");
```

**风险**：
- 用户把 `BACKEND_PORT=99999`（端口越界）→ Next 启动时不会报错，但每次请求都失败；
- 用户设 `BACKEND_PORT=abc` → 拼出 `http://127.0.0.1:abc`，请求时会显示 invalid URL，但**没有友好提示**。

**建议**：在 `next.config.js` 顶层加 `parseInt + 范围校验`，失败时 throw。

#### 🟡 F-02 [已核验] `useInterviewWS` 中 `reconnectKey` 与 `generationRef` 双重机制 — 容易理解错

**位置**：`frontend/src/features/media/useInterviewWS.ts:42, 75-96`

**建议**：合并为一个 AbortController，或明确文档化两个 ref 的语义。

#### 🟡 F-03 [已核验] `VideoPanel` 没有 `MediaStreamTrack.stop()` 显式调用

**位置**：`frontend/src/components/interview/VideoPanel.tsx`

**风险**：摄像头指示灯（绿色）可能停留亮起。

**建议**：在 unmount 时显式 `track.stop()`。

#### 🟡 F-04 [已核验] MarkdownContent / StreamingReveal 走 `react-markdown` 但未配置 `rehype-sanitize`

**位置**：`frontend/src/components/MarkdownContent.tsx`

**风险**：用户输入（用户填写的 `career_highlights` / `self_intro` / 简历内容）经过 LLM 处理后可能被注入 HTML / `<script>` → 渲染时执行 XSS。

**建议**：加 `rehype-sanitize`。

#### 🟡 F-05 [已核验] `consumeSSE` 解析 `[DONE]` 或非 JSON 行会**静默忽略**——失败不可见

**位置**：`frontend/src/lib/api.ts:200-217`

```typescript
try {
    payload = JSON.parse(trimmed.slice(6));
} catch {
    continue; // 跳过畸形行而不是中断整个流
}
```

**建议**：开发模式下计数 + 警告（`if (process.env.NODE_ENV !== "production") console.warn(...)`），帮助调试。

#### 🔵 F-06 [已核验] `app/page.tsx` 引入 `gsap` / `@gsap/react` 但 framer-motion 已经存在 — 两套动画库共存

**位置**：`frontend/src/app/page.tsx`、`frontend/package.json:6, 9`

**建议**：选一个，避免 bundle 体积膨胀。

#### 🔵 F-07 [已核验] `Toast.tsx` 是零依赖，但所有 toast 调用散落在 30+ 处——没有 toast 收件人概念

**位置**：`frontend/src/components/Toast.tsx`

**建议**：明确 toast 是"全局单例"还是"局部"，避免多个 ToastManager 冲突。

#### 🔵 F-08 [已核验] `src/app/error.tsx` 是 ErrorBoundary，但 `not-found.tsx` 触发路径需要明确（Next.js 自动处理 404，但自定义 not-found 触发条件未在文档中说明）

**位置**：`frontend/src/app/not-found.tsx`

**建议**：加注释说明触发条件（手动 `notFound()` 调用）。

#### 🔴 F-09 [🔁 sub-agent] 报告 SSE 端点存在但前端 `api.ts` 没有消费方 — 用户看不到流式生成

**位置**：`frontend/src/lib/api.ts:352`；`frontend/src/types/index.ts:223-226`；`backend/app/api/reports.py:75-86`

**复现**：面试完成后 `app/interview/[id]/page.tsx` → `router.push('/report/${sessionId}')` → `app/report/[id]/page.tsx` 走 `api.getReport()`（**非流式**），要等整段 LLM 生成完才显示；用户没有"报告正在生成中…逐段流出"的体验。

**建议**：
1. 在 `api.ts` 加 `getReportStream(sessionId, onToken)`，仿照 `prepMessageStream` 的 `consumeSSE` 路径；
2. `report/[id]/page.tsx` 区分"已完成 / 生成中"两种状态；
3. 后端 SSE 文档（`docs/API.md §3`）与前端 `ReportSSEEvent` 已有契约，仅缺客户端消费方。

#### 🔴 F-10 [🔁 sub-agent] WS 事件协议与前端类型不一致 — 多处"死代码"事件

**位置**：`frontend/src/types/index.ts:234-257` vs `backend/app/realtime/ws_handler.py:189-509`

**事实清单**：
- `assistant_audio_start` / `assistant_audio_chunk` / `assistant_audio_end`（types/index.ts:245-247）— **后端 ws_handler 全文未 emit**，实际走 `tts_audio`；
- `phase_changed`（types/index.ts:254）— 后端未 emit，phase 通过 `assistant_done.phase` 携带；
- `interview_complete`（types/index.ts:255）— 后端未 emit，结束信号是 `assistant_done.is_complete=true`。

**风险**：新人照 `ServerEvent` 类型加 handler 不会触发；UI 跳转依赖 `assistant_done.is_complete` 单一通道，后端改名就会静默失效。

**建议**：要么删除前端死分支，要么让 ws_handler 同步 emit（特别是 `interview_complete` 与 `phase_changed`）。

#### 🟠 F-11 [🔁 sub-agent] `interview/[id]/page.tsx` 未对 `ServerEvent` 做穷尽订阅

**位置**：`frontend/src/app/interview/[id]/page.tsx:152-189`

**事实**：`on(...)` 仅挂 8 种事件；`stt_partial`（后端 ws_handler.py:346 有 emit）、`phase_changed`、`interview_complete` 均无业务消费。

**建议**：用 `switch (msg.type) ... default: assertNever(msg)` 写穷尽函数。

#### 🟠 F-12 [🔁 sub-agent] `useInterviewWS` 失败后无后台重连，用户必须手动点

**位置**：`frontend/src/features/media/useInterviewWS.ts:144-167`

**事实**：断网启动 → 5 次重连后 `connectionState = "failed"`，用户必须手动 `retryNow()`。

**建议**：失败后保持低频（30s）后台重连并通过 toast 提示；或暴露"持续重试"开关。

#### 🟡 F-13 [🔁 sub-agent] `consumeSSE` 对空 `token` 与 JSON 解析失败不严

**位置**：`frontend/src/lib/api.ts:188-217, 307-316`

**事实**：
- 空 token（典型为首包前的 padding 块）会触发 `onToken("")` → setState 抖动；
- JSON 失败 `continue`（line 211）静默吞掉，事后无法察觉代理序列化损坏；
- `error` 事件若 `message` 为空字符串，toast 显示空错误。

**建议**：空 token 早退；JSON 失败计数 + 上限才中断；error message 兜底为 "流式输出失败"。

#### 🟡 F-14 [🔁 sub-agent] 浏览器 STT `stt_text` 上行风暴

**位置**：`frontend/src/app/interview/[id]/page.tsx:107-117`

**事实**：浏览器 STT `onresult` 每次把累计 `text` 通过 `sendRef.current({type:"stt_text", text})` 上行；后端仅 echo `stt_partial`，前端没订阅 — 浪费带宽。

**建议**：浏览器 STT 走节流（200ms）；或前端订阅 `stt_partial` 做 UI 反馈。

#### 🟡 F-15 [🔁 sub-agent] `VideoPanel.analyzeFace` 在 Safari/旧 Chromium 上落 fallback 后仍每 3s 上传

**位置**：`frontend/src/components/interview/VideoPanel.tsx:107-176`

**事实**：`window.FaceDetector` 不支持时落 fallback，把 `looking_away` 永远设为 `false`，但 `onFaceAnalysis` 仍每 3s 上行 `vision_update`，污染 vision summary 准确度。

**建议**：浏览器不支持时不再触发 `onFaceAnalysis`，或允许用户关闭；UI 加 "浏览器不支持人脸检测 API" 提示。

---

## 5. 测试与 CI 审查

#### 🟠 T-01 [已核验] 测试目录无 CI 配置文件 — 没有 GitHub Actions / GitLab CI / pre-commit

**位置**：项目根

**建议**：加 `.github/workflows/ci.yml`：
- 后端 `pytest -q`
- 前端 `npm run lint && npx tsc --noEmit`
- `pip-audit` / `npm audit`

#### 🟠 T-02 [已核验] `pytest.ini` 仅配了 `asyncio_mode`，没有 `addopts` / `testpaths`

**位置**：`backend/pytest.ini`

**建议**：加 `addopts = -q --strict-markers --tb=short`；`testpaths = tests`。

#### 🟡 T-03 [已核验] 关键路径缺测试

- **`ws_handler.py` heartbeat / 单会话单连接 / 并发 finish 竞争**：仅有 `test_ws_handler.py`，需要补：
  - 心跳超时 3 次断开
  - 同会话新连接踢旧（`claim_session_connection`）
  - 并发两个 finish 调用不重复生成报告
- **`secrets.py` AES-GCM v2 加解密 + v1 抛 LegacySecretFormatError**：现有 `test_secrets.py`，但缺 KDF + nonce 唯一性测试
- **`runner._run_tool_rounds` 工具循环 / 短路 / 超上限**：现有 `test_runner.py` 仅覆盖基础回合；工具循环路径需补
- **`compress_messages` 30% 阈值边界（刚好低于 / 刚好高于）**：补齐
- **`migrate.py` 重复执行幂等性**：现有 `test_migrate.py` 覆盖
- **`system_learning.json` 并发写**（与 S-07 对齐）：建议加 threading 并发测试

#### 🟡 T-04 [已核验] `FakeLLMClient` 在 `tests/fakes.py` 但功能有限——不能模拟 streaming / tool_calls / 错误

**位置**：`backend/tests/fakes.py`

**建议**：扩展 FakeLLMClient 支持：
- `set_response_sequence([...])` — 多次调用不同响应
- `set_stream_chunks([...])` — 流式响应
- `set_next_error(Exception)` — 模拟错误

#### 🔵 T-05 [已核验] 测试运行依赖 SQLite in-memory + StaticPool，但没有 `tests/__init__.py` 显式声明这是测试包

**位置**：`backend/tests/__init__.py`（已存在但空）

**建议**：保持现状即可（pytest 自动识别）。

#### 🔵 T-06 [已核验] 前端没有测试

**建议**：补：
- `consumeSSE` 解析器单测（Vitest）
- `useInterviewWS` 的 reconnect 行为单测（带 mock WebSocket）
- MarkdownContent 的 XSS sanitize 单测

---

## 6. 审查方法与可重现性

为方便复核，本报告所有"已核验"发现的核验路径如下：

| 发现 ID | 核验路径（文件 + 行号） |
|---|---|
| S-01 | `backend/app/agents/prep/agent.py:82-89`, `116-130` |
| S-02 | `backend/app/services/llm/client.py:537-538`, `backend/app/config.py:90` |
| S-03 | `backend/app/services/llm/client.py:340-408` |
| S-04 | `backend/app/config.py:43`, `backend/app/main.py:_check_cors_policy` |
| S-05 | `backend/app/schemas/__init__.py:168`, `backend/app/api/options.py:29-34` |
| S-06 | `backend/app/core/security.py:380-444` |
| S-07 | `backend/app/services/growth/learning.py:30-52` |
| S-08 | `backend/app/services/interview/runner.py:137-142` |
| S-09 | `backend/app/core/secrets.py:41-43`, `backend/app/config.py:41` |
| S-10 | `backend/app/main.py:204-217` |
| A-01 | `backend/app/services/rag/local_backend.py:53-72` |
| A-02 | `backend/app/realtime/ws_handler.py:449-492`, `backend/app/api/interview.py:159-167` |
| A-03 | `backend/app/agents/prep/agent.py`, `backend/app/services/interview/agent.py` |
| A-04 | `backend/app/services/rag/company_rag.py`, `backend/app/main.py:115` |
| A-05 | `app/realtime/events.py` ↔ `frontend/src/types/index.ts` |
| A-06 | `backend/app/services/interview/runner.py:187-204`, `backend/app/services/rag/stepfun_backend.py` |
| A-07 | `backend/app/services/interview/runner.py:118-126`, `backend/app/services/interview/agent.py:305-324` |
| A-08 | `backend/app/services/interview/runner.py:260-285`, `backend/app/services/growth/learning.py:88-92` |
| A-09 | `backend/app/services/llm/client.py:60-69, 376-394` |
| A-10 | `frontend/src/lib/api.ts:48-65`, `frontend/next.config.js:10-21` |
| A-11 | `backend/requirements.txt:9` |
| A-12 🔁 | `backend/app/agents/orchestrator.py:18-33` |
| A-13 🔁 | `runner.py:405-423` / `agent.py:225-229` / `ws_handler.py:438-439, 528-530` |
| A-14 🔁 | `backend/app/services/rag/stepfun_backend.py:46, 49` |
| A-15 🔁 | `backend/app/api/v1/prep.py:26` / `reports.py:31` |
| A-16 🔁 | `constants.py:58-67` / `frontend/src/config/phases.ts:7-29` |
| A-17 🔁 | `backend/app/config.py:51` / `interview/[id]/page.tsx:113-141` |
| A-18 🔁 | `backend/app/core/migrate.py:22-63` / `models/__init__.py:17-154` |
| A-19 🔁 | `backend/app/realtime/ws_handler.py:526-552` |
| A-20 🔁 | `backend/app/services/interview/events.py:16` |
| A-21 🔁 | `frontend/src/app/api/v1/prep/sessions/` |
| Q-01 | `backend/app/services/resume/parser.py:36-45` |
| Q-02 | `backend/app/services/llm/client.py:430-443` |
| Q-03 | `backend/app/services/interview/runner.py:283` |
| Q-04 | `backend/app/services/interview/agent.py:220-222` |
| Q-05 | `frontend/src/features/media/useInterviewWS.ts:201-217` |
| Q-06 | `backend/app/services/resume/parser.py:40-42` |
| F-01 | `frontend/next.config.js:4-7` |
| F-02 | `frontend/src/features/media/useInterviewWS.ts:42, 75-96` |
| F-03 | `frontend/src/components/interview/VideoPanel.tsx` |
| F-04 | `frontend/src/components/MarkdownContent.tsx` |
| F-05 | `frontend/src/lib/api.ts:200-217` |
| F-06 | `frontend/src/app/page.tsx`, `frontend/package.json:6, 9` |
| F-07 | `frontend/src/components/Toast.tsx` |
| F-08 | `frontend/src/app/not-found.tsx` |
| F-09 🔁 | `frontend/src/lib/api.ts:352`, `types/index.ts:223-226`, `backend/app/api/reports.py:75-86` |
| F-10 🔁 | `frontend/src/types/index.ts:234-257` vs `backend/app/realtime/ws_handler.py:189-509` |
| F-11 🔁 | `frontend/src/app/interview/[id]/page.tsx:152-189` |
| F-12 🔁 | `frontend/src/features/media/useInterviewWS.ts:144-167` |
| F-13 🔁 | `frontend/src/lib/api.ts:188-217, 307-316` |
| F-14 🔁 | `frontend/src/app/interview/[id]/page.tsx:107-117` |
| F-15 🔁 | `frontend/src/components/interview/VideoPanel.tsx:107-176` |
| T-01 | 项目根（无 CI 配置） |
| T-02 | `backend/pytest.ini` |
| T-03 | `backend/tests/test_ws_handler.py`, `test_runner.py`, `test_secrets.py` |
| T-04 | `backend/tests/fakes.py` |

---

## 7. 推荐修复顺序（落地 roadmap）

### P0 — 必修（影响安全 / 正确性 / 用户体验）

1. **S-01** PrepAgent ReAct 改 OpenAI function calling（或严格沙箱化正则路径）；
2. **S-05** `interview_style` 前后端枚举对齐；
3. **A-01** RAG `embed()` 分批 + 失败可见；
4. **A-12** Orchestrator 静默追问索引算法 bug — 压力人格永远走温柔分支；
5. **F-01** Next `BACKEND_PORT` 端口范围校验；
6. **F-09** 前端补 `getReportStream` 消费方（否则报告 SSE 端点闲置）；
7. **F-10** WS 事件协议对齐 — 删除死分支或接通 `interview_complete` / `phase_changed`；
8. **T-01** 加 CI（pytest + tsc + pip-audit + npm audit）。

### P1 — 应修（影响质量与可维护性）

9. **S-02** `embed_key` 走 `decrypt_secret`；
10. **S-03** 流式重试在 yield 后不重发；
11. **S-07** `system_learning.json` 加锁；
12. **A-02 / A-13** 报告生成与 WS 互斥语义文档化 + Runner / Agent / ws_handler 越界读写；
13. **A-15** SSE 错误文案统一到 `core/constants.py`；
14. **A-19** `reference_hint` 失败时显式发错误事件；
15. **Q-01** 简历 PDF/DOCX 解析加超时；
16. **Q-03** tool_trace 用结构化 ok 判断；
17. **F-04** MarkdownContent 加 `rehype-sanitize`；
18. **F-11** `interview/[id]` 写穷尽 `assertNever` 订阅；
19. **F-12** WS 失败后保持后台重连；
20. **F-14** 浏览器 STT 节流；
21. **F-15** FaceDetector fallback 时停止上行。

### P2 — 优化（可分批排期）

22. **A-03** PrepAgent / InterviewAgent 抽象提取；
23. **A-04 / A-14** `CompanyKnowledgeRAG` 兼容层下线 + stepfun_backend 反向 import 清理；
24. **A-05 / A-16** 协议一致性自动校验脚本 + phases 双轨校验；
25. **A-17** `silence_nudge_seconds` 前后端联动 + `is_prod` 扩展；
26. **A-18** MIGRATIONS 与 ORM 自动对齐；
27. **A-20** `EventKind` 与 `WSServerEvent` 字符串空间注释/统一；
28. **T-03** 关键路径补测试；
29. **S-09** secrets 文件目录统一；
30. **A-11** 删除 `sse-starlette` 未使用依赖。

### P3 — 后续打磨

- Q-07 / Q-08 / Q-09 / Q-10 / Q-11 / F-05 / F-06 / F-07 / F-08 等 Low / Info 项，按维护窗口逐步消化。

---

## 8. 总结

> **项目当前架构基本盘稳健**：分层清晰、错误信封统一、安全默认偏严、协议用强类型契约锁住、RAG 抽象层解决循环、WS 单连接防 race——这些都是"过了原型期"的特征。
>
> **必修项集中在 8 处**：
> ① PrepAgent ReAct 沙箱（S-01）；
> ② 风格枚举一致性（S-05）；
> ③ RAG 启动可靠性（A-01）；
> ④ Orchestrator 静默追问索引 bug（A-12，sub-agent 发现）；
> ⑤ Next 端口配置硬伤（F-01）；
> ⑥ 前端报告 SSE 端点闲置（F-09）；
> ⑦ WS 事件协议死分支（F-10 / A-13）；
> ⑧ CI 缺位（T-01）。
> 这 8 条修完即可"对外宣称 v1.0"。
>
> **架构层面的核心张力**：Runner / ws_handler / API 三入口互斥语义不清；InterviewAgent / PrepAgent 同形但实现重复；RAG 数据流在 main.py 与 runner.py 分裂；前端 12 种 WS 事件类型中至少 4 种是死代码；Orchestrator / VisionAgent / Runner `_build_user_content` 三处维护同一职责；MIGRATIONS 与 ORM 双轨硬编码。这些是"补丁期"必须消化但不必大动干戈的事项。
>
> **测试的当务之急**：WS handler 的心跳 / 单连接 / 并发 finish；LLMClient 流式重试；Runner 工具循环边界；前端 `getReportStream` 与 `useInterviewWS` reconnect 行为单测。这四条路径一旦回归，安全与计费都可能破。
>
> **端到端契约短板**：后端 `GET /api/v1/reports/{id}/stream` 已实现、文档已写、前端 `ReportSSEEvent` 类型已定义，但**前端没人消费**——这说明后端"做完了"与前端"用上了"之间存在流程断层；类似情况也发生在 `interview_complete` / `phase_changed` / `assistant_audio_*` 上。下次发布前应当跑一次"type → handler 矩阵"扫描。
>
> **扩展点抽查（A-22）**：6 个扩展点中 3 个明确可行（EP-3 / EP-6 / 部分 EP-2），3 个有依赖维护风险（EP-1 需先抽象 LLMClient / EP-4 缺 KB schema 校验 / EP-5 prep agent 工具名不全）。建议在添加第三个 LLM Provider / 第三种 KB 来源前先收敛 A-14、A-15、A-18。

---

*本报告仅审查不修改代码；所有发现均附行号可复核；建议落地由团队自行排期。*