# InterviewOS

> AI 智能模拟面试 Agent 平台 — 开源、本地优先、BYOK

InterviewOS 是一个基于 AI Agent 的真实面试模拟系统。上传简历后，系统根据岗位、目标公司和面试风格，
自动生成专属面试流程，通过动态追问、企业风格模拟和视频交互，让你体验接近真实的企业面试。

## 核心特性

- **BYOK** — 自带 API Key，支持 OpenAI 兼容接口（OpenAI、StepFun、DeepSeek、OpenRouter、Claude via proxy 等）
- **简历智能解析** — 上传 PDF/Word/Markdown，AI 自动提取职业档案；并对简历做评分与预测问题
- **企业风格模拟** — 内置字节、腾讯、阿里、美团、米哈游、OpenAI、Google 等面试模型
- **多 Workflow** — 技术面 / HR 面 / 管理岗，完整阶段流转
- **实时交互** — 摄像头 + 麦克风（语音输入/朗读）+ 流式 LLM/Edge-TTS
- **动态追问** — 基于简历和回答实时生成问题，主动深挖模糊点（结构化追问信号分析）
- **企业知识库 RAG** — 检索式增强生成，引入公司风格、面试偏好知识库
- **面试报告** — 多维度评分、改进建议、训练计划
- **成长追踪** — 记录薄弱项，持续优化训练方向
- **本地优先** — SQLite + Chroma 本地落盘，无需注册登录，数据完全本地

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.11+ · FastAPI · SQLAlchemy 2.0 · SQLite · ChromaDB · Pydantic v2 |
| 前端 | Next.js 15 · React 19 · TypeScript strict · Tailwind CSS · framer-motion |
| AI | OpenAI Chat Completions 兼容 API |
| 语音 | Edge TTS · faster-whisper |
| 测试 | pytest / pytest-asyncio |

## 安全 & 工程

- ✅ API Key at-rest 加密（HMAC + XOR 流，纯标准库；可平滑迁移到 AES-GCM）
- ✅ SSRF 防御：`api_base` 入参禁止 loopback/私网（dev 模式除外）
- ✅ 文件上传：10 MB 流式上限 + 魔数嗅探 + 路径越界校验
- ✅ 结构化 JSON 日志 + API Key 自动脱敏 + trace_id 串联
- ✅ 滑动窗口进程内限流，可平滑替换为 Redis
- ✅ TypeScript `noUncheckedIndexedAccess` 全开；SSE/WS 事件全部 discriminated union

详见 [SECURITY.md](./SECURITY.md) 与 [docs/ARCHITECTURE.md §5](./docs/ARCHITECTURE.md)。

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+

### 1. 克隆

```bash
git clone https://github.com/daftpunkwav/interview-os.git
cd interview-os
```

> 国内可换 `https://gitee.com/daftpunkwav/interview-os.git` 或 `https://gitlab.com/daftpunkwav/interview-os.git`。

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

# 启动
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> 推荐 **生产环境** 显式设置 `INTERVIEWOS_SECRET_KEY` 给 API Key 加解密用。

### 3. 前端

```bash
cd frontend
cp .env.example .env.local   # 可选；生产环境需设置 NEXT_PUBLIC_API_BASE 等
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### 一键启动（Windows）

```powershell
.\scripts\start.ps1
```

## BYOK 配置

在「设置」页面或 `backend/.env` 中配置：

```env
LLM_API_BASE=https://api.stepfun.com/step_plan/v1
LLM_API_KEY=sk-your-real-key-here
LLM_MODEL=step-3.7-flash
LLM_MAX_TOKENS=4096
LLM_CONTEXT_WINDOW=256000

# 可选
WHISPER_MODEL=base
TTS_VOICE=zh-CN-XiaoxiaoNeural
SILENCE_NUDGE_SECONDS=10
```

全部环境变量见 [`backend/.env.example`](./backend/.env.example)。

## 项目结构

```
InterviewOS/
├── backend/                                 # FastAPI 后端
│   ├── app/
│   │   ├── api/                             # REST 路由（含 v1/ 实时）
│   │   ├── core/                            # 安全/日志/限流/迁移/加密
│   │   ├── models/                          # SQLAlchemy 数据模型
│   │   ├── schemas/                         # Pydantic v2 类型
│   │   ├── services/
│   │   │   ├── llm/                         # BYOK LLM 客户端
│   │   │   ├── interview/                   # runner / agent / followup / workflows
│   │   │   ├── rag/                         # Chroma RAG
│   │   │   ├── company/                     # 企业知识
│   │   │   ├── context/                     # 上下文压缩
│   │   │   ├── resume/                      # 简历解析
│   │   │   ├── search/                      # 准备 Agent 联网
│   │   │   ├── stt/                         # Whisper
│   │   │   └── tts/                         # Edge TTS
│   │   ├── realtime/                        # WebSocket 协议 + handler
│   │   ├── agents/                          # orchestrator / vision / prep
│   │   └── main.py                          # FastAPI 入口
│   ├── tests/                               # pytest 用例（48 通过）
│   └── requirements.txt
├── frontend/                                # Next.js 前端
│   └── src/
│       ├── app/                             # 页面（error.tsx / not-found.tsx / loading.tsx 在根）
│       ├── components/                      # 共享组件（含 Toast / LoadError）
│       ├── features/                        # avatar / media（WS Hook、TTS、录音）
│       ├── lib/                             # api.ts / env.ts / utils.ts
│       ├── types/                           # 全局强类型契约（与后端协议一一对应）
│       └── ...
├── docs/                                    # 架构 + API 文档
├── scripts/                                 # 启动脚本
├── .env.example                             # 根：指向 backend/.env.example
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

## 用户流程

1. **配置 BYOK** API Key → 设置 → 测试联通
2. **填写档案** → 完善岗位、学校、目标公司等
3. **上传简历** → AI 自动解析职业档案 → 评分 + 预测问题
4. **开始模拟面试**：
   - 选择岗位、职级、目标公司、面试官风格
   - 视频/语音/手动三种方式回答
   - 10 秒静默自动追问
   - 多阶段流转（身份确认 → 自我介绍 → 项目 → 技术 → 系统设计 → 反问 → 总结）
5. **查看报告** → 流式生成 → 雷达图多维评分 → 训练计划
6. **追踪成长** → 弱项聚合 → 下次训练方向

## 开发

- 后端测试：`cd backend && ./.venv/Scripts/python.exe -m pytest -q`
- 前端类型检查：`cd frontend && npx tsc --noEmit`
- 启动前端：`npm run dev`
- 启动后端：`uvicorn app.main:app --reload`

### 主要文档

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架构图、模块边界、扩展点
- [docs/API.md](./docs/API.md) — REST / WebSocket / SSE 完整规约
- [SECURITY.md](./SECURITY.md) — 威胁模型、缓解清单、报告渠道
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 仓库约定、提交规范
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更

## License

MIT
