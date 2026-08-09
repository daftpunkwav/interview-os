---
type: backend
title: 追问信号分析
description: app/services/interview/followup.py 中根据候选人回答与上一个问题生成追问信号分类和追问 probe。
tags: [interview, followup, probing, classification]
---

# 追问信号分析

`followup.py` 在每次候选人回答后分析是否需要追问，并生成注入 system prompt 的 probe。

## 关键符号

- `FollowupCategory`：`vague` / `missing_data` / `tech_hole` / `off_topic` / `none`
- `analyze(last_question, answer, tech_domains)` → `FollowupResult`（category、score、probe、reason）
- 分类使用规则 + 启发式正则

## 分类含义

| 类别 | 触发条件 | 典型 probe 方向 |
|---|---|---|
| `vague` | 回答含糊、缺乏量化 | 要求具体数据、指标、时间线 |
| `missing_data` | 缺少关键信息（如技术栈、角色、成果） | 补充缺失要素 |
| `tech_hole` | 技术深度不足或明显错误 | 深挖原理、边界、 trade-off |
| `off_topic` | 回答偏离问题 | 引导回题或要求紧扣问题 |
| `none` | 无需追问 | 继续下一阶段 |

## 集成流程

`StreamingConsumer.stream_turn`：

1. 取出上一个面试官问题。
2. 调用 `followup.analyze`。
3. 如果 category != none 且 score 超过阈值，将 probe 注入 system prompt 或作为附加 user message。
4. LLM 在下一轮自然生成追问问题。

## 扩展新分类

1. 在 `app/core/constants.py` 的 `FollowupCategory` 新增枚举值。
2. 在 `followup.py` 新增分类规则/正则与 probe 模板。
3. 在 `tests/test_followup.py` 补充覆盖用例。
4. 同步前端 `FollowupCategory` 类型（如暴露）。

## 聚焦测试

- `tests/test_followup.py`：覆盖各类别判定、probe 生成、none 边界。

## 相关页面

- [InterviewAgent](./agent.md)
- [StreamingConsumer](./streaming.md)
- [常量](../../constants.md)
