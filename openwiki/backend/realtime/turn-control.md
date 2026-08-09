---
type: backend
title: 打断控制与收尾
description: app/realtime/turn_control.py 中候选人打断、主动结束、静默追问、事件分发、打断统计持久化。
tags: [realtime, turn-control, barge-in, finish, silence-nudge, interrupts]
---

# 打断控制与收尾

`TurnControlMixin` 负责面试中的副作用：候选人打断、主动结束、静默追问、事件分发，以及把打断统计写入 `agent_state` 供报告礼貌分使用。

## 关键符号

- `_on_candidate_barge_in()`：候选人打断面试官播报
- `_on_request_finish()`：候选人主动结束面试
- `_on_silence_nudge()`：静默超时追问
- `_process_user_text(text, data, db, session)`：调用流式消费并处理结束/开麦
- `_dispatch_event(event)`：把 `StreamEvent` 翻译成 WebSocket 客户端事件
- `_persist_interrupt_stats(session, db)`：写入 `candidate_interrupts` / `ai_interrupts`

## 候选人打断（barge-in）

触发条件：通常由前端 VAD 检测到 AI 播报期间候选人再次说话，发送 `user_turn_end` 或特定事件。

处理：

1. 仅当 `turn_state` 为 `AI_SPEAKING` 或 `PROCESSING` 时处理。
2. `_candidate_interrupts += 1`。
3. `_stream_epoch += 1` 和 `_playback_generation += 1`，使旧 LLM/TTS 流按 epoch 放弃。
4. 清空 TTS 队列 `await self._tts_queue.clear()`。
5. 清空音频缓冲。
6. 发送 `tts_interrupted` 事件给前端，携带 `candidate_interrupts` 和 `playback_generation`。
7. 持久化打断统计到 `agent_state`。
8. `set_turn(USER_SPEAKING)`，让新 `user_turn_end` 接棒。

## 主动结束（finish）

1. 若 `_closing` 已置位则忽略。
2. 如果 session 已 `completed`，发送 `assistant_done` 并调度报告生成。
3. 否则置 `_closing=True`，调用 `runner.stream_closing(db)` 生成致谢与小结。
4. 流式消费完成后 `set_turn(IDLE)`，调度后台报告生成 `_schedule_report_generation()`，并 spawn `_wait_client_playback()`。
5. 失败时回退到 `USER_SPEAKING` 并提示重试。

## 静默追问（silence nudge）

- 仅当 `turn_state == USER_SPEAKING` 时触发。
- 刚开麦 `_nudge_grace_sec`（默认 15s）内不追问，避免开场后立即追问。
- `_nudge_cooldown_sec`（默认 25s，STT 连续失败 2 次后延长到 45s）防止连续追问。
- 通过 `orchestrator.build_silence_nudge` 根据人格、严格度、当前阶段生成提示。
- 发送 `silence_nudge`，增加 `_ai_interrupts`，调用 `_speak_one` 直接播放短句，再开麦。

## 事件分发

`_dispatch_event` 把 `StreamEvent` 映射到客户端事件：

| StreamEvent | 客户端事件 |
|---|---|
| `TOKEN` | `assistant_token` |
| `TURN_COMPLETE` | 先 `phase_changed`（如有），再 `assistant_done`（含 `content`, `phase`, `is_complete`, `emotion`） |
| `ERROR` | `error` |

`_process_user_text` 中调用 `_stream_events_with_tts` 后：

- 若 `start_epoch != _stream_epoch`，说明已被打断，直接返回。
- 若 `last.is_complete`，则调度报告生成。
- 否则等待客户端播放完再开麦。

## 打断统计与报告礼貌分

`_persist_interrupt_stats` 把 `candidate_interrupts` 和 `ai_interrupts` 写入 `session.agent_state`。`generate_and_persist_report` 在 `_apply_interrupt_politeness_penalty` 中读取这些计数，下调 `politeness` / `communication` / `presence` 分数。

## 聚焦测试

- `tests/test_ws_hardening.py`：barge-in、finish、并发边界。
- `tests/test_ws_handler.py`：结束流程与事件顺序。
- `tests/test_session_auth_and_audio_buffer.py`：音频缓冲超限。

## 相关页面

- [WS 门面](./ws-handler.md)
- [回合调度](./turn-coordinator.md)
- [流式处理](./turn-streaming.md)
- [语音管道](./voice-pipeline.md)
- [面试报告服务](../services/interview/report.md)
