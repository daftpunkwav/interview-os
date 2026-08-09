---
type: 开发指南
title: 开发、测试与扩展指南
description: InterviewOS 环境搭建、运行方式、测试命令、扩展点与 CI 约定。
tags: [development, testing, setup, ci, contribution]
openwiki:
  roles: [delivery, repository]
  source_paths:
    - backend/requirements.txt
    - frontend/package.json
    - scripts/start.ps1
    - scripts/start.sh
  validation_commands:
    - cd backend && python -m pytest -q
    - cd frontend && npx tsc --noEmit
---

# 开发、测试与扩展指南

## 环境要求

- Python 3.11+
- Node.js 18+
- 可选：ffmpeg 等用于本地 Whisper 的依赖

## 后端启动

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # 编辑填入 LLM_API_KEY
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

生产环境必须显式设置 `INTERVIEWOS_SECRET_KEY`。

## 前端启动

```bash
cd frontend
cp .env.example .env.local    # 可选
npm install
npm run dev
```

访问 `http://localhost:3000`。

## 一键启动

```powershell
# Windows
.\scripts\start.ps1
```

```bash
# Linux/macOS
./scripts/start.sh
```

## 测试命令

```bash
# 后端全部单元测试
cd backend
python -m pytest -q

# 定向测试
python -m pytest tests/test_security.py -q
python -m pytest tests/test_runner.py -q
python -m pytest tests/test_ws_handler.py -q

# 根目录集成测试
python -m pytest ../test/ -q

# 前端类型检查
cd frontend
npx tsc --noEmit

# 前端测试
npm test
```

## 扩展路径

| 需求 | 必读页面 | 关键文件 |
|---|---|---|
| 新增 ASR/TTS 供应商 | [stt](./backend/services/stt.md), [tts](./backend/services/tts.md), [voice](./backend/services/voice.md) | `app/services/stt/*.py`, `app/services/tts/*.py`, `app/services/voice/catalog.py` |
| 新增面试工作流 | [workflows](./backend/services/interview/workflows.md), [constants](./backend/constants.md) | `app/services/interview/workflows.py`, `app/core/constants.py` |
| 新增 RAG 后端 | [rag/overview](./backend/services/rag/overview.md) | `app/services/rag/base.py`, `factory.py`, `local_backend.py`, `stepfun_backend.py` |
| 新增 GitHub/外部工具 | [github](./backend/services/github.md), [interview tools](./backend/services/interview/tools.md) | `app/services/github/tools.py`, `app/services/interview/tools.py` |
| 新增前端页面 | [frontend overview](./frontend/overview.md), [layout](./frontend/layout.md) | `frontend/src/app/<route>/page.tsx`, `src/config/nav.ts`, `src/lib/api.ts` |
| 新增前端事件类型 | [api-client](./frontend/api-client.md), [constants](./backend/constants.md) | `frontend/src/types/index.ts`, `app/core/constants.py` |

## 代码约定

- Python：ruff 目标 `py311`，行宽 100，规则集 `E/F`，忽略 `E501`。
- TypeScript：`noUncheckedIndexedAccess` 开启；SSE/WS 事件使用 discriminated union。
- 新代码应至少补充一个聚焦测试；与 LLM 交互必须使用 `FakeLLMClient`。
- 修改前后端共享常量时，提交一个原子 commit。

## 相关页面

- [快速开始](./quickstart.md)
- [安全模型](./security.md)
- [架构全景](./architecture/overview.md)
