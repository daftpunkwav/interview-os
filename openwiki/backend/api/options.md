---
type: backend
title: 选项端点
description: app/api/options.py 中返回前端启动所需的岗位、职级、公司、工作流、人格、风格、头像、场景、音色等选项。
tags: [api, options, dropdowns, metadata]
---

# 选项端点

## 路径

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/options` | 启动初始化选项 |

## 返回结构

`OptionsResponse` 包含：

- `roles`：岗位列表
- `levels`：职级列表
- `experience_years`：工作年限选项
- `companies`：内置 7 家公司 + 风格/样题
- `personalities`：面试官人格选项
- `interview_styles`：面试风格选项
- `workflow_types`：工作流类型 + 阶段列表
- `phase_labels`：阶段 ID 到中文名的映射
- `avatars`：面试官头像选项
- `scenes`：面试场景选项
- `tts_voices`：TTS 音色选项
- `silence_nudge_seconds`：静默追问秒数（默认 25）

## 数据来源

- 岗位、职级、经验年限、TTS 音色：静态数据来自 `app/core/options_data.py`。
- 公司信息：来自 `app/services/company/knowledge.py` 的 7 家内置公司。
- 工作流、阶段、人格、风格：来自 `app/services/interview/workflows.py`。
- 阶段标签：由 `workflows.phase_label_map()` 生成，以技术面为优先，其他补全。

## 与前端同步

`frontend/src/config/phases.ts` 作为离线回退，必须由 `tests/test_api_v1_paths.py` 等测试保持与后端 `phase_labels` 一致。修改阶段 ID 或名称时，前后端需原子同步。

## 相关页面

- [核心选项数据](../core/other.md)
- [公司知识](../services/company-knowledge.md)
- [面试工作流](../services/interview/workflows.md)
- [常量](../constants.md)
