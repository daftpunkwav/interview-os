# InterviewOS 项目状况与进展报告

> 生成日期：2026-08-05（最近一次核对，以 `git log` 最新 commit 为准）  
> 分支：`main`  
> 权威需求：`InterviewOS.md`  
> 作者约定：`daftpunkwav` / `daftpunk.wav@outlook.com`  
> 详细开发进度（实现路径 + 修改意见）：[`DEVELOPMENT_PROGRESS.md`](./DEVELOPMENT_PROGRESS.md)

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
| BYOK 设置与连通测试 | `/settings` | ✅ | 三处理器（识别/思考/播报）；密钥 at-rest AES-256-GCM；分阶段「测试」 |
| 个人档案（扩展） | `/profile` | ✅ | 基本信息 + 教育 + 求职 + **GitHub/作品集/城市/亮点/远程/到岗** |
| 多简历上传 | `/resume` | ✅ | PDF/DOCX/MD/TXT，10MB + 魔数校验 |
| 设为投递 / 删除 | `/resume` | ✅ | 激活互斥；DELETE 清理 |
| 简历 Agent 深度评价 | 「AI 深度评价」 | ✅ | 综合分 + 8 维评分 + 优势/不足/风险/改写/预测题/叙事 |
| 面试准备 Agent | `/prep` | ✅ | 绑定简历 + 公司；ReAct 工具（搜索/公司/出题/**GitHub**） |
| 面试配置 | `/interview` | ✅ | 岗位/职级/公司/工作流/人格/严厉度/风格/人像/场景/简历 |
| 实时面试房间 | `/interview/[id]` | ✅ | WS、摄像头、ASR→思考→TTS、文字、阶段流转；同会话单连接（新连接踢旧） |
| 面试官拟真人像 | 面试房间 | ✅ | TalkingHead 3D GLB（口型/情绪）+ WebGL 失败时回退 CSS SVG 半身像 |
| 真实语音 | 三处理器 | ✅ | ASR 多厂商 + 本地 Whisper 回退；播报 Edge TTS / 其他云端 TTS / 仅字幕 |
| GitHub 项目核验 | 面试/准备工具 | ✅ | 用户/仓库/README/commit/PR/文件/语言（REST + function tools） |
| 公司 RAG | 面试回合 | ✅ | local Chroma / StepFun retrieval / none 三后端；数据来自内置 7 家 |
| 动态追问 | Runner | ✅ | 结构化信号 + 工具证据 |
| 长上下文 | context manager | ✅ | 30% 阈值压缩 + 结构化 agent_state |
| 面试报告 | `/report/[id]` | ✅ | 多维评分、建议、训练计划；SSE 单次 LLM 流式，避免双倍计费 |
| 成长追踪 | `/growth` | ✅ | 候选人弱项 + 系统自我成长洞察（`system_learning.json`） |
| 历史会话 | `/history` | ✅ | 会话列表 |
| 本地数据 | SQLite + Chroma | ✅ | 无强制登录 |

### 2.2 部分实现 / 可增强

| 功能 | 现状 | 建议 |
|------|------|------|
| 「等待叫号」队列 | 未做叫号 UI；创建会话即开始 | 若需大厅感，可加 `waiting` 队列状态机 |
| 官方 MCP 传输 | 当前为 **REST 工具层（MCP 语义）** | 可再挂 stdio/HTTP MCP 适配器 |
| LangGraph | 自研 Runner + 状态机 | 可选迁移；非阻塞 |
| Live2D / 视频人像 | CSS SVG 拟真半身像 | 可替换 `InterviewerAvatar` 为 Live2D；接口（avatar_id/emotion/audio_b64）保持稳定 |
| 面经众包上传 | 内置 7 家 + web_search（duckduckgo） | 可加用户上传面经入库（合规内） |
| 多用户鉴权 | 本地单用户 | 产品化需账号体系（PRD 有，MVP 刻意不做） |
| 40–60 分钟实战压测 | 机制具备 | 需真实 LLM 长测优化摘要质量 |
| 系统学习闭环 | ✅ 第一阶段已闭环：写 memory + 展示 + **反哺开场 system prompt** | 第二阶段：表现最差"公司×岗位×阶段"组合加入重点追问指令 |
| `interview_style` 一致性 | ✅ 已修复：前后端均为 4 种（guided/deep_dive/continuous/challenging） | — |
| 客户端实时人脸检测 | 当前依赖前端可选上传 `face_analysis` | 前端 `VideoPanel` 接入 `MediaPipe` / `face-api.js` 自动产出 |
| `system_learning.json` 并发写 | 单 worker 下 `_load/_save` 同步读写 | 加锁 / 迁 SQLite |

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
  realtime/ws_handler → InterviewRunner → LLM / ASR / TTS / RAG / GitHub
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
| `/settings` | 三处理器 BYOK |

主题与整体 UI **未大改**，仅优化人像、评价展示、档案字段与成长洞察。

---

## 4. 当前分支与近期变更（`main`）

1. **GitHub 工具层** `backend/app/services/github/`（REST + OpenAI function tools，语义对齐常见 GitHub MCP）
2. **面试 function calling 循环** + 无工具短路（避免双倍延迟）
3. **富简历评价 schema + 前端展示 + 删除**（8 维 + ATS + 风险点 + 改写示例 + 预测题 + 叙事）
4. **档案扩展字段 + 迁移**（GitHub/作品集/LinkedIn/城市/语言/亮点/远程/到岗）
5. **拟真 CSS SVG 面试官**（半身像 + 口型 + 眨眼 + 情绪）
6. **系统成长 memory + API + 成长页区块**（`system_learning.json`）
7. **结构化 agent_state 注入 system prompt**（asked_questions / weak_points / tool_trace / github_findings）
8. **Prep Agent 支持 GitHub**（同步 + 流式双接口）
9. **WS 单会话单连接**（`fix/ws-single-session-mutex`）
10. **报告 SSE 单次 LLM**（`fix/report-stream-single-llm`）
11. **出站 DNS pin**（`fix/ssrf-pin-ip-transport`，缓解 DNS rebinding TOCTOU）
12. **前端同源代理 + Google MD3 风格 UI**（`feat/frontend`）
13. **测试**：30+ 个测试文件（`test_*.py` 30 个 + `conftest` / `fakes`），含 `test_github_tools` / `test_resume_analysis_normalize` / `test_growth_learning` / `test_rag_backends` / `test_security` / `test_security_extra` / `test_report_stream` / `test_migrate` / `test_llm_client_retry` / `test_phase_ssot` / `test_voice_pipeline` 等通过；具体数字以最近一次 `pytest --collect-only` 为准

### 主要 Git 分支

| 分支 | 主题 |
|------|------|
| `main` | 当前；接收各 fix / refactor 合并 |
| `feat/complete-platform-v1` | 综合功能汇总分支（含 GitHub 工具 + 拟真人像 + 系统学习等） |
| `feat/v2-realtime-core` | 实时核心（WS handler 重构） |
| `feat/m0-bootstrap-tests` ~ `feat/m4-rag-company-kb` | 分阶段里程碑 |
| `feat/rag-multibackend` | RAG 多后端抽象 |
| `fix/ssrf-pin-ip-transport` | 出站 DNS pin |
| `fix/ws-single-session-mutex` | WS 单会话单连接 |
| `fix/report-stream-single-llm` | 报告 SSE 单次 LLM |
| `fix/security-hardening` | 安全加固（AES-GCM / SSRF / WS 心跳 / 限流） |
| `refactor/*` | 代码现代化与安全加固 |

---

## 5. 与权威设想对照

| 设想（InterviewOS.md） | 完成度 | 备注 |
|------------------------|--------|------|
| 摄像头面试 | ✅ | VideoPanel + 多模态帧 |
| 提交简历 | ✅ | 多份 + 评价 |
| 按简历/岗位提问与追问 | ✅ | Agent + followup（阶段感知 + 薄弱线索记录 + 每回合刷新结构化记忆） |
| 候选人反问公司 | ✅ | 反问阶段 + 专门公司代表 prompt（角色切换 + 公司资料 + 坦诚说明） |
| 态度/严厉度 | ✅ | personality + strictness 1–10 |
| 模拟字节/腾讯等 | ✅ | 公司选项 + RAG/知识 |
| 面经收集 | ⚠️ | 种子 + 搜索；不爬虫 |
| BYOK | ✅ | |
| ≥40 分钟上下文 | ⚠️ 机制 ✅ | 需长测；压缩 + 结构化记忆每回合刷新已上 |
| 工具调用 | ✅ | |
| GitHub MCP | ✅ 语义 | REST 实现，非 MCP 进程 |
| 自我成长 | ✅ 双轨闭环 | 候选人 + 系统 memory（反哺开场 system prompt） |
| 多 workflow | ✅ | technical / hr / management |
| RAG 决策 | ✅ | 公司用 RAG，简历/GitHub 不用 |
| 拟真人像 + 真声 | ✅ | TalkingHead/CSS 人像 + Edge / MiniMax Speech |

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
python -m app.main

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
