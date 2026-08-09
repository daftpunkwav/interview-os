---
type: frontend
title: 面试历史页面
description: src/app/history/page.tsx 中列出所有面试会话、查看统计、继续面试或查看报告。
tags: [frontend, page, history, sessions]
---

# 面试历史页面

`src/app/history/page.tsx` 展示用户的所有面试会话历史，提供继续面试和查看报告的入口。

## 关键符号

- `HistoryPage`
- `StatusBadge`：状态标签（pending / active / completed / abandoned）
- `StatCell`：统计单元
- `DetailRow`：详情行

## 展示内容

每个会话卡片通常展示：

- 岗位、目标公司、工作流类型
- 状态（进行中、已完成、已放弃）
- 综合评分（如果已完成）
- 时长、消息数
- 创建时间
- 当前阶段（如果未完成）

## 操作

- **继续面试**：如果会话状态为 `pending` 或 `active`，导航到 `/interview/{id}`。
- **查看报告**：如果状态为 `completed`，导航到 `/report/{id}`。
- **放弃**：可选操作，标记为 `abandoned`。

## 数据流

1. 页面加载 `api.listSessions()`。
2. 渲染会话列表。
3. 用户操作后跳转。

## 与成长页的关系

历史页展示单场会话信息；成长页聚合多场会话的薄弱点与训练计划。

## 相关页面

- [后端 API interview 端点](../../backend/api/interview.md)
- [报告页面](./report.md)
- [面试室页面](./interview-room.md)
