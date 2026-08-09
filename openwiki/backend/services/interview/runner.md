---
type: backend
title: InterviewRunner 回合门面
description: app/services/interview/runner.py 作为 WebSocket/HTTP/测试的公共入口，委托 PromptAssembler、ToolRoundRunner、StreamingConsumer 执行。
tags: [interview, runner, facade, stream]
---

# InterviewRunner 回合门面

`InterviewRunner` 是面试流程的单一入口。WebSocket handler、HTTP API 与测试都通过它发起开场、回合与结束流。

## 关键符号

- `class InterviewRunner`
- `stream_opening(db)` — 启动面试，开场白
- `stream_turn(user_text, db, face=..., image_b64=..., followup_probe=...)` — 处理候选人回答
- `stream_closing(db)` — 候选人主动结束，致谢 + 小结
- 兼容方法：`_build_api_messages`, `_run_tool_rounds`, `_collect_chat_tools`, `_maybe_retrieve_rag`

## 组合关系

```python
self.agent = agent or InterviewAgent(session, llm)
self._consumer = StreamingConsumer(session, llm, self.agent, rag=rag)
```

`InterviewRunner` 本身不执行业务逻辑，而是：

- 保持对外 API 稳定
- 共享同一个 `InterviewAgent` 实例给三个职责模块
- 让内部模块可以互相调用（如 consumer 需要 tools 时）

## 依赖注入

构造时接受：

- `session: InterviewSession`
- `llm: LLMClient`
- `agent: InterviewAgent | None`
- `rag: CompanyKnowledgeRAG | None`

测试中常注入 `FakeLLMClient` 和 mock agent/RAG。

## 与 WebSocket 层关系

`InterviewWSHandler` 在连接建立后：

1. 加载 `InterviewSession`。
2. 构造 `LLMClient.from_db(db)`。
3. 构造 `InterviewRunner(session, llm)`。
4. 在 `start` 时调用 `stream_opening`；在候选人提交时调用 `stream_turn`。

## 聚焦测试

- `tests/test_runner.py`：最大、最全面的面试回合测试，覆盖开场、工具循环、阶段切换、完成、报告触发。

## 相关页面

- [InterviewAgent](./agent.md)
- [StreamingConsumer](./streaming.md)
- [ToolRoundRunner](./tools.md)
- [面试服务概览](./overview.md)
