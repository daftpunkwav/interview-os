---
type: backend
title: 报告与成长端点
description: app/api/reports.py 中面试报告读取、SSE 流式生成、成长历史与系统洞察。
tags: [api, reports, sse, growth, system-learning]
---

# 报告与成长端点

## 路径

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/reports/{id}` | 读取已生成的面试报告 |
| GET | `/api/v1/reports/{id}/stream` | SSE 流式生成报告 |
| GET | `/api/v1/reports/growth/history` | 最近 20 条成长记录 |
| GET | `/api/v1/reports/growth/system-insights` | 系统跨面试学习洞察 |

## 报告结构

`InterviewReportResponse` 包含：

- `session_id`
- `report`：`InterviewReport`（综合评分、各维度评分、优势、劣势、建议、训练计划、阶段摘要、气场分析）
- `messages_count`
- `duration_minutes`（可选）

## SSE 流式生成

`GET /api/v1/reports/{id}/stream` 复用 `generate_and_persist_report`，单次 LLM 完成生成与持久化，避免双倍计费。SSE 帧格式：

```
data: {"type":"token","content":"..."}
data: {"type":"done","report":{...},"token_usage":123}
data: {"type":"error","message":"报告生成失败，请稍后重试"}
```

## 成长历史

`GrowthRecord` 记录每场面试的：

- `weak_skills`：薄弱技能列表
- `common_mistakes`：常见错误
- `training_plan`：训练计划

## 系统洞察

`system_learning.json` 聚合跨面试的：

- 工具命中情况
- 目标公司/岗位分布
- 薄弱线索与有效追问
- 历史均分

当前已实现「记录 + 展示」，尚未自动反哺 prompt 或题库策略。

## 聚焦测试

- `tests/test_report_stream.py`
- `tests/test_session_report_stream.py`
- `tests/test_growth_learning.py`

## 相关页面

- [面试报告服务](../services/interview/report.md)
- [成长学习](../services/growth.md)
- [前端报告页](../../frontend/pages/report.md)
- [前端成长页](../../frontend/pages/growth.md)
