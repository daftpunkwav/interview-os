---
type: backend
title: 语音识别（STT）适配层
description: app/services/stt/* 中多厂商 ASR 适配器、本地 Whisper 回退与 transcribe_utterance 统一入口。
tags: [stt, asr, speech-recognition, adapter, whisper]
---

# 语音识别（STT）适配层

STT 模块实现面试第一阶段：把音频（PCM base64）或字节流转换为文本。支持云端 ASR 多厂商和本地 faster-whisper 回退。

## 文件结构

| 文件 | 职责 |
|---|---|
| `__init__.py` | 统一入口 `transcribe_utterance`、异常类型、`SttCredentials`、`SttResult` |
| `base.py` | 基础适配器接口 |
| `router.py` | 按 `provider` 分发到具体适配器 |
| `cloud.py` | 通用云端 REST 适配器基类 |
| `openai_compat.py` | OpenAI 兼容 `/audio/transcriptions` |
| `aliyun.py` | 阿里云 ASR |
| `baidu.py` | 百度智能云 ASR |
| `tencent.py` | 腾讯云 ASR |
| `volcengine.py` | 火山引擎 ASR |
| `xfyun.py` | 讯飞 ASR |
| `whisper.py` | 本地 faster-whisper 封装 |
| `local.py` | 本地模式入口/默认回退 |

## 统一入口

`app/services/stt/__init__.py` 提供两层 API，最终都委托 `router.py` 的 `transcribe_with_handler`：

```python
transcribe_utterance(pcm_b64, *, sample_rate=16000, model="whisper-1",
                     api_base="", api_key="", prefer_cloud=True, creds=None) -> str
    # 兼容旧调用，返回纯文本

transcribe_utterance_result(...) -> SttResult
    # 返回含 provider / fallback / requested_provider 元数据的结构化结果（realtime 层使用）

transcribe_with_handler(pcm_b64, *, sample_rate, creds: SttCredentials,
                        fallback_local=True) -> SttResult
    # router.py 的分发入口
```

`__init__.py` 还导出 `warmup_whisper`（WS 启动预热本地模型）、`LOCAL_WHISPER_SIZES`、`is_local_stt_model`、`resolve_cloud_stt_model`。

`router.py` 按 `creds.provider` 分发：

1. 检查 `voice.catalog.find_provider` 元数据：
   - `status == "coming_soon"` → 回退本地 Whisper。
   - `recognize_via == "native_audio"` 且未 ready → 回退本地 Whisper。
2. 在 `_PROVIDERS` 映射中查找实现；未知 → 回退本地 Whisper。
3. 调用 `impl.transcribe(...)`。
4. 如果无结果且 `fallback_local=True`，再次调用本地 Whisper。
5. 返回 `SttResult(text, provider, fallback, requested_provider)`。

## 安全

- 云端 `api_base` 必须经过 `is_safe_http_url` SSRF 校验。
- 思考 LLM 的 Key **不会** 静默充当 ASR Key（除非用户明确配置复用）。

## 聚焦测试

- `tests/test_cloud_stt.py`：各厂商适配器签名与基础流程。
- `tests/test_voice_pipeline.py`：STT 与 TTS 在语音管道中的集成。
- `tests/test_session_tts_flush.py`：TTS  flush 边界。

## 扩展新厂商

1. 在 `app/services/stt/` 新增适配器文件。
2. 在 `router.py` 注册分发分支。
3. 在 `app/services/voice/catalog.py` 添加能力标签。
4. 在 `app/services/voice/credentials.py` 处理凭证字段。
5. 在 `tests/test_cloud_stt.py` 补充基础用例。

## 相关页面

- [TTS 适配](./tts.md)
- [Voice 目录与测试](./voice.md)
- [实时语音管道](../realtime/voice-pipeline.md)
- [前端 useAudioRecorder](../../frontend/media-pipeline.md)
