---
type: backend
title: Web 搜索服务
description: app/services/search/web.py 中 DuckDuckGo 搜索封装，供 Prep Agent 与面试工具使用。
tags: [search, web-search, duckduckgo, prep, tools]
---

# Web 搜索服务

`app/services/search/web.py` 封装 DuckDuckGo 搜索，用于面试准备和面试中的工具调用（如 `web_search_interview_exp`）。

## 关键符号

- `web_search(query, max_results=5) -> list[dict]`
- 返回字段通常包括：title, href, body（摘要）

## 使用场景

### 面试准备 Agent

`app/agents/prep/agent.py` 在辅导过程中根据目标公司/岗位搜索公开信息，补充回答。

### 面试 Agent 工具

`app/services/interview/tools.py` 注册 `web_search_interview_exp` 工具，LLM 可在面试中调用以核实候选人口述或获取最新公开信息。

## 依赖

- `duckduckgo-search` / `ddgs` 库
- 无需 API Key（但受 DuckDuckGo 反爬/速率限制）

## 错误处理

- 搜索失败返回空列表，不阻断主流程。
- 异常记录日志，附带 trace_id。

## 站点白名单（sites.py）

`app/services/search/sites.py` 提供可选的站点过滤配置：

- `RESUME_MARKET_SEARCH_SITES`：默认空列表（全网检索）；填入牛客、BOSS 直聘等域名后，`web_search(..., sites=...)` 自动附加 `site:` 过滤。
- `RESUME_MARKET_SITE_LABELS`：域名 → 中文名映射，用于日志与调试展示。

## 聚焦测试

- `tests/test_web_search.py`

## 相关页面

- [面试 Tools](./interview/tools.md)
- [Prep Agent](../agents/prep.md)
- [LLM 客户端](./llm-client.md)
