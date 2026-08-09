---
type: backend
title: 三处理器 Voice 目录与测试
description: app/services/voice/* 中 ASR/LLM/TTS 能力标签、凭证装配与 recognize/reason/speak 阶段连通性测试。
tags: [voice, three-stage, asr, llm, tts, credentials, catalog]
---

# 三处理器 Voice 目录与测试

`app/services/voice/` 是面试「三处理器」配置与测试的中心：识别（ASR）、思考（LLM）、播报（TTS）。

## 文件结构

| 文件 | 职责 |
|---|---|
| `catalog.py` | 定义 ASR/LLM/TTS 供应商能力标签，返回 `/api/v1/settings/catalog` 的数据 |
| `credentials.py` | 根据 `LLMSettings` 装配 `SttCredentials`、`LLMClient` 参数、`TtsCredentials` |
| `stage_tests.py` | 实现 `test_recognize`, `test_reason`, `test_speak` 三个阶段的连通性测试 |

## 能力目录

`/api/v1/settings/catalog` 返回：

```json
{
  "reasoning": [...],   // 文本 LLM 供应商
  "recognize": [...],  // ASR 供应商
  "speak": [...]       // TTS 供应商
}
```

每个供应商条目包含：id、name、描述、所需字段、可选能力标签（如 `supports_stream`, `supports_vision`）。前端设置页根据此目录动态渲染表单字段。

## 凭证装配

`credentials.py` 从 `LLMSettings` 中解密/读取对应阶段的字段：

- ASR：`speech_recognize_handler`, `asr_api_*`, `asr_app_*` 等
- LLM：`api_base`, `api_key`, `model`, `provider` 等
- TTS：`speech_speak_handler`, `tts_api_*`, `tts_voice` 等

## 阶段测试

- `test_recognize`：使用仓库内标准 wav fixture 调用 `transcribe_utterance`。
- `test_reason`：发送短文本到 LLM，验证响应。
- `test_speak`：生成短音频并返回 base64。

测试结果封装为 `LLMTestResponse`：success, message, model, transcript, audio_base64, fallback。

## 扩展新供应商

1. 在 STT/TTS/LLM 模块中实现适配器。
2. 在 `catalog.py` 添加能力标签与所需字段。
3. 在 `credentials.py` 处理凭证装配。
4. 在 `stage_tests.py` 补充测试路径（如需要）。
5. 前端 `src/config/providers.ts` 可选添加 UI 预设。

## 相关页面

- [STT 适配](./stt.md)
- [TTS 适配](./tts.md)
- [LLM 客户端](./llm-client.md)
- [API 设置端点](../api/settings.md)
- [前端设置页](../../frontend/pages/settings.md)
