---
type: frontend
title: 前端概览
description: Next.js 15 App Router + React 19 + TypeScript 严格模式 + Tailwind CSS 的前端结构与路由。
tags: [frontend, nextjs, react, typescript, tailwind]
---

# 前端概览

InterviewOS 前端是 Next.js 15 App Router 应用，使用 React 19、TypeScript 严格模式（启用 `noUncheckedIndexedAccess`）、Tailwind CSS 和 framer-motion。

## 目录结构

| 目录 | 角色 |
|---|---|
| `src/app/` | Next.js App Router 页面 |
| `src/components/` | 共享 UI 组件（布局、动画、Markdown、面试组件） |
| `src/features/` | 领域特性：avatar、media（WS、录音、TTS） |
| `src/lib/` | API 客户端、环境校验、工具函数、流式处理 |
| `src/types/` | 全局 TypeScript 类型契约 |
| `src/config/` | 导航、阶段、供应商、快捷提示等静态配置 |

## 关键约定

- 仅 Client Component 包含交互逻辑（页面通常顶部 `"use client"`）。
- RSC（React Server Component）仅做轻量装饰和数据预取（当前 mostly 客户端渲染）。
- 所有 REST / SSE / WebSocket 类型在 `src/types/index.ts` 中定义，与后端 Pydantic 严格对应。
- 所有 API 调用走 `src/lib/api.ts` 的 `api` 对象。

## 构建与脚本

```bash
cd frontend
npm install
npm run dev      # 开发
npm run build    # 生产构建
npm run test     # vitest
npx tsc --noEmit # 类型检查
```

## 环境变量

`frontend/.env.local`：

- `NEXT_PUBLIC_API_BASE`：后端 REST 基础地址（如 `http://localhost:8000`）
- `NEXT_PUBLIC_WS_URL`：后端 WebSocket 地址（如 `ws://localhost:8000`）
- `NEXT_PUBLIC_STREAM_API_BASE`：SSE 直连地址（避免 Next rewrites 缓冲）

`src/lib/env.ts` 在构建/运行时校验这些变量，生产环境强制要求 https/wss 一致性。

## 路由

| 路径 | 页面文件 | 说明 |
|---|---|---|
| `/` | `src/app/page.tsx` | 营销落地页 |
| `/profile` | `src/app/profile/page.tsx` | 用户档案 |
| `/resume` | `src/app/resume/page.tsx` | 简历上传与分析 |
| `/prep` | `src/app/prep/page.tsx` | 面试准备辅导 |
| `/interview` | `src/app/interview/page.tsx` | 创建面试 |
| `/interview/[id]` | `src/app/interview/[id]/page.tsx` | 实时面试房间 |
| `/history` | `src/app/history/page.tsx` | 面试历史 |
| `/growth` | `src/app/growth/page.tsx` | 成长记录 |
| `/report/[id]` | `src/app/report/[id]/page.tsx` | 报告查看 |
| `/settings` | `src/app/settings/page.tsx` | 三处理器设置 |

导航数组定义在 `src/config/nav.ts`。

## 相关页面

- [API 客户端与类型](./api-client.md)
- [媒体管道](./media-pipeline.md)
- [Avatar](./avatar.md)
- [布局与导航](./layout.md)
