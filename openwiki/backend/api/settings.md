---
type: backend
title: 设置端点
description: app/api/settings.py 中 BYOK 三处理器配置、供应商目录、阶段测试与密钥更新。
tags: [api, settings, byok, asr, tts, llm]
---

# 设置端点

## 路径

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/settings/catalog` | 三阶段供应商能力目录 |
| GET | `/api/v1/settings/llm` | 读取当前配置（密钥仅返回 has_* 布尔） |
| PUT | `/api/v1/settings/llm` | 更新配置，支持 `_SECRET_KEEP` 占位 |
| POST | `/api/v1/settings/llm/test` | 旧入口，等价于测试「思考」阶段 |
| POST | `/api/v1/settings/test/{stage}` | 测试 recognize/reason/speak 三阶段连通性 |

## 三阶段处理器

面试流程拆分为三个独立处理器，各自可配置不同供应商和 Key：

| 阶段 | 配置字段 | 说明 |
|---|---|---|
| recognize | `speech_recognize_handler`, `speech_recognize_mode`, `asr_api_*` | 语音识别，本地 Whisper 或云端 ASR |
| reason | `api_base`, `api_key`, `model`, `provider` | 文本 LLM 思考，必须走 Chat Completions |
| speak | `speech_speak_handler`, `speech_speak_mode`, `tts_api_*`, `tts_voice` | 语音输出，Edge TTS 或 MiniMax 等 |

## 密钥更新占位

`PUT` 请求中字段值 `"_SECRET_KEEP"` 表示该字段保持数据库原值不变，用于前端表单仅提交可见字段。

## 安全校验

- 所有 `api_base` 字段（LLM/ASR/TTS）必须通过 `is_safe_http_url` SSRF 校验，生产仅允许 https 公网。
- `_validate_assignments` 禁止将纯 ASR/TTS 供应商选作 reasoning 处理器。
- 更新端点依赖 `require_local_peer`（本地访问）和 `rate_limit_dep(key="llm", limit=10)`。

## 阶段测试

- recognize：使用仓库内标准 wav fixture（`backend/app/data/stt_fixtures/`）转写。
- reason：发送一条短文本到 LLM 验证响应。
- speak：生成一句短音频并返回 base64。

## 相关页面

- [LLM 客户端](../services/llm-client.md)
- [STT 适配](../services/stt.md)
- [TTS 适配](../services/tts.md)
- [Voice 目录与测试](../services/voice.md)
- [安全辅助](../core/security.md)
