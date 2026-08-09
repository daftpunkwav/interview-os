---
type: backend
title: 后台报告调度
description: app/realtime/report_scheduler.py 中面试完成后异步生成并持久化报告，避免阻塞 WebSocket 关闭；含防重入、幂等跳过与失败提示。
tags: [realtime, report, scheduler, background-task]
---

# 后台报告调度

`ReportSchedulerMixin`（`app/realtime/report_scheduler.py`）在 WebSocket 面试结束路径上调度后台任务生成报告，使 WebSocket 能立即关闭，报告页稍后经 SSE/轮询加载。

## 关键符号

- `_schedule_report_generation()`：启动后台报告任务（带防重入检查）
- `_generate_report_bg()`：后台协程，使用独立 DB session 执行生成
- `_report_task`：`asyncio.Task` 引用（字段由宿主 `InterviewWSHandler` 持有）
- 本模块不定义独立的取消方法；取消由宿主 `_cancel_bg_tasks()` 统一处理

## 触发点（turn_control.py 内）

`_schedule_report_generation()` 在三条路径被调用：

1. **流式回合自然结束**：`_stream_events_with_tts` 消费完 `runner` 回合且 `last.is_complete`（整场完成）→ 调度报告，同时 `_spawn(_wait_client_playback())` 与 TTS 播报并行。
2. **主动结束-已结束会话**：`_on_request_finish` 发现会话已 `COMPLETED` → 只补发完成提示并重新调度报告（覆盖前端重连/重复点击场景）。
3. **主动结束-正常收尾**：`_on_request_finish` 中 `stream_closing` 成功 → 调度报告与 TTS 收尾播报并行，不再先等播完。

## 防重入与前提

- 若 `_report_task` 存在且未完成（`not done()`），直接返回，不会重复调度。
- 若 `self.llm is None`（引擎未就绪），直接返回。

## 后台流程（`_generate_report_bg`）

1. `SessionLocal()` 开启独立数据库会话，不占用 WS 所在事务。
2. 查询 `InterviewSession`；不存在则静默返回。
3. **幂等跳过**：若会话已 `COMPLETED` 且 `report` 非空且非 `"{}"`，不重新生成，仅重发 `interview_complete`（带 `overall_score`）。
4. 否则调用 `generate_and_persist_report(session, llm, db)`（定义于 `app/services/interview/report.py`）。
5. 成功后向客户端发 `interview_complete`（`session_id` + `overall_score`）。
6. 异常：记录日志，并向客户端发 `error`（`口头收尾已完成，但报告生成失败，请稍后在报告页重试`）。
7. `finally` 中关闭会话。

与 `report.py` 的关系：`generate_and_persist_report` 自身带 `_REPORT_GENERATING_SENTINEL` 哨兵与按 session 的 `asyncio.Lock`，可防止 HTTP SSE 与 WS 后台任务对同一 session 并发双打（进程内锁仅保护单 worker）；重复进入时返回已缓存报告而非覆盖。

## 取消与资源管理

- ws_handler 的 `_cancel_bg_tasks()` 在连接关闭时把未完成的 `_report_task` 追加进取消集合，取消后引用置 `None`。
- 若报告已接近完成，取消可能无法阻止最终落库；由于上述幂等跳过与哨兵机制，重复/延迟写入不会造成数据不一致。

## 为什么用后台任务

一次报告生成需要一次完整 LLM 调用，可能耗时数秒到数十秒。若同步执行，WebSocket close 会被阻塞，前端跳转 `/report/{id}` 后 SSE 可能仍在等待。后台任务让 WS 立即收尾，报告页可稍后流式/轮询读取。

## 聚焦测试

- `backend/tests/test_ws_handler.py`：报告任务调度与取消。
- `test/test_session_report_stream.py`：SSE 报告生成端到端（单次 LLM 调用）。

## 相关页面

- [报告服务](../services/interview/report.md)
- [API 报告端点](../api/reports.md)
- [WS 门面](./ws-handler.md)
- [回合控制](./turn-control.md)
