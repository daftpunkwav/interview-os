# InterviewOS

> AI 智能模拟面试 Agent 平台 — 开源、本地优先、BYOK

InterviewOS 是一个基于 AI Agent 的真实面试模拟系统。上传简历后，系统根据岗位、目标公司和面试风格，
自动生成专属面试流程，通过动态追问、企业风格模拟和视频交互，让你体验接近真实的企业面试。

## 核心特性

- **BYOK** — 自带 API Key，支持 OpenAI 兼容接口（OpenAI、StepFun、DeepSeek、OpenRouter、Claude via proxy 等）；API Key 入库前 AES-256-GCM 加密
- **多字段个人档案** — 基础信息 + 教育/求职 + GitHub 用户名/作品集/LinkedIn/城市/语言/职业亮点/远程偏好/到岗周期
- **多简历管理** — 上传/激活/删除；Agent 多维度深度评价（结构、量化、技术深度、ATS、风险点、改写示例、预测题）
- **面试准备 Agent** — 按选定简历 + 目标公司辅导，支持 web_search（duckduckgo）/ 公司知识 / GitHub 工具
- **企业风格模拟** — 内置 7 家企业知识（字节、腾讯、阿里、美团、米哈游、OpenAI、Google）+ 可选 Chroma / StepFun 向量检索后端
- **多 Workflow** — 技术面 / HR 面 / 管理岗，完整阶段流转；人格（5 种）/严格度（1–10）/风格（4 种）/人像/场景可配
- **实时面试 Agent** — 摄像头 + 麦克风 + 流式 LLM；**三处理器管道**（独立 ASR → 文本 LLM 思考 → TTS 播报）
- **动态追问** — 结构化追问信号 + 工具核实 + 30% 阈值上下文压缩与结构化记忆
- **拟真人像** — CSS 矢量半身面试官 + 口型/眨眼/情绪（不依赖 Live2D / 视频）
- **面试报告** — 多维度评分、改进建议、训练计划；SSE 流式
- **双重成长** — 候选人弱项追踪（GrowthRecord）+ 系统跨面试学习 memory（`system_learning.json`）
- **本地优先** — SQLite + Chroma 本地落盘，无注册登录

> 与权威设想（`InterviewOS.md`）对照：**等待叫号队列、官方 MCP 进程传输、Live2D 人像、面经众包、多用户鉴权、40–60 分钟实战压测** 等仍未实现，详见 [PROJECT_REPORT.md](./PROJECT_REPORT.md) §2.2–2.3。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.11+ · FastAPI · SQLAlchemy 2.0 · SQLite · ChromaDB · Pydantic v2 |
| 前端 | Next.js 15 · React 19 · TypeScript strict (`noUncheckedIndexedAccess`) · Tailwind CSS · framer-motion |
| AI | OpenAI Chat Completions 兼容 API（含 embeddings） |
| 语音 | **三处理器**：多厂商 ASR（OpenAI 兼容 / 讯飞 / 豆包 / 阿里 / 腾讯 / 百度）+ 本地 faster-whisper 回退；文本 LLM 思考；播报 Edge TTS 或 MiniMax Speech（T2A）等 |
| 测试 | pytest / pytest-asyncio |

> 注：GitHub 集成通过 `app/services/github/` 中的 **REST 客户端 + OpenAI function tools** 实现，与常见 GitHub MCP 工具语义对齐；**不是**官方 MCP 进程传输。可后续替换为 stdio/HTTP MCP 适配器（见 [PROJECT_REPORT.md §2.2](./PROJECT_REPORT.md)）。

## 安全 & 工程

- ✅ API Key at-rest 加密（AES-256-GCM，依赖 `cryptography`；AEAD 篡改拒绝 + 旧 `enc:v1:` 密文显式抛错引导重设）
- ✅ SSRF 防御：`api_base` 入参禁止 loopback/私网，端口仅白名单 80/443，多 A 记录遍历防 DNS rebinding（dev 模式允许 loopback）
- ✅ 文件上传：10 MB 流式上限 + 魔数嗅探 + 路径越界校验
- ✅ WebSocket 心跳：服务端 30s 超时发 `server_ping`，客户端 5s 内必须回 `pong`，累计 3 次失败 graceful close
- ✅ LLM 客户端：4xx 不重试，5xx/429 指数退避最多 3 次
- ✅ 结构化 JSON 日志 + API Key 自动脱敏 + trace_id 串联 + X-Request-Id 输入校验
- ✅ 滑动窗口进程内限流，可平滑替换为 Redis
- ✅ TypeScript `noUncheckedIndexedAccess` 全开；SSE/WS 事件全部 discriminated union
- ✅ CORS 严格策略：prod 通配 origin + credentials 启动即拒绝
- ✅ 错误响应统一 envelope（`{error:{code,message,trace_id}}`），HTTPException 与 StarletteException 共用同一 handler

详见 [SECURITY.md](./SECURITY.md) 与 [docs/spec/ARCHITECTURE.md §5](./docs/spec/ARCHITECTURE.md)。

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+

### 1. 克隆

```bash
git clone https://gitlab.com/daftpunkwav/interview-os.git
cd interview-os
```

> 默认分支追踪 `gitlab/main`，主开发在 GitLab；其余镜像同步：
> - GitHub：`https://github.com/daftpunkwav/interview-os.git`
> - Gitee：`https://gitee.com/daftpunkwav/interview-os.git`

### 2. 后端

```bash
cd backend

# 创建虚拟环境
python -m venv .venv

# 激活（Windows）
.venv\Scripts\activate
# 激活（macOS/Linux）
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 启动（无参入口自动读取 .env 的 HOST / PORT）
python -m app.main
```

> ⚠️ `HOST` 默认 `127.0.0.1`（仅本机可访问）。若在 `.env` 设为 `HOST=0.0.0.0`，后端会暴露到局域网；本项目本地优先、无登录鉴权，局域网暴露时请配合防火墙或反向代理。
>
> 推荐 **生产环境** 显式设置 `INTERVIEWOS_SECRET_KEY` 给 API Key 加解密用。

### 3. 前端

```bash
cd frontend
cp .env.example .env.local   # 可选；生产环境需设置 NEXT_PUBLIC_API_BASE 等
npm install
npm run dev
```

打开 [http://localhost:8080](http://localhost:8080)。
API 文档: [http://localhost:8081/docs](http://localhost:8081/docs)。

### 端口约定与占用策略

| 服务 | 默认端口 | 说明 |
|---|---|---|
| 前端（Next.js） | 8080 | 端口被占时需自行确认占用者（见下） |
| 后端（FastAPI） | 8081 | 同上；API 文档（Swagger）随后端提供：`/docs` |

**显式指定端口**（覆盖默认值）：

```bash
# 后端：PORT 环境变量覆盖 .env 的默认值（实测有效）
PORT=8091 python -m app.main

# 前端：--port 后出现者覆盖（实测有效）
npm run dev -- --port 8090
```

> 端口被占时不会自动换端口，请先确认占用者再释放或换端口（Windows：`netstat -ano | findstr :8080` → `taskkill /PID <PID> /F`；macOS/Linux：`lsof -i:8080` → `kill -9 <PID>`）。前端 `NEXT_PUBLIC_API_BASE`、`NEXT_PUBLIC_WS_URL` 等若未显式注入，将使用 `.env.local` 中的配置指向后端端口；使用非默认后端端口时需同步修改前端 env。API 文档随后端端口：`http://localhost:<后端端口>/docs`。

## BYOK 配置

在「设置」页分别配置三个处理器，或用 `backend/.env` 提供思考 LLM 的默认回退：

| 阶段 | 说明 | 凭证 |
|------|------|------|
| 语音识别 | 云端 ASR 或本地 Whisper；思考 LLM 的 Key **不得**用作 ASR Key | 设置页 ASR 字段 / 独立供应商 Key |
| 面试思考 | 必须是文本 LLM（OpenAI 兼容） | `LLM_API_*` 或设置页思考区 |
| 语音输出 | Edge TTS（默认）/ 其他云端 TTS / 仅字幕 | 设置页播报区；同供应商时可单独填写或复用已配置的 TTS Key |

```env
LLM_API_BASE=https://api.openai.com/v1
LLM_API_KEY=sk-your-real-key-here
LLM_MODEL=gpt-4o
LLM_MAX_TOKENS=4096
LLM_CONTEXT_WINDOW=128000

# 仅作本地 ASR / Edge 音色回退；正式指派请在设置页配置
WHISPER_MODEL=base
TTS_VOICE=zh-CN-XiaoxiaoNeural
SILENCE_NUDGE_SECONDS=25

# GitHub 核验（可选 PAT）
# GITHUB_TOKEN=ghp_xxxx
INTERVIEW_TOOLS_ENABLED=true
INTERVIEW_MAX_TOOL_ROUNDS=3
```

每阶段旁有「测试」按钮：`POST /api/v1/settings/test/{recognize|reason|speak}`（识别用仓库内标准 wav fixture）。

全部环境变量见 [`backend/.env.example`](./backend/.env.example)。

## 项目结构

```
InterviewOS/
├── backend/                                 # FastAPI 后端
│   ├── app/
│   │   ├── api/                             # REST 路由（v1/ 实时）
│   │   │   └── v1/                          # api/v1/* 聚合 + 准备 API + WS 路由
│   │   ├── core/                            # 安全/日志/限流/迁移/加密/prompts/constants
│   │   ├── models/                          # SQLAlchemy 数据模型
│   │   ├── schemas/                         # Pydantic v2 类型
│   │   ├── services/
│   │   │   ├── llm/                         # BYOK LLM 客户端（chat/chat_stream/embed/test）
│   │   │   ├── interview/                   # runner / agent / followup / workflows / tools / events
│   │   │   ├── rag/                         # RAGBackend 抽象 + local/stepfun/none 三后端 + 公司知识数据层
│   │   │   ├── github/                      # GitHub REST 客户端 + function tools（MCP 语义）
│   │   │   ├── growth/                      # 候选人 GrowthRecord（API）+ 系统 system_learning.json
│   │   │   ├── company/                     # 内置企业知识（7 家）
│   │   │   ├── context/                     # 上下文压缩与 token 估算（30% 阈值）
│   │   │   ├── resume/                      # 简历解析（PDF/DOCX/MD/TXT 魔数嗅探）
│   │   │   ├── search/                      # DuckDuckGo 搜索（Prep Agent 用）
│   │   │   ├── stt/                         # ASR 适配：openai_compat / 国内厂商 / local Whisper
│   │   │   ├── tts/                         # Edge TTS + MiniMax Speech（T2A）
│   │   │   └── voice/                       # 三处理器目录、凭证装配、连通性测试
│   │   ├── realtime/                        # WebSocket handler + 事件协议
│   │   ├── agents/                          # orchestrator / vision / prep
│   │   ├── data/                            # 运行时数据（忽略）+ 入库 STT fixtures（stt_fixtures/）
│   │   └── main.py                          # FastAPI 入口
│   ├── tests/                               # pytest 用例（详见 § 开发）
│   └── requirements.txt
├── frontend/                                # Next.js 前端
│   └── src/
│       ├── app/                             # 页面（error.tsx / not-found.tsx / loading.tsx 在根；无 api/ 路由，REST/SSE 全直连后端）
│       ├── components/                      # 共享组件（Toast/LoadError/MarkdownContent/effects/...）
│       ├── features/                        # avatar / media（WS Hook、TTS、录音）
│       ├── lib/                             # api.ts / env.ts / utils.ts / thinkStream.ts
│       └── types/                           # 全局强类型契约（与后端协议一一对应）
├── docs/                                    # 文档（spec 技术规约 / product 产品 / review 审查 / history 归档）
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

## 用户流程

1. **配置三处理器** → 设置：识别 ASR + 思考 LLM + 播报 TTS，分别点「测试」
2. **填写档案** → 完善岗位、学校、目标公司等
3. **上传简历** → AI 自动解析职业档案 → 评分 + 预测问题
4. **开始模拟面试**：
   - 选择岗位、职级、目标公司、面试官风格
   - 视频/语音/手动三种方式回答（麦克风 → ASR → 思考 → TTS）
   - 静默自动追问；可打断播报
   - 多阶段流转（身份确认 → 自我介绍 → 项目 → 技术 → 系统设计 → 反问 → 总结）
5. **查看报告** → 流式生成 → 雷达图多维评分 → 训练计划
6. **追踪成长** → 弱项聚合 → 下次训练方向

## 开发

- 后端测试：`cd backend && python -m pytest -q`（30+ 个 `test_*.py` + conftest/fakes；具体数字以 `pytest --collect-only` 为准）
- 前端类型检查：`cd frontend && npx tsc --noEmit`
- 启动前端：`npm run dev`
- 启动后端：`uvicorn app.main:app --reload`

### 主要文档

- [docs/spec/ARCHITECTURE.md](./docs/spec/ARCHITECTURE.md) — 架构图、模块边界、扩展点
- [docs/spec/API.md](./docs/spec/API.md) — REST / WebSocket / SSE 完整规约
- [PROJECT_REPORT.md](./PROJECT_REPORT.md) — 项目状态报告（已实现/部分实现/明确未做）
- [InterviewOS.md](./InterviewOS.md) — 权威设想 + 产品决策 + 实现状态注脚
- [SECURITY.md](./SECURITY.md) — 威胁模型、缓解清单、报告渠道
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 仓库约定、提交规范
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更

## License

MIT
