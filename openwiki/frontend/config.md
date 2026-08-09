---
type: frontend
title: 前端配置
description: src/config/* 中导航、阶段、供应商预设与准备快捷提示。
tags: [frontend, config, navigation, providers, phases]
---

# 前端配置

## src/config/nav.ts

侧边栏导航单一来源：

```typescript
export const NAV_ITEMS = [
  { href: "/", label: "首页", icon: "Home" },
  { href: "/profile", label: "档案", icon: "User" },
  { href: "/resume", label: "简历", icon: "FileText" },
  { href: "/prep", label: "准备", icon: "BookOpen" },
  { href: "/interview", label: "面试", icon: "Video" },
  { href: "/history", label: "历史", icon: "History" },
  { href: "/growth", label: "成长", icon: "TrendingUp" },
  { href: "/settings", label: "设置", icon: "Settings" },
];
```

`Sidebar.tsx` 使用 Lucide 图标名称字符串动态映射图标。

## src/config/phases.ts

阶段 ID 到中文名的离线回退映射：

```typescript
export const PHASE_LABELS: Record<string, string> = {
  identity_check: "身份确认",
  self_intro: "自我介绍",
  project_deep_dive: "项目深挖",
  ...
};
```

权威阶段元数据来自后端 `workflows.py` 并通过 `/api/v1/options` 的 `phase_labels` 下发。`phases.ts` 仅作为网络失败或首屏回退。

## src/config/providers.ts

BYOK LLM 供应商预设：

- OpenAI
- StepFun
- DeepSeek
- OpenRouter
- Custom

每个预设提供默认 `api_base`、`model` 列表。真实 URL 校验与 SSRF 防御在后端完成。

## src/config/prepPrompts.ts

准备页面的快捷提示按钮文案：

```typescript
export const PREP_QUICK_PROMPTS = [
  "帮我准备自我介绍",
  "针对我的简历提 5 个高频问题",
  ...
];
```

## 相关页面

- [布局与导航](./layout.md)
- [后端阶段工作流](../backend/services/interview/workflows.md)
- [后端 API 选项](../backend/api/options.md)
