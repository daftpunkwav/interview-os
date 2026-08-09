---
type: backend
title: 其他核心工具
description: app/core 中 file_lock、local_only、options_data、prompts 等辅助模块的职责。
tags: [core, utilities, local-only, prompts, options]
---

# 其他核心工具

`app/core` 还包含若干辅助模块，用于本地部署约束、选项数据与共享提示词片段。

## 模块清单

| 文件 | 职责 |
|---|---|
| `app/core/file_lock.py` | 基于 `fcntl`/`msvcrt` 的进程级文件锁，保护并发写 `system_learning.json` 等共享文件 |
| `app/core/local_only.py` | `require_local_peer` / `local_only_dependency`：本地部署时限制某些接口仅 loopback/本地访问 |
| `app/core/options_data.py` | 岗位、职级、经验年限、TTS 音色等静态选项数据，供 `/api/v1/options` 使用 |
| `app/core/prompts.py` | 共享 prompt 片段与工具调用说明 |

## 本地优先约束

`local_only.py` 提供 FastAPI 依赖，用于要求某些端点（如设置更新、测试接口）只能从本地 peer（loopback/局域网）访问。生产环境若前置反向代理，需正确配置 `TRUSTED_PROXY_CIDRS` 以识别真实来源。

## 选项数据

`options_data.py` 是 `/api/v1/options` 返回的部分数据来源。公司与工作流等动态/半动态数据由 `app/services/company/knowledge.py` 和 `app/services/interview/workflows.py` 提供，最终通过 `app/api/options.py` 聚合。

## 相关页面

- [API 选项端点](../api/options.md)
- [后端入口](../main.md)
