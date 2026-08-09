---
type: backend
title: 面试 Agent 状态机
description: app/services/interview/agent.py 中 InterviewAgent 负责消息历史、结构化记忆、阶段推进与持久化。
tags: [interview, agent, state-machine, memory, phase]
---

# 面试 Agent 状态机

`InterviewAgent` 是单会话面试的内存状态持有者，所有业务模块通过它读写状态，避免直接操作 `InterviewSession` 的 JSON 字段。

## 关键符号

- `class InterviewAgent`
- `save_state(db)`：把 `agent_state` + `messages` 写回数据库
- `current_phase()` / `phases_remaining()`
- `mark_active()` / `mark_completed()`
- `record_user_text()` / `record_assistant_text()`
- `advance_phase_if_needed(reply)`
- `refresh_system_memory()`
- `build_opening_prompt(db)`

## 状态结构

`agent_state` 是 JSON 对象，包含：

| 字段 | 用途 | 保留上限 |
|---|---|---|
| `phase_idx` | 当前阶段索引 | — |
| `questions_in_phase` | 本阶段已提问数 | 由 `PhaseDef.max_questions` 控制 |
| `asked_topics` | 已覆盖话题 | — |
| `asked_questions` | 已问问题摘要（前 120 字） | 80 条 |
| `weak_points` | 候选人薄弱点 | 30 条 |
| `followup_clues` | 追问线索 | — |
| `github_findings` | GitHub 工具结果摘要 | — |
| `tool_trace` | 工具调用轨迹 | — |

## 阶段推进

```python
phase_complete = has_marker(reply, PHASE_COMPLETE_MARKER)
max_reached = self.questions_in_phase >= self.current_phase().max_questions
if phase_complete or max_reached:
    self._advance_phase()
```

- 当 LLM 输出 `[PHASE_COMPLETE]` 或本阶段题量达到上限时推进。
- 最后阶段不会再越界推进。

## 结构化记忆刷新

`refresh_system_memory()` 只替换 `messages[0]`（system prompt）尾部的 `## 会话结构化记忆` 段落，不重建整个 prompt。这样：

- 避免每回合重跑 DB 查询（候选人档案、公司知识仅在开场构建一次）。
- 上下文压缩后仍保留最新记忆，防止重复提问和遗漏薄弱点。

## 系统学习反哺

`_system_learning_section()` 从 `system_learning.json` 读取：

- 目标公司历史均分（低于 80 提示加大考察力度）
- 近期有效追问线索（按公司/岗位相关性优先）

这些内容作为开场 system prompt 的固定段落注入，整场面试不变。当前已实现记录与展示，尚未自动改写 prompt 或题库策略。

## 反向问答阶段

`reverse_qa` 阶段进入时，system message 切换角色为「该公司代表」，强调基于公司知识库回答、未覆盖内容坦诚说明。

## 聚焦测试

- `tests/test_runner.py`：完整状态机与阶段切换。
- `tests/test_phase_ssot.py`：阶段推进与 `workflows.py` 一致性。
- `tests/test_growth_learning.py`：系统学习读取与写入。

## 相关页面

- [InterviewRunner](./runner.md)
- [工作流](./workflows.md)
- [追问分析](./followup.md)
- [上下文压缩](../context.md)
- [成长学习](../growth.md)
