# InterviewOS 权威设想

> **历史归档**：项目立项阶段的个人随笔、Claude 建议、GPT 建议已迁移至 [`docs/history/INTERVIEWOS_ORIGINAL_IDEA.md`](./docs/history/INTERVIEWOS_ORIGINAL_IDEA.md)。

> 本文件仅保留**产品决策**与**实现状态注脚**两个权威章节。

---

## 产品决策（已确认，2026-07）

> 以下为项目所有者对 Claude / GPT 开放问题的落地决策，覆盖权威设想。

### 自我成长：两者都要

1. **候选人成长**：`GrowthRecord` + 成长页弱项聚合 / 训练计划 / 历史报告。
2. **系统迭代**：`backend/data/system_learning.json` 记录工具命中、公司场次、薄弱线索；成长页「系统自我成长」区块展示。

### GitHub 接入方式

- 采用 **GitHub REST 工具层**（语义对齐常见 GitHub MCP：`github_get_user` / `list_repos` / `get_readme` / `list_commits` / `list_pulls` / `get_file` / `languages`）。
- 可选 `GITHUB_TOKEN` 提高配额；未配置仍可访问公开数据。
- 面试 Runner 通过 OpenAI function calling 循环调用，结果写入 `agent_state.github_findings`。

### RAG 边界（采纳 Claude 建议）

- 简历 / GitHub：全文或工具 fetch，不走向量检索。
- 公司面经 / 风格：Chroma 或 StepFun retrieval RAG。

### 上下文（40 分钟）

- 结构化 `agent_state`：`asked_questions` / `weak_points` / `github_findings` / `tool_trace`。
- `compress_messages` 在 context window 30% 阈值触发摘要压缩。

### 面经数据

- 内置种子公司知识 + 用户/Agent 检索；不实施大规模爬虫（合规）。

### 人像与语音

- 面试官：CSS 拟真半身像 + 口型/眨眼/情绪（可替换 Live2D）；前端亦可 TalkingHead 3D。
- 语音管道三阶段：独立 ASR（多厂商 / 本地 Whisper）→ 文本 LLM 思考 → TTS 播报（Edge / MiniMax Speech 等，可仅字幕）；摄像头多模态。



### 实现状态注脚（2026-07-23）

> 以下标记说明上述各项在仓库 `main` 分支中的**实际落地情况**。原则性 / 决策性表述保持不变，仅补充实现注脚，避免后人误以为全部已实现。
> 完整进度与修改意见：[`DEVELOPMENT_PROGRESS.md`](./DEVELOPMENT_PROGRESS.md) · [`PROJECT_REPORT.md`](./PROJECT_REPORT.md)。

| 决策 | 实现情况 | 说明 |
|---|---|---|
| 候选人成长（GrowthRecord + 成长页） | ✅ | `app/services/growth/learning.py` + `GrowthRecord` 表 + `/api/v1/reports/growth/history` |
| 系统迭代（`system_learning.json` + 洞察） | ✅ 写入与展示 | **尚未自动反哺 prompt / 题库策略**（属 P1） |
| GitHub REST 工具层 | ✅ | 语义对齐常见 GitHub MCP；**未走官方 MCP 进程传输**（std/HTTP 适配器见 P2） |
| RAG 边界（公司用 RAG，简历 / GitHub 不用） | ✅ | 抽象层 `RAGBackend`（`local` Chroma / `stepfun` retrieval / `none`） |
| 上下文：30% 阈值 + 结构化 agent_state | ✅ | `app/services/context/manager.py` + `InterviewAgent` |
| 面经数据：内置 + 检索，不爬虫 | ✅ | 当前内置 7 家（字节/腾讯/阿里/美团/米哈游/OpenAI/Google），无众包上传 |
| 人像：CSS 矢量 + 口型/眨眼/情绪 | ✅ | `InterviewerAvatar`；可选 TalkingHead GLB；**未引入 Live2D**（P1） |
| 语音：三处理器（ASR + 思考 LLM + TTS） | ✅ | 独立 ASR BYOK；播报 Edge / MiniMax Speech；本地 Whisper 回退 |
| 注册 / 登录 / 多用户隔离 | ❌ 未实现 | MVP 定位本地单机；`profile_id=1` 单行 |
| 等待叫号 / 候考大厅 | ❌ 未实现 | 创建会话即可开始 |
| 面经众包上传 | ❌ 未实现 | 仅有 duckduckgo 搜索 |
| 系统学习自动改写 prompt | ❌ 未实现 | 当前为「记录 + 展示」 |
| 40–60 分钟实战压测 | ❌ 未做 | 机制具备，待真实 LLM 长测优化摘要质量 |
