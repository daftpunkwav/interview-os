---
type: backend
title: 准备辅导 Agent
description: app/agents/prep/agent.py 中基于简历、目标公司、岗位提供面试准备辅导，支持同步与 SSE 流式回复。
tags: [agents, prep, coaching, web-search, sse]
---

# 准备辅导 Agent

`app/agents/prep/agent.py` 实现面试准备 Agent：用户上传简历并选择目标岗位/公司后，Agent 提供针对性的辅导建议、预测问题、项目深挖方向。

## 关键符号

- `PrepAgent` 或 `PrepCoach`（具体类名以源码为准）
- `message(content, db, stream=False)`：同步回复
- `message_stream(content, db)`：SSE 流式回复
- `get_messages(session)`：历史回溯

## 输入上下文

每次调用时 Prep Agent 会读取：

- 当前 `PrepSession` 的历史 messages
- 关联 `Resume` 的 `parsed_profile`（如果 `resume_id` 非空）
- `target_role` 与 `target_company`
- `UserProfile` 的扩展字段（如技术领域、城市、远程偏好等）
- 系统学习洞察（可选）

## 工具能力

- `web_search`：DuckDuckGo 搜索目标公司/岗位公开信息
- `company_style_lookup`：查询内置公司风格与样题
- `github_*`：核验用户 GitHub 项目（如果 `UserProfile.github_username` 存在）

## 同步 vs 流式

- 同步：`POST /api/v1/prep/sessions/{id}/message` 返回完整 `reply` 与 `token_usage`。
- 流式：`POST /api/v1/prep/sessions/{id}/message/stream` 通过 SSE 返回 token 与 done 事件。

SSE 帧格式：

```
data: {"type":"token","content":"..."}
data: {"type":"done","reply":"...","token_usage":123}
data: {"type":"error","message":"..."}
```

## 消息历史

`PrepSession.messages` 以 JSON 字符串存储，格式与 ChatGPT 消息一致。`get_messages` 接口用于前端刷新历史。

## 能力令牌

与 `InterviewSession` 一样，可变操作需要 `access_token`（通过 Cookie 或 Header）。详见 [session-auth](../core/session-auth.md)。

## 聚焦测试

- `tests/test_api_v1_paths.py` 覆盖端点注册。
- 端到端行为测试通常使用 `FakeLLMClient` 和 mock 工具。

## 相关页面

- [API Prep 端点](../api/prep.md)
- [Web 搜索服务](../services/search.md)
- [GitHub 工具](../services/github.md)
- [公司知识](../services/company-knowledge.md)
- [前端准备页](../../frontend/pages/prep.md)
