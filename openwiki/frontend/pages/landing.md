---
type: frontend
title: 落地页
description: src/app/page.tsx 营销落地页、功能网格与 3 步流程。
tags: [frontend, page, landing, marketing]
---

# 落地页

`src/app/page.tsx` 是 InterviewOS 的默认入口，展示产品价值主张、3 步使用流程、功能网格与信任信息。

## 关键符号

- `HomePage` / `InterviewPreview`（具体组件名以源码为准）
- 使用 `src/components/effects/*` 动画组件

## 主要内容

1. Hero 区域：产品标题、副标题、CTA（开始面试/去设置）。
2. 3 步流程：配置处理器 → 上传简历 → 开始面试。
3. 功能网格：BYOK、多厂商 ASR、三处理器管道、企业风格模拟、动态追问、报告、成长等。
4. 技术栈与安全徽章。

## 跳转逻辑

- CTA 通常导航到 `/settings` 或 `/interview`。
- 如果用户未配置 LLM，可能提示先去设置。

## 相关页面

- [前端概览](../overview.md)
- [设置页面](./settings.md)
- [面试创建页](./interview-setup.md)
