---
type: backend
title: 流式消费与 TTS 入队
description: app/realtime/turn_streaming.py 中消费 InterviewRunner 的 StreamEvent，按句入队 TTS，剥离 think 块，并处理打断 epoch。
tags: [realtime, streaming, tts, sentence-buffer, think-filter]
---

# 流式消费与 TTS 入队

`TurnStreamingMixin` 把 `InterviewRunner` 产生的 `StreamEvent` 翻译为 WebSocket 客户端事件，同时实时按句入队 TTS、剥离 `<think>` 块，并在候选人打断时安全退出。

## 关键符号

- `_consume_runner_opening(db)`：开场白流式消费
- `_consume_runner_turn(text, data, db)`：普通回合流式消费，注入 face/image
- `_stream_events_with_tts(events, db, session, auto_hint=True)`：主消费 + TTS 入队
- `_IMAGE_BASE64_MAX_LEN = 300_000`

## 图片大小限制

`user_turn_end` 或 `user_text` 中的 `image_base64` 若超过 300,000 字符，直接丢弃并记 warning，避免撑爆内存和 LLM 账单。

## 流式消费流程

1. 调用 `_begin_playback_wait()` 提升 `_playback_generation`，准备新的 TTS 队列。
2. 初始化 `sentence_buf` 和 `ThinkStreamFilter`。
3. 遍历 runner 流事件：
   - 若 `epoch != _stream_epoch`，说明已被打断，立即返回 `None`。
   - `TOKEN`：通过 `think_filter.feed` 剥离 think 块，可见文本发送 `assistant_token` 并追加到 `sentence_buf`。
   - `should_flush_sentence_buffer(sentence_buf, soft_min)` 达到句边界时，把 `sentence_buf` 入队 TTS。
   - `TURN_COMPLETE`：冲刷 think 剩余、发送 `assistant_done` 与 `phase_changed`，把剩余 `sentence_buf` 入队并 `flush_remainder`。
   - `ERROR`：发送 `error`。
4. 返回最后一个 `TURN_COMPLETE` 或 `ERROR` 事件。

## 分句与情绪

- 使用 `app.services.tts.edge` 中的 `should_flush_sentence_buffer` 和 `next_soft_min` 决定句边界。
- `soft_min` 是动态句长下限，避免过短的句子导致 TTS 频繁切换。
- 情绪从 `(emotion:xxx)` 标记或句内 `[emotion:...]` 提取；最终使用 `turn_emotion` 作为整句情绪。

## 自动提纲（auto_hint）

每回合 AI 问题结束后，服务端自动 spawn `_on_request_hint`，把当前问题作为参考提纲异步生成提示，避免队头阻塞。完成面试（`is_complete=True`）时不生成提纲。

## 与打断的关系

所有关键位置都检查 `epoch != _stream_epoch`。一旦候选人打断，旧流立即退出，不会继续发送 token 或 TTS 帧。

## 聚焦测试

- `tests/test_ws_handler.py`：事件顺序、TTS 帧、完成事件。
- `tests/test_session_tts_flush.py`：TTS flush 与队列边界。
- `tests/test_voice_pipeline.py`：分句与 TTS 集成。

## 相关页面

- [InterviewRunner](../services/interview/runner.md)
- [TTS 服务](../services/tts.md)
- [回合调度](./turn-coordinator.md)
- [打断控制](./turn-control.md)
