---
type: frontend
title: 面试创建页面
description: src/app/interview/page.tsx 中填写面试配置并创建会话，导航到实时面试房间。
tags: [frontend, page, interview, setup, form]
---

# 面试创建页面

`src/app/interview/page.tsx` 提供面试前的配置表单，创建会话后导航到 `/interview/{id}`。

## 关键符号

- `InterviewSetupPage`
- `Select`：选择器封装
- `PreviewRow`：配置预览

## 配置字段

对应 `InterviewConfig`：

- 岗位 `role`（必填）
- 职级 `level`（必填）
- 目标公司 `company`（必填，从 `/api/v1/options` 公司列表选择或手动输入）
- 工作流 `workflow_type`：技术面 / HR 面 / 管理岗
- 面试官人格 `personality`
- 严格度 `strictness`：1–10
- 面试风格 `interview_style`
- 头像 `avatar_id`
- 场景 `scene_id`
- 关联简历 `resume_id`（可选）

## 数据流

1. 加载 `api.getOptions()` 获取下拉选项、公司、工作流、头像、场景、音色等。
2. 用户填写表单。
3. 调用 `api.createSession(config)`。
4. 后端返回 `InterviewSessionResponse`，含 `access_token`（通过 Cookie 下发）。
5. 前端导航到 `/interview/{id}`。

## 与公司风格的关系

选择公司后，后端 `build_system_prompt` 会注入该公司风格描述，RAG 也会检索该公司面经（如果启用）。

## 相关页面

- [后端 API interview 端点](../../backend/api/interview.md)
- [后端工作流](../../backend/services/interview/workflows.md)
- [面试室页面](./interview-room.md)
