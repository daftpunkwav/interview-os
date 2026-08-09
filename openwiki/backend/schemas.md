---
type: backend
title: Pydantic 请求/响应契约
description: app/schemas/__init__.py 中前后端共享的 DTO、字面量枚举、错误信封与长度限制。
tags: [schemas, pydantic, api-contract, dto]
---

# Pydantic 契约

`app/schemas/__init__.py` 是后端 REST / WebSocket / SSE 的共享请求/响应类型定义。前端 `src/types/index.ts` 与之严格对应。

## 主要契约族

| 契约 | 说明 |
|---|---|
| `LLMSettingsUpdate` / `LLMSettingsResponse` | BYOK 三处理器读写；响应中密钥仅返回 `has_*` 布尔 |
| `UserProfileUpdate` / `UserProfileResponse` | 档案 30+ 字段 |
| `CandidateProfile` / `ResumeResponse` / `ResumeAnalysis` | 简历解析与多维度评价 |
| `InterviewConfig` / `InterviewSessionResponse` | 面试配置与会话响应；创建时填充 `access_token` |
| `InterviewMessageRequest` / `InterviewMessageResponse` | 文本/人脸/图片输入与输出 |
| `InterviewReport` / `InterviewReportResponse` | 面试报告与评分维度 |
| `ScoreBreakdown` | 技术、沟通、项目深度、问题解决、气场、礼貌、综合 |
| `OptionsResponse` | 岗位、职级、公司、工作流、人格、风格、头像、场景、音色 |
| `APIError` / `ErrorBody` | 统一错误信封 `{error:{code,message,trace_id}}` |

## 安全相关长度限制

- `MAX_USER_TEXT_CHARS = 16_000`：单条用户文本上限。
- `InterviewMessageRequest.image_base64` max_length = 300_000（约 200 KB 原始 JPEG）。
- `MAX_CONFIG_STR_CHARS = 200`：配置字符串（岗位、公司、头像等）上限。

## 字面量枚举

`InterviewConfig` 使用 `Literal` 约束：

- `workflow_type`: `technical`, `hr`, `management`
- `personality`: `gentle`, `professional`, `pressure`, `hr`, `expert`
- `interview_style`: `guided`, `deep_dive`, `continuous`, `challenging`
- `strictness`: 1–10

这些字面量必须与 `app/core/constants.py` 和 `frontend/src/config/*.ts` 保持同步。

## 能力令牌不外露

`InterviewSessionResponse.access_token` 仅在 `create` 响应中填充；`list`/`get` 响应中为 `None`，避免令牌反复下发。

## 相关页面

- [数据模型](./models.md)
- [常量](./constants.md)
- [前端类型契约](../frontend/api-client.md)
- [后端 API 概览](./api/overview.md)
