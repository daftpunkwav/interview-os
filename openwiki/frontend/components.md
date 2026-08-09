---
type: frontend
title: 共享组件
description: MarkdownContent、ThinkAnswerMessage、StreamingReveal、动画效果组件的职责。
tags: [frontend, components, markdown, streaming, animation]
---

# 共享组件

## src/components/MarkdownContent.tsx

渲染 Markdown 内容的安全组件：

- 使用 `react-markdown` + `remark-gfm` + `rehype-sanitize`。
- 防止 XSS，过滤危险 HTML。
- 支持代码块、表格、列表、加粗等常见 Markdown。

## src/components/ThinkAnswerMessage.tsx

把 LLM 输出中 `<think>...</think>` 思考块与正式回答分开展示：

- 思考块可折叠，默认隐藏。
- 正式回答使用 `MarkdownContent` 渲染。
- 在准备页面和面试页面中用于展示 AI 的推理过程。

## src/components/StreamingReveal.tsx

流式文字展示组件：

- 按 token 逐步显示文本。
- 支持打字机效果与光标。
- 用于面试房间中 AI 正在思考输出的场景。
- 底层依赖 `src/lib/thinkStream.ts`（`<think>` 思考块的流式累积/提取，见 `thinkStream.test.ts`）。

## src/components/effects/*

动画与视觉效果组件：

| 组件 | 用途 |
|---|---|
| `AnimatedCounter` | 数字滚动动画 |
| `FadeInView` | 进入视口渐显 |
| `FluidBackground` | 流体渐变背景 |
| `MagneticButton` | 磁性悬停按钮 |
| `ParticleField` | 粒子场背景 |
| `StaggerContainer` | 子元素交错进入动画 |

这些组件在落地页和营销区块中大量使用。

## 相关页面

- [前端概览](./overview.md)
- [准备页面](./pages/prep.md)
- [面试室](./pages/interview-room.md)
