# InterviewOS

> AI 智能模拟面试 Agent 平台 — 开源、本地优先、BYOK

InterviewOS 是一个基于 AI Agent 的真实面试模拟系统。上传简历后，系统根据岗位、目标公司和面试风格，自动生成专属面试流程，通过动态追问、企业风格模拟和视频交互，让你体验接近真实的企业面试。

## 核心特性

- **BYOK** — 自带 API Key，支持 OpenAI 兼容接口（OpenAI、StepFun、DeepSeek、OpenRouter 等）
- **简历智能解析** — 上传 PDF/Word/Markdown，AI 自动提取职业档案
- **企业风格模拟** — 内置字节、腾讯、阿里、美团、米哈游、OpenAI、Google 等面试模型
- **多 Workflow** — 技术面 / HR 面 / 管理岗，完整阶段流转
- **动态追问** — 基于简历和回答实时生成问题，主动深挖模糊点
- **视频面试** — 摄像头 + 语音输入/朗读，面部分析辅助反馈
- **面试报告** — 多维度评分、改进建议、训练计划
- **成长追踪** — 记录薄弱项，持续优化训练方向
- **本地优先** — SQLite 存储，无需注册登录，数据完全本地

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.11+ · FastAPI · SQLAlchemy · SQLite |
| 前端 | Next.js 15 · React 19 · TypeScript · Tailwind CSS |
| AI | OpenAI Chat Completions 兼容 API |

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+

### 1. 克隆项目

```bash
git clone <repo-url>
cd InterviewOS
```

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

### 3. 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:3000

### 一键启动（Windows）

```powershell
.\scripts\start.ps1
```

## BYOK 配置

在「设置」页面或 `backend/.env` 中配置：

```env
LLM_API_BASE=https://api.stepfun.com/step_plan/v1
LLM_API_KEY=your-api-key
LLM_MODEL=your-model-name
LLM_MAX_TOKENS=4096
LLM_CONTEXT_WINDOW=256000
```

## 项目结构

```
InterviewOS/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── api/             # REST API 路由
│   │   ├── models/          # 数据模型
│   │   ├── schemas/         # Pydantic 模型
│   │   └── services/        # 业务逻辑
│   │       ├── llm/         # BYOK LLM 客户端
│   │       ├── interview/   # 面试 Agent
│   │       ├── resume/      # 简历解析
│   │       └── company/     # 企业知识库
│   └── requirements.txt
├── frontend/                # Next.js 前端
│   └── src/
│       ├── app/             # 页面路由
│       ├── components/      # UI 组件
│       └── lib/             # API 客户端
├── docs/                    # 文档
└── scripts/                 # 启动脚本
```

## 用户流程

1. 配置 BYOK API Key
2. 上传简历 → AI 解析职业档案
3. 选择岗位、职级、目标公司、面试官风格
4. 开始模拟面试（支持视频/语音）
5. AI 动态追问 → 反问环节 → 总结
6. 查看评估报告与成长记录

## License

MIT
