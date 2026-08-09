---
type: backend
title: 语音合成（TTS）适配层
description: app/services/tts/* 中 Edge TTS 与 MiniMax Speech 适配器，synthesize_speech 统一入口与语音/语气选择。
tags: [tts, speech-synthesis, edge-tts, minimax, audio]
---

# 语音合成（TTS）适配层

TTS 模块实现面试第三阶段：把面试官文本转换为音频。支持 Edge TTS 本地离线播放与 MiniMax Speech 等云端 TTS。

## 文件结构

| 文件 | 职责 |
|---|---|
| `__init__.py` | 统一入口 `synthesize_speech`、`TtsCredentials`、异常类型 |
| `edge.py` | Edge TTS 离线合成，MP3 输出 |
| `minimax.py` | MiniMax Speech T2A 云端适配 |
| `voice_resolve.py` | 音色/语气选择、 prosody 解析、默认语音映射 |

## 统一入口

```python
synthesize_speech(text, credentials: TtsCredentials, prosody: VoiceProsody) -> bytes
```

`TtsCredentials` 包含：

- `handler`: `edge` 或 `minimax` 等
- `api_base`, `api_key`, `model` 等云端字段

`VoiceProsody` 描述语音与语气参数，如 `voice=zh-CN-XiaoxiaoNeural`、`rate`、`pitch`。

## Edge TTS（默认）

- 无需 API Key，使用微软 Edge 在线语音服务（通过 `edge-tts` 库）。
- 输出 MP3 字节流，由前端 `useTTSPlayer` base64 解码播放。
- 默认音色 `zh-CN-XiaoxiaoNeural`。

## MiniMax Speech

- 云端 TTS API，支持更自然的中文语音。
- 需要配置 `tts_api_key`、`tts_model` 等。
- 失败时前端可降级为字幕模式（关闭播报）。

## 音色选择

`voice_resolve.py` 根据配置、语言、场景选择最合适的音色。`/api/v1/options` 返回的 `tts_voices` 列表来自 `app/core/options_data.py` 和 `voice_resolve` 的默认映射。

## 安全

- 云端 `api_base` 经过 `is_safe_http_url` SSRF 校验。
- 与 ASR 一样，思考 LLM 的 Key 不会自动复用为 TTS Key。

## 聚焦测试

- `tests/test_tts_queue.py`：TTS 队列与分句。
- `tests/test_session_tts_flush.py`：TTS flush 与会话边界。
- `tests/test_voice_pipeline.py`：TTS 与 STT 集成。

## 扩展新 TTS 后端

1. 在 `app/services/tts/` 新增适配器文件。
2. 在 `__init__.py` 的 `synthesize_speech` 中分发。
3. 在 `app/services/voice/catalog.py` 添加 `speak` 能力标签。
4. 在 `voice_resolve.py` 补充音色映射。
5. 补充测试。

## 相关页面

- [STT 适配](./stt.md)
- [Voice 目录与测试](./voice.md)
- [实时语音管道](../realtime/voice-pipeline.md)
- [前端 useTTSPlayer](../../frontend/media-pipeline.md)
