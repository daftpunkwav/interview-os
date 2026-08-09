---
type: 后端模块
title: GitHub 工具与 REST 客户端
description: app/services/github 提供 GitHub REST 客户端与 OpenAI function tools（github_* 前缀），语义对齐常见 GitHub MCP，但非官方 stdio/HTTP MCP 传输。
tags: [github, tools, mcp, rest-client, function-calling]
openwiki:
  roles: [integration, domain]
  source_paths:
    - backend/app/services/github/client.py
    - backend/app/services/github/tools.py
  symbols: [GitHubClient, GITHUB_TOOL_DEFINITIONS, execute_github_tool]
  test_paths: [backend/tests/test_github_tools.py]
---

# GitHub 工具与 REST 客户端

GitHub 模块是 **REST 客户端 + OpenAI function tools**，不是官方 MCP 进程传输。工具名一律带 `github_` 前缀，语义对齐常见 GitHub MCP。

## 文件结构

| 文件 | 职责 |
|---|---|
| `client.py` | GitHub REST：请求、轻量缓存、分页、配额 |
| `tools.py` | `GITHUB_TOOL_DEFINITIONS` + `execute_github_tool` |

## 工具清单（与源码一致）

| 工具名 | 说明 |
|---|---|
| `github_get_user` | 用户公开资料（bio、仓库数、关注者等） |
| `github_list_repos` | 公开仓库，按最近更新 |
| `github_get_repo` | 单仓库元数据（star、语言、topics） |
| `github_get_readme` | README 文本 |
| `github_list_commits` | 最近 commits（可选 author） |
| `github_list_pulls` | Pull Requests |
| `github_list_issues` | Issues |
| `github_get_file` | 指定 path 的文件或目录列表 |
| `github_get_languages` | 语言字节占比 |

未知工具名返回 JSON：`{"error":"unknown_github_tool","name":...}`。

## 认证

- 可选 `Settings.github_token` / 环境变量 `GITHUB_TOKEN` 提高 API 配额。
- 未配置时仍可访问公开数据，但受未认证速率限制。

## 执行流程

1. LLM 在 `ToolRoundRunner` 中发起 `tool_calls`。
2. `execute_interview_tool` 发现 `github_*` 后调用 `execute_github_tool`。
3. `tools.py` 分发到 `GitHubClient` REST 方法，返回 JSON 字符串。
4. 摘要写入 `agent_state.github_findings`（最多 20 条），供记忆与报告。

`github_get_user` / `github_list_repos` 在未传 `username` 时，可从 `UserProfile.github_username` 自动补全。

## 缓存与配额

`client.py` 做进程内轻量缓存，降低重复请求。面试中高频调用仍可能触达 GitHub 限流。

## 未来 MCP 替换

可保留 function definition 不变，仅将 `execute_github_tool` 内部改为 MCP 传输。当前 `client.py` / `tools.py` 是稳定隔离层。

## 聚焦测试

- `tests/test_github_tools.py`

## 相关页面

- [面试 Tools](./interview/tools.md)
- [LLM 客户端](./llm-client.md)
