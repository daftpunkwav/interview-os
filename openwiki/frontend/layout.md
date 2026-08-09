---
type: frontend
title: 布局与导航
description: src/app/layout.tsx、AppShell、Sidebar、ThemeProvider、Toast 与 LoadError 的职责。
tags: [frontend, layout, navigation, theme, toast]
---

# 布局与导航

## src/app/layout.tsx

根布局：

- 加载 `DM_Sans` 和 `JetBrains_Mono` 字体。
- 注入 `themeInitScript` 防止 hydration 闪烁。
- 包裹 `ThemeProvider` 和 `AppShell`。
- 挂载 `Toaster`。
- 设置 viewport 与 metadata。

## src/components/layout/AppShell.tsx

- 检测全屏页面（如 `/interview/\d+`），渲染全屏深色容器，不显示侧边栏。
- 其他页面渲染 `Sidebar` + `<main>` 布局，并添加基于 pathname 的页面过渡动画。

## src/components/layout/Sidebar.tsx

- 桌面端可折叠侧边栏（72px / 256px 两种宽度）。
- 移动端抽屉。
- 根据 `NAV_ITEMS` 渲染导航项，高亮逻辑：
  - `/interview` 匹配 `/interview/*`
  - `/history` 匹配 `/report/*`
- 集成 `ThemeToggle`。
- 抽屉打开时锁定 body overflow。

## src/components/theme/ThemeProvider.tsx

- 管理 `light | dark | system` 主题。
- 通过 `localStorage` 持久化用户选择。
- 监听系统 `prefers-color-scheme` 媒体查询。
- 在 hydration 前将 `class` 应用到 `<html>`，避免闪烁。

## src/components/Toast.tsx

模块级 toast 系统：

- 通过 listener set 管理多个 toast 视图。
- 支持 `info`, `success`, `warning`, `error`。
- 可选 `persist` 与自定义 `durationMs`。
- 在 `layout.tsx` 中挂载 `Toaster` 一次，所有组件通过 `toast.success(...)` 等调用。

## src/components/LoadError.tsx

可复用错误横幅：

- 显示后端 URL 提示（帮助排查 `.env.local` 配置）。
- 提供重试按钮。

## 路由级反馈页

`src/app/error.tsx`、`src/app/loading.tsx`、`src/app/not-found.tsx` 是 Next.js App Router 的全局反馈页：

- `error.tsx`：路由错误边界，展示错误信息与重试入口。
- `loading.tsx`：路由级加载占位。
- `not-found.tsx`：404 提示页（头像调试页在生产环境也通过 `notFound()` 落到该页）。

## 相关页面

- [前端概览](./overview.md)
- [配置](./config.md)
