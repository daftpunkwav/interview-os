---
type: backend
title: 回合协调器
description: app/realtime/turn_coordinator.py 中话轮锁、候选人回合入口，组合流式消费与打断/收尾副作用。
tags: [realtime, turn, coordinator, interview, stt, mutex]
---

# 回合协调器

`TurnCoordinatorMixin`（继承 `TurnStreamingMixin` + `TurnControlMixin`）是 WebSocket 面试中候选人回合的总入口：处理 `user_text`、`user_turn_end`、忙锁、音频缓冲、STT 选择、回声过滤，并调用 `_process_user_text` 进入 LLM 流式消费。

## 关键符号

- `_can_start_user_turn()` / `_begin_user_turn()` / `_end_user_turn(epoch)`：话轮锁与 epoch 绑定
- `_run_user_text(text, data)`：文本消息入口
- `_run_user_turn_end(data)`：音频结束入口
- `_on_user_turn_end(data, db, session)`：STT + 回声过滤 + 调用 `_process_user_text`
- `_open_mic_after_playback()` / `_wait_client_playback()`：等待客户端 TTS 播完再开麦，防回采
- `_AUDIO_BUFFER_MAX_BYTES = 5 * 1024 * 1024`
- `_IMAGE_BASE64_MAX_LEN = 300_000`（定义在 `turn_streaming.py`，但 re-export）

## 话轮锁（epoch-based）

- `_turn_busy` 表示是否有未完成的回合。
- `_busy_epoch = _stream_epoch` 在 `_begin_user_turn` 时绑定当前世代。
- 打断发生时 `_stream_epoch` 递增，`_can_start_user_turn()` 判定旧锁失效，允许新 `user_turn_end` 接棒。
- `_end_user_turn(epoch)` 仅在 epoch 仍匹配时释放 `_turn_busy`。

## user_text 流程

1. `_begin_user_turn()` 获取 epoch；若无法开始则忽略。
2. 加载 session。
3. `set_turn(PROCESSING)` → 发送 `stt_final`（文本即最终）→ `_process_user_text(text, data, db, session)`。
4. 异常时回退到 `USER_SPEAKING`。
5. `_end_user_turn(epoch)` 释放锁。

## user_turn_end 流程

1. 检查状态：处于 `PROCESSING` 或 `AI_SPEAKING` 时忽略（防止回采）。
2. 检查 PCM / audio_buffer 大小是否超过 5 MB，超过则报错并回退。
3. 调用 `transcribe_utterance_result(pcm_b64, sample_rate=..., creds=...)` 做 ASR（含本地 Whisper 回退）。
4. 使用 `_pick_stt_text(browser_text, asr_text)` 选择最终文本。
5. 与最近一条 assistant 消息做 `_is_echo_of_assistant` 回声检测；高度相似则丢弃并提示。
6. 发送 `stt_final`。
7. 调用 `_process_user_text(text, data, db, session)`。

## 防回采机制

- AI 播报期间拒绝 `user_turn_end`。
- 等待客户端 `tts_playback_done` 后再切回 `USER_SPEAKING`（`_open_mic_after_playback`）。
- 服务端回声检测兜底。

## 聚焦测试

- `tests/test_ws_handler.py`：事件顺序、忙锁、状态流转。
- `tests/test_ws_hardening.py`：并发、边界、回声。
- `tests/test_voice_pipeline.py`：STT 选择、回声检测。

## 相关页面

- [流式消费与 TTS 入队](./turn-streaming.md)
- [打断控制与收尾](./turn-control.md)
- [语音管道](./voice-pipeline.md)
- [InterviewRunner](../services/interview/runner.md)
