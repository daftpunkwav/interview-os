---
type: backend
title: 后端测试体系
description: backend/tests/ 目录中的 pytest 测试布局、fixtures、fakes 与 FakeLLMClient 使用模式。
tags: [testing, pytest, fixtures, fakes, backend]
---

# 后端测试体系

`backend/tests/` 包含 29 个 `test_*.py` 文件，覆盖核心基础设施、面试流程、AI 适配器、RAG、安全与 WebSocket。

## 测试配置

- `pyproject.toml`：`testpaths = ["tests"]`，`asyncio_mode = "auto"`
- `tests/conftest.py`：共享 fixtures
- `tests/fakes.py`：`FakeLLMClient` 等测试替身

## 关键 Fixtures

| Fixture | 说明 |
|---|---|
| `engine` | 内存 SQLite 引擎（StaticPool） |
| `session_factory` | 绑定内存库的 SessionLocal |
| `db` | 每个测试的独立 Session |

## FakeLLMClient

`tests/fakes.py` 提供可编程的 LLM 客户端：

- 预设响应文本或 token 流
- 记录调用次数、传入 messages、tool_calls
- 支持模拟 tool_calls 循环
- 测试中通过 monkeypatch 或依赖注入替换真实 `LLMClient`

与 LLM 交互的测试必须使用 `FakeLLMClient`，避免真实 API 调用与费用。

## 测试分组

| 文件 | 覆盖 |
|---|---|
| `test_main.py` | CORS 严格策略、trace 中间件、错误信封 |
| `test_smoke.py` | health、LLM 设置 roundtrip |
| `test_security.py` / `test_security_extra.py` | SSRF、URL 固定、端口、DNS rebinding |
| `test_secrets.py` | AES-GCM 加密、legacy 格式 |
| `test_migrate.py` | 列迁移、Alembic 版本戳 |
| `test_session_auth_regression.py` | 能力令牌、Cookie/Header/query |
| `test_session_rate_limit.py` | 限流 |
| `test_runner.py` | 完整面试回合、工具循环、阶段切换、报告 |
| `test_followup.py` | 追问信号分类 |
| `test_agent_prompts.py` | system prompt 构建 |
| `test_phase_ssot.py` | 阶段元数据单一来源 |
| `test_rag.py` / `test_rag_backends.py` | RAG 接口与本地/StepFun 后端 |
| `test_context_compress.py` | 上下文压缩 |
| `test_llm_client_retry.py` | 重试策略 |
| `test_github_tools.py` | GitHub 工具执行 |
| `test_web_search.py` | 搜索工具 |
| `test_tts_queue.py` | TTS 队列 |
| `test_voice_pipeline.py` | STT/TTS 集成 |
| `test_ws_handler.py` | WebSocket 握手、事件、互踢 |
| `test_ws_hardening.py` | WS 边界、打断、心跳 |
| `test_report_stream.py` | 报告 SSE |
| `test_growth_learning.py` | 成长记录与系统学习 |

## 运行测试

```bash
cd backend
python -m pytest -q
python -m pytest tests/test_runner.py -q
python -m pytest tests/test_security.py -v
```

## 相关页面

- [集成测试](./integration-tests.md)
- [开发指南](../development.md)
