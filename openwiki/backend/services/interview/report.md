---
type: backend
title: 面试报告生成
description: app/services/interview/report.py 中生成、持久化、流式输出面试报告，并写入 GrowthRecord 与 system_learning.json。
tags: [interview, report, growth, system-learning, sse]
---

# 面试报告生成

## 关键符号

- `build_report_messages(session, face_records)` — 构造报告 LLM 输入
- `_apply_interrupt_politeness_penalty(session, report)` — 打断礼貌扣分
- `generate_report(session, llm, face_records)` → `InterviewReport`
- `generate_and_persist_report(session, llm, db, face_records)` — 单次 LLM + 持久化
- `stream_report(session, llm, face_records)` — 增量流式报告（SSE 用）
- `_REPORT_GENERATING_SENTINEL = '{"_generating":true}'`
- `_REPORT_LOCKS: dict[int, asyncio.Lock]`

## 报告结构

`InterviewReport` 包含：

- `overall_score`：综合评分（0–100）
- `score_breakdown`：技术、沟通、项目深度、问题解决、气场、礼貌、综合
- `strengths` / `weaknesses` / `improvement_suggestions`
- `resume_suggestions` / `interview_suggestions`
- `training_plan`：训练计划
- `phase_summary`：各阶段摘要
- `face_analysis_summary`：面部状态总结
- `presence_moments`：气场亮点/问题时刻

## 生成与持久化

`generate_and_persist_report` 是报告生成的唯一入口：

- HTTP SSE (`/api/v1/reports/{id}/stream`) 和 WebSocket `ReportSchedulerMixin` 都调用它，避免多次 LLM 调用和双倍计费。
- 使用 `asyncio.Lock` 按 session ID 加进程内锁。
- 使用数据库 CAS 写入 `_REPORT_GENERATING_SENTINEL` 哨兵，防止同 session 的 HTTP / WS / 多 worker 并发双打（多 worker 仍可能竞态，进程内锁只保护单 worker）。
- 如果报告已存在（非空且非哨兵），直接返回缓存的报告。
- 如果另一路径正在生成（哨兵），短暂轮询等待落库。
- 生成成功后原子写入 `session.report`、`overall_score`、`status`、`ended_at` 与 `GrowthRecord`。
- 失败时清除哨兵并抛异常，避免永久卡住。

## 对话裁剪与上下文

`build_report_messages`：

- 仅取对话尾部 12000 字符，避免超出上下文窗口。
- 多模态消息只保留 text 部分。
- 附加 `face_records`（面部分析记录）前 1000 字符。
- 附加 `candidate_interrupts` / `ai_interrupts` 统计，让 LLM 在评分和建议中考虑话轮礼仪。

## 打断礼貌扣分

`_apply_interrupt_politeness_penalty(session, report)`：

- 从 `agent_state.candidate_interrupts` 读取打断次数。
- 每次打断扣 `min(30, c_int * 6)` 分，应用至 `politeness`。
- 同时下调 `communication` 和 `presence`。
- 重新计算 `overall_score` 为各维度平均。
- 在 `interview_suggestions` 头部添加话轮礼仪建议。
- 此函数在 `generate_and_persist_report` 中调用，确保 LLM 生成后按实际统计二次修正。

## 流式报告

`stream_report` 不直接复用 `generate_and_persist_report`：它调用 `llm.chat_stream` 让前端增量渲染，最终结构由调用方（`reports.py` SSE）在 `done` 事件中解析。为了不重复计费，SSE 端点通常只使用流式版本，而 WebSocket 完成后的后台调度使用 `generate_and_persist_report`（单次 LLM）。

## 成长记录写入

报告生成后，解析报告内容并创建 `GrowthRecord`：

- `weak_skills`：从 `weaknesses` 推断
- `common_mistakes`：面试中反复出现的问题
- `training_plan`：从 `training_plan` 提取

## 系统学习写入

同时更新 `backend/data/system_learning.json`：

- 记录目标公司/岗位
- 记录工具命中情况
- 记录薄弱线索（用于后续 interview 的 system-learning 摘要）

当前已实现记录与展示，尚未自动反哺 prompt 或题库策略。

## 聚焦测试

- `tests/test_report_stream.py`
- `tests/test_session_report_stream.py` 中 `test_report_stream_single_llm_no_stream_calls` 证明单次 LLM 调用。
- `tests/test_growth_learning.py`

## 相关页面

- [API 报告端点](../../api/reports.md)
- [InterviewAgent](./agent.md)
- [成长学习](../growth.md)
