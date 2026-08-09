---
type: backend
title: 成长与系统学习
description: app/services/growth/learning.py 中候选人成长记录与 system_learning.json 跨面试聚合。
tags: [growth, learning, system-learning, report, interview]
---

# 成长与系统学习

`app/services/growth/learning.py` 实现 InterviewOS 的「双重成长」：候选人成长记录 + 系统跨面试学习。

## 关键符号

- `record_interview_learning(session, report, agent_state)`
- `get_growth_history(profile_id, limit=20)`
- `get_system_insights(limit=5)`
- `GrowthRecord` 模型写入
- `system_learning.json` 文件读写（带文件锁）

## 候选人成长（GrowthRecord）

每场面试结束后，从报告解析并写入：

- `weak_skills`：薄弱技能列表
- `common_mistakes`：常见错误
- `training_plan`：训练计划

`GET /api/v1/reports/growth/history` 返回最近 20 条，前端在 `/growth` 页面聚合展示。

## 系统学习（system_learning.json）

跨面试聚合：

- 目标公司与岗位分布
- 工具命中情况（哪些工具被调用、结果摘要）
- 薄弱线索（追问信号、 weak_points 摘要）
- 历史均分（按公司/岗位）
- 有效追问线索（近期被验证有效的追问方向）

`GET /api/v1/reports/growth/system-insights` 返回这些洞察，前端在成长页「系统自我成长」区块展示。

## 反哺闭环（已实现记录与展示）

`InterviewAgent._system_learning_section()` 从 `system_learning.json` 读取：

- 目标公司历史均分（低于 80 提示加大考察力度）
- 近期有效追问线索（按公司/岗位相关性优先）

这些洞察作为开场 system prompt 的固定段落注入，让 Agent 自发参考。当前已实现记录与展示，**尚未自动改写 prompt 或题库策略**（P1）。

## 并发保护

`system_learning.json` 使用 `app/core/file_lock.py` 的文件锁保护并发读写，避免多进程/多线程同时写入损坏 JSON。

## 聚焦测试

- `tests/test_growth_learning.py`
- `tests/test_session_settings_and_growth.py`

## 相关页面

- [API 报告端点](../api/reports.md)
- [InterviewAgent](./interview/agent.md)
- [面试报告服务](./interview/report.md)
- [前端成长页](../../frontend/pages/growth.md)
