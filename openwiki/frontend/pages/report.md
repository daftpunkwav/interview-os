---
type: frontend
title: 报告页面
description: src/app/report/[id]/page.tsx 中只读展示面试报告、雷达图、评分维度、建议与训练计划。
tags: [frontend, page, report, radar, scores]
---

# 报告页面

`src/app/report/[id]/page.tsx` 展示单场面试的完整报告，是面试结束后的主要查看入口。

## 关键符号

- `ReportPage`
- `normalizeScores`：分数归一化
- `formatScore`：分数格式化
- `scoreColor`：根据分数返回颜色
- `RadarChart`：雷达图组件
- `Section`：分块展示

## 报告内容

1. **综合评分**：0–100 分。
2. **雷达图**：技术、沟通、项目深度、问题解决、气场、礼貌等维度。
3. **优势**：本场面试表现突出的方面。
4. **劣势**：需要改进的方面。
5. **改进建议**：针对简历、面试技巧、技术深度的具体建议。
6. **训练计划**：后续学习/练习方向。
7. **阶段摘要**：各阶段表现总结。
8. **气场分析**：基于面部检测的 presence 总结与关键时刻。

## 数据流

1. 页面加载 `api.getReport(id)`。
2. 如果报告未生成（404），提供按钮触发 `api.finishInterview(id)` 并重新加载。
3. 渲染报告内容。

## 报告缺失处理

WebSocket 面试完成时后台调度报告生成。如果用户立即进入报告页可能报告尚未生成，页面显示加载/提示，并提供手动触发结束 + 重试。

## 与 SSE 报告流的关系

`/report/[id]/page.tsx` 使用同步 GET 获取完整报告。`api.getReportStream(id)` 用于需要实时观看报告生成的场景（如后台页面或单独入口）。

## 相关页面

- [后端 API reports 端点](../../backend/api/reports.md)
- [后端面试报告服务](../../backend/services/interview/report.md)
- [成长页面](./growth.md)
