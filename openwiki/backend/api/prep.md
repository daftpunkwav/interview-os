---
type: backend
title: 面试准备端点
description: app/api/v1/prep.py 中 prep session 创建、同步聊天与 SSE 流式辅导。
tags: [api, prep, sse, agent, coaching]
---

# 面试准备端点

## 路径

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/prep/sessions` | 创建准备会话 |
| POST | `/api/v1/prep/sessions/{id}/message` | 同步聊天 |
| POST | `/api/v1/prep/sessions/{id}/message/stream` | SSE 流式辅导 |
| GET | `/api/v1/prep/sessions/{id}/messages` | 历史消息 |

## 创建准备会话

请求体：

- `resume_id`（可选）
- `target_role`（可选）
- `target_company`（可选）

创建时生成 `access_token`，通过 Cookie `interviewos_prep_{id}` 下发。

## 同步聊天

`POST /message` 调用 `app/agents/prep/agent.py` 的同步接口，返回：

- `reply`：文本回复
- `token_usage`：token 消耗

## SSE 流式辅导

```
data: {"type":"token","content":"..."}
data: {"type":"done","reply":"...","token_usage":123}
data: {"type":"error","message":"..."}
```

## 准备 Agent 能力

`app/agents/prep/agent.py` 支持：

- 按简历 + 目标公司辅导
- 调用 `web_search`（DuckDuckGo）获取公开信息
- 调用公司知识库
- 调用 GitHub 工具核验用户项目

## 能力令牌

可变操作（message、messages）需要 `access_token`，通过 Cookie 或 `X-Interview-Token` 传递。详见 [session-auth](../core/session-auth.md)。

## 相关页面

- [Prep Agent](../agents/prep.md)
- [搜索服务](../services/search.md)
- [GitHub 工具](../services/github.md)
- [公司知识](../services/company-knowledge.md)
- [前端准备页](../../frontend/pages/prep.md)
