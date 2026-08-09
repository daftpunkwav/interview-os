---
type: backend
title: 语音管道（STT/TTS 队列）
description: app/realtime/voice_pipeline.py 中 STT 选择、句子级 TTS 队列、音频缓冲、回声抑制与文本归一化。
tags: [realtime, stt, tts, voice-pipeline, audio-buffer]
---

# 语音管道（STT/TTS 队列）

`VoicePipelineMixin` 管理 WebSocket 面试中的语音数据：STT 选择/转写、句子级 TTS 队列、音频缓冲、回声检测。

## 关键符号

- `_pick_stt_text(results)`：从多个 STT 结果中选择最佳文本
- `_should_skip_whisper(text)`：判断是否跳过本地 Whisper 回退
- `_is_echo_of_assistant(text, last_assistant)`：检测用户是否重复播报内容
- `_normalize_echo_text(text)`：用于回声检测的文本归一化
- `_latin_letter_ratio(text)`：判断拉丁字符比例，用于语言选择
- `_SentenceTTSQueue`：句子级 TTS 队列
- `audio_buffer`, `_audio_buffer_bytes`：累积音频缓冲

## STT 选择

`user_turn_end` 到达时：

1. 根据 `LLMSettings.speech_recognize_handler` 选择 STT 适配器（见 [STT 服务](../services/stt.md)）。
2. 调用 `transcribe_with_handler(pcm_b64, sample_rate=16000, creds=..., fallback_local=True)`。
3. 如果厂商状态为 `coming_soon` 或 `native_audio` 未接通，或调用无结果，自动回退到本地 Whisper。
4. 使用 `_pick_stt_text` 在浏览器 `stt_text`（如有）与 ASR 结果中选择最佳文本；`_should_skip_whisper` 判断某些情况下可跳过本地 Whisper。
5. 对结果做回声检测，如检测到是 AI 播报的回声，则丢弃或提示。

## 音频缓冲限制

- 最大 5 MB（`AUDIO_BUFFER_MAX_BYTES`）。
- 超过时发送 `error` 事件并清空缓冲。
- 每段音频为 base64 编码的 16 kHz PCM Int16。
- 缓冲按 running byte total 累计，避免逐段单独计算。

## 回声抑制

`_is_echo_of_assistant(text, last_assistant)` 比较 STT 文本与最近一次 AI 完整回复的归一化版本：

- 调用 `_normalize_echo_text` 去除标点、空格、统一大小写。
- 计算相似度（如子串/包含关系）。
- 高相似度视为回声，不作为用户输入处理（避免 TTS 播放被再次识别）。

`_should_skip_whisper(text)` 在识别结果已确定来自用户时跳过本地 Whisper 回退，减少延迟。
## 句子级 TTS 队列

`_SentenceTTSQueue`：

- 维护待合成的句子队列
- 限制最大长度（`TTS_QUEUE_MAX_SIZE`）
- 异步消费：每句调用 `synthesize_speech`
- 提供当前队列长度、是否空闲等状态

## 语言比例

`_latin_letter_ratio` 用于前端选择 `zh-CN` 或 `en-US` 的浏览器语音识别语言；后端也用它辅助判断 Whisper 语言参数。

## 聚焦测试

- `tests/test_ws_handler.py`：STT 路径与回声。
- `tests/test_voice_pipeline.py`：STT 选择、TTS 队列、回声检测。
- `tests/test_cloud_stt.py`：各厂商 STT 适配。
- `tests/test_session_tts_flush.py`：队列 flush 边界。

## 相关页面

- [STT 服务](../services/stt.md)
- [TTS 服务](../services/tts.md)
- [Voice 目录](../services/voice.md)
- [流式处理](./turn-streaming.md)
- [前端 useAudioRecorder](../../frontend/media-pipeline.md)
