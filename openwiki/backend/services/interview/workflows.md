---
type: backend
title: 面试工作流与阶段元数据
description: app/services/interview/workflows.py 是面试阶段、中文名、题量、人格/风格/严格度提示的唯一来源。
tags: [interview, workflow, phase, prompt]
---

# 面试工作流与阶段元数据

`app/services/interview/workflows.py` 是面试阶段元数据的**唯一来源**。`app/core/constants.InterviewPhaseId` 仅对阶段 ID 做枚举约束；`frontend/src/config/phases.ts` 作为离线回退，需与 `phase_label_map()` 保持同步。

## 关键符号

- `PhaseDef(id, name, description, min_questions, max_questions)`
- `Workflow(id, name, phases)`
- `TECHNICAL_WORKFLOW`, `HR_WORKFLOW`, `MANAGEMENT_WORKFLOW`
- `WORKFLOWS: dict[str, Workflow]`
- `phase_label_map()` / `technical_phase_order()` / `get_workflow(id)`
- `PERSONALITY_PROMPTS` / `STYLE_PROMPTS` / `STRICTNESS_DESCRIPTIONS`

## 工作流定义

### 技术面

| 阶段 ID | 中文名 | 题量范围 |
|---|---|---|
| identity_check | 身份确认 | 1–1 |
| self_intro | 自我介绍 | 1–1 |
| basic_knowledge | 基础知识 | 2–4 |
| project_deep_dive | 项目深挖 | 3–6 |
| technical_deep | 技术深挖 | 2–4 |
| system_design | 系统设计 | 1–2 |
| scenario | 情景问题 | 1–2 |
| reverse_qa | 反问环节 | 1–3 |
| summary | 总结评价 | 1–1 |

### HR 面

身份确认 → 自我介绍 → 职业规划 → 团队合作 → 压力问题 → 薪资沟通 → 反问 → 总结。

### 管理岗面

身份确认 → 自我介绍 → 领导经验 → 决策能力 → 冲突处理 → 业务理解 → 反问 → 总结。

## 人格与风格提示

人格 `PERSONALITY_PROMPTS` 与风格 `STYLE_PROMPTS` 是 prompt 片段，在 `build_system_prompt` 中直接注入。严格度 `STRICTNESS_DESCRIPTIONS` 是 1–10 的文本描述，用于 system prompt 描述面试强度。

## 添加新工作流

1. 在 `app/core/constants.py` 的 `InterviewPhaseId` 中新增阶段 ID（如需要）。
2. 在 `workflows.py` 定义新 `Workflow` 并加入 `WORKFLOWS`。
3. 在 `app/api/options.py` 或 `options_data.py` 暴露新工作流。
4. 更新 `frontend/src/config/phases.ts` 离线回退。
5. 补充 `tests/test_phase_ssot.py` 与 `test_api_v1_paths.py` 同步断言。

## 聚焦测试

- `tests/test_phase_ssot.py`：验证 `InterviewPhaseId` 与 `WORKFLOWS` 阶段一致。
- `tests/test_api_v1_paths.py`：验证 `workflow_types` 暴露与 `InterviewConfig` 字面量一致。

## 相关页面

- [InterviewAgent](./agent.md)
- [Prompts](./prompts.md)
- [常量](../../constants.md)
- [API options](../../api/options.md)
