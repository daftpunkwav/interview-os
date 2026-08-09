---
type: backend
title: 面试 Orchestrator
description: app/agents/orchestrator.py 中合并视觉/追问/候选人多源信号为一个统一快照交给 TurnCoordinator。
tags: [agents, orchestrator, signals, vision, followup]
---

# 面试 Orchestrator

`app/agents/orchestrator.py` 中的 `InterviewOrchestrator` 负责在一次候选人回合前，把多个来源的实时信号合并成一个统一的 `SessionSnapshot`，再交给 `TurnCoordinatorMixin` 处理。

## 关键符号

- `class InterviewOrchestrator`
- `build_snapshot(...)`：合并视觉分析、追问信号、候选人文本、音频状态等
- 返回 `SessionSnapshot`（定义在 `app/realtime/events.py`）

## 信号来源

| 来源 | 数据 | 说明 |
|---|---|---|
| 视觉 Agent | `face_analysis`（情绪、眼神接触、紧张度） | 由前端 `VideoPanel` 通过 `vision_update` 事件发送 |
| 追问分析 | `followup_probe` | 由 `followup.analyze` 在 `_run_turn` 前生成 |
| 候选人文本 | `user_text` | 最终 ASR 文本或手动输入 |
| 图片帧 | `image_base64` | 可选，用于多模态 LLM 分析 |

## 合并策略

Orchestrator 本身不做决策，只按优先级合并：

1. 视觉信号用于 `face_analysis` 字段，进入 `build_user_content` 的面部提示。
2. 追问信号如非空，会进入 `followup_probe` 参数，影响 `StreamingConsumer` 的 prompt 注入。
3. 候选人文本始终作为 user message 内容。
4. 图片帧如存在且大小合规，作为多模态 content 附加到 user message。

## 与实时层的关系

`TurnCoordinatorMixin._run_turn` 在调用 `InterviewRunner.stream_turn` 前，通过 `self.orchestrator.build_snapshot(...)` 获取快照，然后传给 runner。

## 聚焦测试

- `tests/test_orchestrator.py`：信号合并、优先级、空值处理。

## 相关页面

- [视觉 Agent](./vision.md)
- [追问分析](../services/interview/followup.md)
- [实时事件](../realtime/events.md)
- [回合调度](../realtime/turn-coordinator.md)
