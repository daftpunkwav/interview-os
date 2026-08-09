---
type: overview
title: InterviewOS 代码 Wiki
description: InterviewOS 代码库入口：本地优先、BYOK 的 AI 模拟面试 Agent 平台，帮助开发者和 Agent 理解系统结构与变更路径。
tags: [interviewos, overview, wiki]
---

# InterviewOS 代码 Wiki

InterviewOS 是一个本地优先、自带 API Key（BYOK）的 AI 智能模拟面试 Agent 平台。该 Wiki 面向需要理解、修改或扩展本仓库的人类与编码 Agent，提供从架构到入口文件、测试路径、扩展缝隙的完整索引。

## 仓库结构速览

| 目录 | 角色 | 必读入口 |
|---|---|---|
| `/backend` | FastAPI + SQLAlchemy + SQLite 后端 | [`app/main.py`](./backend/main.md) |
| `/frontend` | Next.js 15 + React 19 + TypeScript 严格模式 | [`src/app/layout.tsx`](./frontend/overview.md) |
| `/docs` | 架构、API、PRD、评审历史 | `ARCHITECTURE.md` / `API.md` |
| `/test` | 集成/会话级 pytest 测试 | [`backend/integration-tests.md`](./backend/integration-tests.md) |
| `/backend/tests` | 单元/组件 pytest 测试 | [`backend/testing.md`](./backend/testing.md) |
| `/openwiki` | 本 Wiki | 本页 |

## 核心概念与对应页面

- **BYOK 三处理器**：识别（ASR）→ 思考（文本 LLM）→ 播报（TTS）。配置入口、凭证装配、连通性测试见 [backend/api/settings.md](./backend/api/settings.md) 与 [backend/services/voice.md](./backend/services/voice.md)。
- **面试流程引擎**：状态机、工作流、追问、工具轮、报告生成见 [backend/services/interview/overview.md](./backend/services/interview/overview.md)。
- **实时 WebSocket 管道**：心跳、单连接互斥、话轮控制、TTS 队列见 [backend/realtime/overview.md](./backend/realtime/overview.md)。
- **前端媒体管道**：录音、VAD、WebSocket、TTS 播放、头像唇形同步见 [frontend/media-pipeline.md](./frontend/media-pipeline.md)。
- **安全模型**：API Key 静态加密、SSRF/DNS 绑定、文件上传、CORS、限流、错误信封见 [security.md](./security.md)。

## 快速导航：从意图到页面

| 变更意图 | 相关页面 | 入口文件/符号 | 聚焦测试 | 最小验证 |
|---|---|---|---|---|
| 新增 ASR/TTS 供应商 | [backend/services/stt.md](./backend/services/stt.md), [backend/services/tts.md](./backend/services/tts.md), [backend/services/voice.md](./backend/services/voice.md) | `app/services/stt/*.py`, `app/services/tts/*.py`, `app/services/voice/catalog.py` | `test_cloud_stt.py`, `test_tts_queue.py` | `pytest tests/test_cloud_stt.py -q` |
| 新增面试阶段/工作流 | [backend/services/interview/workflows.md](./backend/services/interview/workflows.md), [backend/constants.md](./backend/constants.md) | `app/services/interview/workflows.py`, `app/core/constants.py` | `test_phase_ssot.py` | `pytest tests/test_phase_ssot.py -q` |
| 新增 GitHub/外部核验工具 | [backend/services/interview/tools.md](./backend/services/interview/tools.md), [backend/services/github.md](./backend/services/github.md) | `app/services/github/tools.py`, `app/services/interview/tools.py` | `test_github_tools.py` | `pytest tests/test_github_tools.py -q` |
| 新增 RAG 后端/企业 KB | [backend/services/rag/overview.md](./backend/services/rag/overview.md) | `app/services/rag/base.py`, `factory.py`, `local_backend.py`, `stepfun_backend.py` | `test_rag_backends.py`, `test_rag.py` | `pytest tests/test_rag_backends.py -q` |
| 修改前端协议/事件 | [frontend/api-client.md](./frontend/api-client.md), [backend/constants.md](./backend/constants.md) | `frontend/src/types/index.ts`, `app/core/constants.py` | `test_api_v1_paths.py` | `npx tsc --noEmit` + `pytest tests/test_api_v1_paths.py` |
| 修改安全策略（CORS/SSRF/限流） | [security.md](./security.md), [backend/core/security.md](./backend/core/security.md), [backend/core/ratelimit.md](./backend/core/ratelimit.md) | `app/core/security.py`, `app/core/ratelimit.py` | `test_security.py`, `test_session_rate_limit.py`（根 `/test/`） | `pytest tests/test_security.py -q && pytest ../test/test_session_rate_limit.py -q` |
| 修改数据库模型/Schema | [backend/models.md](./backend/models.md), [backend/schemas.md](./backend/schemas.md), [backend/core/migrate.md](./backend/core/migrate.md) | `app/models/__init__.py`, `app/schemas/__init__.py`, `app/core/migrate.py` | `test_migrate.py` | `pytest tests/test_migrate.py -q` |
| 修改 WebSocket 话轮/心跳/互斥 | [backend/realtime/overview.md](./backend/realtime/overview.md) | `app/realtime/ws_handler.py`, `connection_lifecycle.py`, `turn_coordinator.py` | `test_ws_handler.py`, `test_ws_hardening.py`, `test_session_ws_mutex.py` | `pytest tests/test_ws_handler.py tests/test_ws_hardening.py -q` |
| 新增/修改前端页面 | [frontend/overview.md](./frontend/overview.md), [frontend/layout.md](./frontend/layout.md) | `frontend/src/app/<route>/page.tsx`, `src/config/nav.ts`, `src/lib/api.ts` | `vitest` | `npx tsc --noEmit` |

## 实现状态注脚（来自权威设想）

| 功能 | 状态 | 说明 |
|---|---|---|
| 候选人成长 / 系统学习记录 | ✅ 已落地 | 记录 + 展示；自动反哺 prompt 尚未实现 |
| GitHub REST 工具层 | ✅ 已落地 | 语义对齐 MCP，但非官方 stdio/HTTP MCP 传输 |
| RAG 企业知识 | ✅ 已落地 | 内置 7 家企业；local/StepFun/none 三后端 |
| 三处理器语音管道 | ✅ 已落地 | ASR + LLM + TTS，本地 Whisper 回退 |
| 多用户/登录/注册 | ❌ 未实现 | 本地单机，`profile_id=1` |
| 等待叫号/候考大厅 | ❌ 未实现 | 创建会话即可开始 |
| 面经众包上传 | ❌ 未实现 | 仅有 DuckDuckGo 搜索 |
| 40–60 分钟实战压测 | ❌ 未做 | 机制具备，待真实 LLM 长测 |

完整实现清单与路线图见仓库 `InterviewOS.md`、`PROJECT_REPORT.md`、`DEVELOPMENT_PROGRESS.md`。

## 常用验证命令

```bash
# 后端
python -m pytest -q                          # 全部后端单元测试
python -m pytest tests/test_<area>.py -q     # 定向测试

# 前端
cd frontend
npx tsc --noEmit
npm test

# 端到端（可选）
python -m pytest ../test/ -q                 # 集成会话测试
```

## 阅读顺序建议

1. 先读 [architecture/overview.md](./architecture/overview.md) 了解分层与数据流。
2. 按兴趣读 [backend/services/interview/overview.md](./backend/services/interview/overview.md) 或 [frontend/media-pipeline.md](./frontend/media-pipeline.md)。
3. 准备改代码时，查阅上方任务路由表，定位到对应概念页与测试。
