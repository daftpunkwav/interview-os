---
type: 后端模块
title: Function Tools 与工具循环
description: app/services/interview/tools.py 与 tool_round_runner.py 注册并执行 GitHub/公司/简历/搜索 function tools；轮次上限由 interview_max_tool_rounds 与 MAX_TOOL_ROUNDS 共同约束。
tags: [interview, tools, function-calling, github, search]
openwiki:
  roles: [domain, integration]
  source_paths:
    - backend/app/services/interview/tools.py
    - backend/app/services/interview/tool_round_runner.py
    - backend/app/services/github/tools.py
  symbols: [get_interview_tool_definitions, execute_interview_tool, ToolRoundRunner, MAX_TOOL_ROUNDS]
  test_paths:
    - backend/tests/test_runner.py
    - backend/tests/test_github_tools.py
    - backend/tests/test_web_search.py
---

# Function Tools 与工具循环

面试 Agent 支持 OpenAI function calling：在最终流式回复前，可先以非流式方式执行多轮工具调用，并将结果注入 messages。

## 文件职责

| 文件 | 职责 |
|---|---|
| `tools.py` | 本地工具定义、`get_interview_tool_definitions`、`execute_interview_tool`、结果截断 |
| `tool_round_runner.py` | `ToolRoundRunner`：`run_tool_rounds` / `collect_chat_tools` / `maybe_retrieve_rag` |
| `github/tools.py` | `GITHUB_TOOL_DEFINITIONS` + `execute_github_tool` |

## 工具注册表（真实名称）

`get_interview_tool_definitions()` = GitHub 定义 + 本地定义。

### GitHub（`github_` 前缀）

| 工具名 | 说明 |
|---|---|
| `github_get_user` | 用户公开资料 |
| `github_list_repos` | 公开仓库列表 |
| `github_get_repo` | 单仓库元数据 |
| `github_get_readme` | README 文本 |
| `github_list_commits` | 最近 commits |
| `github_list_pulls` | Pull Requests |
| `github_list_issues` | Issues |
| `github_get_file` | 指定路径文件/目录 |
| `github_get_languages` | 语言字节占比 |

### 本地 / 公司

| 工具名 | 说明 |
|---|---|
| `lookup_company_profile` | 公司面试风格/重点/样题（结构化 KB） |
| `lookup_resume_projects` | 当前会话绑定简历的项目与技能 |
| `web_search_interview_exp` | DuckDuckGo 面经/资料搜索 |

常量：`MAX_TOOL_ROUNDS = 3`，`MAX_TOOL_RESULT_CHARS = 8000`。

## ToolRoundRunner

### `collect_chat_tools(include_function_tools=True)`

合并：

1. StepFun `build_retrieval_tool()`（若 RAG 后端提供）；
2. 当 `settings.interview_tools_enabled` 为真时，追加全部 function tools。

### `run_tool_rounds(api_messages, db, temperature=0.75)`

1. 若 `interview_tools_enabled` 为假或 `max_rounds<=0`，原样返回。
2. `max_rounds = min(settings.interview_max_tool_rounds, MAX_TOOL_ROUNDS)`（配置默认 3，硬顶 3）。
3. 每轮 `llm.chat_message(..., tools=tools)`：
   - 无 `tool_calls` 且首轮已有 content → 返回 `(messages, content)`，调用方直接播报（避免二次 LLM）；
   - 有 `tool_calls` → `execute_interview_tool`，以 `tool` 角色追加结果，写入 `agent_state.tool_trace`。
4. 执行过工具后返回 `(enriched_messages, None)`，由调用方再 `chat_stream`。

### `maybe_retrieve_rag`

- StepFun：返回 `None`（检索走 chat 时的 retrieval tool）。
- Local：`query_for_company` / `query`，过滤 `distance < 0.5`，格式化为 system 消息。

## 执行与记忆

- `name.startswith("github_")` → `execute_github_tool`；结果摘要写入 `agent_state.github_findings`（最多 20 条）。
- 未传 `username` 时，可从 `UserProfile.github_username` 自动补全（`github_get_user` / `github_list_repos`）。
- 工具结果超过 `MAX_TOOL_RESULT_CHARS` 会被截断。

## 配置

见 `app/config.py`：

- `interview_tools_enabled: bool = True`
- `interview_max_tool_rounds: int = 3`（0–6）
- `github_token`：可选 PAT，提高配额

## 聚焦测试

- `tests/test_runner.py`：工具循环与结果注入
- `tests/test_github_tools.py`：GitHub 工具执行
- `tests/test_web_search.py`：搜索工具

## 相关页面

- [GitHub 服务](../github.md)
- [搜索服务](../search.md)
- [公司知识](../company-knowledge.md)
- [RAG 概览](../rag/overview.md)
- [流式消费者](./streaming.md)
- [LLM 客户端](../llm-client.md)
