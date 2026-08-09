---
type: backend
title: 集成/会话测试（根 test 目录）
description: /test/ 目录中以端到端会话为中心的回归测试：认证、音频缓冲、HTTP 面试、限流、报告流、TTS flush、WS 互斥。
tags: [testing, integration, session, regression, end-to-end]
---

# 集成/会话测试（根 test 目录）

`/test/` 目录存放更高层次的端到端/会话级回归测试，与 `backend/tests/` 的单测形成互补。

## 配置

- `test/conftest.py`：共享 fixtures，通常启动完整 FastAPI TestClient 或 WebSocket 客户端
- `test/pytest.ini`：指定测试路径与标记

## 测试文件

| 文件 | 覆盖 |
|---|---|
| `test_session_auth_and_audio_buffer.py` | 会话认证与音频缓冲大小限制 |
| `test_session_frontend_source.py` | 前端来源校验、CSRF 相关场景 |
| `test_session_http_interview.py` | HTTP 面试接口完整流程 |
| `test_session_rate_limit.py` | 会话级限流 |
| `test_session_report_stream.py` | 报告 SSE 流式生成端到端 |
| `test_session_settings_and_growth.py` | 设置保存与成长记录写入 |
| `test_session_ssrf_pin.py` | SSRF 与 DNS pin 端到端 |
| `test_session_tts_flush.py` | TTS 队列 flush 边界 |
| `test_session_ws_mutex.py` | WebSocket 单连接互斥 |

## 运行方式

```bash
cd backend
python -m pytest ../test -q
```

或从仓库根：

```bash
python -m pytest test backend/tests -q
```

## 与 backend/tests 的关系

- `backend/tests/`：聚焦单元/模块级行为，依赖注入和 FakeLLMClient。
- `/test/`：聚焦会话级端到端行为，使用 TestClient / 真实 WebSocket 连接（但 LLM 仍应被 mock）。

## 相关页面

- [后端测试体系](./testing.md)
- [开发指南](../development.md)
