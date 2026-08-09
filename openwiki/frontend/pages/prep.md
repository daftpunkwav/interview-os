---
type: frontend
title: 面试准备页面
description: src/app/prep/page.tsx 中创建 prep session、聊天/流式辅导、搜索展示与思考/回答分开展示。
tags: [frontend, page, prep, coaching, sse]
---

# 面试准备页面

`src/app/prep/page.tsx` 提供与 Prep Agent 的聊天式辅导，帮助用户针对简历和目标公司/岗位做准备。

## 关键符号

- `PrepPage`
- `QUICK_PROMPTS`：快捷提示按钮（来自 `src/config/prepPrompts.ts`）
- `ThinkAnswerMessage`：思考块与回答分开展示
- `SearchResultCards`：搜索到的公开信息卡片

## 创建会话

1. 用户选择/输入目标岗位、目标公司，可选关联简历。
2. 调用 `api.createPrepSession({resume_id?, target_role?, target_company?})`。
3. 后端返回 `prep_session_id` 与 `access_token`（通过 Cookie 下发）。
4. 页面进入聊天界面。

## 消息交互

- 用户输入问题或点击快捷提示。
- 调用 `api.prepMessageStream(sessionId, content)` 建立 SSE 连接。
- 流式显示 `token` 事件。
- `done` 事件到达后展示完整 `reply`。
- `ThinkAnswerMessage` 把 `<think>...</think>` 思考块与正式回答分开展示。

## 搜索展示

Prep Agent 可能调用 `web_search` 工具获取公开信息。后端在 SSE 中或通过 `done` 事件附带搜索摘要，前端用 `SearchResultCards` 展示：

- 标题
- 链接
- 摘要

## 工具调用可见性

用户可能看到「正在搜索…」、「正在查询 GitHub…」等过渡提示，增强可解释性。

## 历史回溯

- 页面加载时调用 `api.getPrepMessages(sessionId)` 获取历史。
- 历史展示与聊天消息一致。

## 能力令牌

与 interview 会话相同，可变操作需要 `access_token`，通过 Cookie 或 Header 传递。详见 [session-auth](../../backend/core/session-auth.md)。

## 相关页面

- [后端 API prep 端点](../../backend/api/prep.md)
- [后端 Prep Agent](../../backend/agents/prep.md)
- [共享组件](../components.md)
