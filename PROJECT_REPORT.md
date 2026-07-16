# InterviewOS 项目状况与进展报告

> 生成日期：2026-07-16  
> 分支：`feat/complete-platform-v1`  
> 权威需求：`InterviewOS.md`  
> 作者约定：`daftpunkwav` / `daftpunk.wav@outlook.com`

---

## 1. 项目介绍

**InterviewOS** 是一个本地优先、BYOK 的 **Agentic 模拟面试平台**。  
用户填写档案、管理多份简历，在配置公司/岗位/人格/严厉度后，与具备工具调用、RAG、语音与拟真人像的 AI 面试官完成接近真实的多阶段面试，并获得报告与成长追踪。

定位不是「刷题机器人」，而是整合：

| 能力域 | 说明 |
|--------|------|
| Resume Agent | 解析 + 多维度评价 |
| Prep Agent | 面试前辅导（贴合简历） |
| Interviewer Agent | 长时面试、追问、工具核验 |
| Company RAG | 企业风格 / 面经知识 |
| GitHub Tools | 真实仓库核验（MCP 语义） |
| Voice + Avatar | 压迫感语音 + 拟真人像 |
| Growth | 候选人进步 + 系统自我迭代 |

---

## 2. 功能清单（用户视角）

### 2.1 已实现且可用

| 功能 | 入口 | 状态 | 说明 |
|------|------|------|------|
| BYOK 设置与连通测试 | `/settings` | ✅ | API Key at-rest AES-256-GCM |
| 个人档案（扩展） | `/profile` | ✅ | 基本信息 + 教育 + 求职 + **GitHub/作品集/城市/亮点/远程/到岗** |
| 多简历上传 | `/resume` | ✅ | PDF/DOCX/MD/TXT，10MB + 魔数校验 |
| 设为投递 / 删除 | `/resume` | ✅ | 激活互斥；DELETE 清理 |
| 简历 Agent 深度评价 | 「AI 深度评价」 | ✅ | 综合分 + 8 维评分 + 优势/不足/风险/改写/预测题/叙事 |
| 面试准备 Agent | `/prep` | ✅ | 绑定简历 + 公司；ReAct 工具（搜索/公司/出题/**GitHub**） |
| 面试配置 | `/interview` | ✅ | 岗位/职级/公司/工作流/人格/严厉度/风格/人像/场景/简历 |
| 实时面试房间 | `/interview/[id]` | ✅ | WS、摄像头、STT、TTS、文字、阶段流转 |
| 面试官拟真人像 | 面试房间 | ✅ | CSS 半身像、口型、眨眼、情绪（smile/serious） |
| 真实语音 | Edge TTS | ✅ | 串行队列；可配置音色 |
| GitHub 项目核验 | 面试/准备工具 | ✅ | 用户/仓库/README/commit/PR/文件/语言 |
| 公司 RAG | 面试回合 | ✅ | local Chroma / StepFun / none |
| 动态追问 | Runner | ✅ | 结构化信号 + 工具证据 |
| 长上下文 | context manager | ✅ | 30% 阈值压缩 + 结构化 agent_state |
| 面试报告 | `/report/[id]` | ✅ | 多维评分、建议、训练计划；SSE 流式 |
| 成长追踪 | `/growth` | ✅ | 弱项聚合 + 系统自我成长洞察 |
| 历史会话 | `/history` | ✅ | 会话列表 |
| 本地数据 | SQLite + Chroma | ✅ | 无强制登录 |

### 2.2 部分实现 / 可增强

| 功能 | 现状 | 建议 |
|------|------|------|
| 「等待叫号」队列 | 未做叫号 UI；创建会话即开始 | 若需大厅感，可加 pending 队列状态机 |
| 官方 MCP 传输 | 当前为 **REST 工具层（MCP 语义）** | 可再挂 stdio/HTTP MCP 适配器 |
| LangGraph | 自研 Runner + 状态机 | 可选迁移；非阻塞 |
| Live2D / 视频人像 | CSS 拟真半身像 | 可替换 `InterviewerAvatar` 为 Live2D |
| 面经众包上传 | 内置种子 + web_search | 可加用户上传面经入库 |
| 多用户鉴权 | 本地单用户 | 产品化需账号体系（PRD 有，MVP 刻意不做） |
| 40–60 分钟实战压测 | 机制具备 | 需真实 LLM 长测优化摘要质量 |
| 系统学习闭环 | 写 memory + 展示 | 尚未自动改写 prompt/题库策略 |

### 2.3 明确未做（合规/范围）

- 大规模爬取牛客/看准等（ToS 风险）——权威文档已否决
- 云端多租户 SaaS
- 付费模型路由 / 账单

---

## 3. 整体设计与实现

### 3.1 架构分层

```
浏览器 (Next.js 15)
  REST /api/v1/*  ·  WS 面试  ·  SSE 报告/准备
        │
FastAPI (Python 3.11+)
  api/ → services/ → core/
  realtime/ws_handler → InterviewRunner → LLM / STT / TTS / RAG / GitHub
        │
SQLite · Chroma · uploads · system_learning.json
```

### 3.2 核心面试数据流

1. 创建 `InterviewSession`（配置人格/公司/简历/人像）
2. WS 连接 → `stream_opening` / `stream_turn`
3. 每回合：追问分析 → RAG → **工具循环（GitHub 等）** → 流式回复 → TTS
4. 阶段标记 `[PHASE_COMPLETE]` / `[INTERVIEW_COMPLETE]`
5. finish → 报告 + GrowthRecord + system_learning

### 3.3 Agent 与工具

| Agent | 位置 | 工具 |
|-------|------|------|
| Interviewer | `services/interview/*` | github_*、lookup_company、lookup_resume、web_search、RAG |
| Prep | `agents/prep/agent.py` | web_search、company_info、quiz、github_* |
| Resume 评价 | `api/resume.py` analyze | LLM JSON → ResumeAnalysis |
| Vision | `agents/vision` | 面部提示注入 user 文本 |
| Orchestrator | `agents/orchestrator` | 多源快照合并 |

### 3.4 关键配置

| 变量 | 作用 |
|------|------|
| `LLM_*` | BYOK |
| `GITHUB_TOKEN` | 提高 GitHub API 配额 |
| `INTERVIEW_TOOLS_ENABLED` | 开关工具循环 |
| `INTERVIEW_MAX_TOOL_ROUNDS` | 工具轮次上限（默认 3） |
| `RAG_BACKEND` | local / stepfun / none |
| `INTERVIEWOS_ENV` | dev / prod 安全策略 |

### 3.5 前端页面

| 路径 | 用途 |
|------|------|
| `/` | 首页 |
| `/profile` | 档案 |
| `/resume` | 简历管理与评价 |
| `/prep` | 面试准备 |
| `/interview` | 配置开面 |
| `/interview/[id]` | 实时房间 |
| `/report/[id]` | 报告 |
| `/growth` | 成长 |
| `/history` | 历史 |
| `/settings` | BYOK |

主题与整体 UI **未大改**，仅优化人像、评价展示、档案字段与成长洞察。

---

## 4. 本轮实现要点（`feat/complete-platform-v1`）

1. **GitHub 工具层** `backend/app/services/github/`
2. **面试 function calling 循环** + 无工具短路（避免双倍延迟）
3. **富简历评价 schema + 前端展示 + 删除**
4. **档案扩展字段 + 迁移**
5. **拟真 CSS 面试官**
6. **系统成长 memory + API + 成长页区块**
7. **结构化 agent_state 注入 system prompt**
8. **Prep Agent 支持 GitHub**
9. **测试**：`test_github_tools` / `test_resume_analysis_normalize` / `test_growth_learning` 等通过
10. **文档**：README / ARCHITECTURE / API / CHANGELOG / InterviewOS 产品决策

### Git 记录

- 分支：`feat/complete-platform-v1`
- 提交：`feat: complete interview agent tools and platform core features`（及后续 docs 提交）
- 作者：`daftpunkwav` &lt;daftpunk.wav@outlook.com&gt;

---

## 5. 与权威设想对照

| 设想（InterviewOS.md） | 完成度 | 备注 |
|------------------------|--------|------|
| 摄像头面试 | ✅ | VideoPanel + 多模态帧 |
| 提交简历 | ✅ | 多份 + 评价 |
| 按简历/岗位提问与追问 | ✅ | Agent + followup |
| 候选人反问公司 | ✅ | 反问阶段 + 公司知识 |
| 态度/严厉度 | ✅ | personality + strictness 1–10 |
| 模拟字节/腾讯等 | ✅ | 公司选项 + RAG/知识 |
| 面经收集 | ⚠️ | 种子 + 搜索；不爬虫 |
| BYOK | ✅ | |
| ≥40 分钟上下文 | ⚠️ 机制 ✅ | 需长测；压缩 + 结构化记忆已上 |
| 工具调用 | ✅ | |
| GitHub MCP | ✅ 语义 | REST 实现，非 MCP 进程 |
| 自我成长 | ✅ 双轨 | 候选人 + 系统 memory |
| 多 workflow | ✅ | technical / hr / management |
| RAG 决策 | ✅ | 公司用 RAG，简历/GitHub 不用 |
| 拟真人像 + 真声 | ✅ | CSS 人像 + Edge TTS |

---

## 6. 建议的后续实现优先级

### P0（体验与真实感）

1. 真实 LLM 下跑通「简历评价 → 准备 → 全流程面试 → 报告」E2E  
2. 配置 `GITHUB_TOKEN` 后验证简历项目 vs 仓库追问质量  
3. 长面试（40min+）摘要质量调参  

### P1（能力加深）

1. 用户上传面经 → 写入 Chroma  
2. 系统学习自动反哺 system prompt 片段  
3. Live2D 或更高保真人像  
4. 可选 LangGraph 显式图（阶段/工具/报告节点）  

### P2（产品化）

1. 账号与多用户  
2. 叫号/排队氛围  
3. Postgres 多实例  
4. 官方 GitHub MCP server 适配  

---

## 7. 如何本地验证

```powershell
# 后端
cd backend
.\.venv\Scripts\activate
pip install -r requirements.txt
# 编辑 .env：LLM_* 、可选 GITHUB_TOKEN
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev
```

测试：

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

推荐路径：设置 → 档案（填 GitHub）→ 上传简历 → AI 深度评价 → 面试准备 → 配置面试（选人像/公司/严厉度）→ 开面。

---

## 8. 结论

InterviewOS 已从「可跑的模拟面试骨架」推进到 **功能闭环接近完整的 Agentic 面试平台**：

- 用户信息与多简历评价链路完整  
- 准备 Agent 与面试 Agent 均具备工具与简历上下文  
- 面试核心具备 **RAG + GitHub 核验 + 追问 + 语音 + 人像 + 长上下文状态**  
- 报告与双重成长已接通  

**尚未「研究级完美」的部分**：官方 MCP 进程、Live2D、面经众包、系统学习自动改策略、多用户与 40 分钟实战打磨。  
这些不影响主路径演示，可按第 6 节优先级继续迭代。

---

*本报告描述的是仓库在报告生成时的状态；以 git 历史与代码为准。*
