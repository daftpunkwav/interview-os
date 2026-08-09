---
type: frontend
title: 面试官头像
description: InterviewerAvatar（CSS/SVG 矢量）与 TalkingHeadAvatar（3D GLB 回退）的实现与情绪/音频驱动接口。
tags: [frontend, avatar, svg, 3d, talkinghead, lip-sync]
---

# 面试官头像

## InterviewerAvatar（默认）

`src/features/avatar/InterviewerAvatar.tsx`：

- 纯 CSS/SVG 矢量半身面试官，无需外部图片资源。
- 支持 6 套头像配置（如 `professional_male`, `gentle_female` 等）与 6 个场景。
- 唇同步由 `audioLevel`（0–1）驱动。
- 情绪（`emotion`）驱动眉毛、眼睛、嘴型变化。
- 场景切换通过 `scene_id` 选择背景/氛围。

### 配置接口

```typescript
export const AVATAR_PROFILES = {
  professional_male: { ... },
  gentle_female: { ... },
  // ...
};

export const SCENES = {
  meeting_room: { ... },
  // ...
};
```

## TalkingHeadAvatar（可选）

`src/features/avatar/TalkingHeadAvatar.tsx`：

- 懒加载 `@met4citizen/talkinghead` 和 GLB 模型文件。
- 将后端情绪映射到 TalkingHead 的 mood；不支持的 mood 回退为 `neutral`。
- WebGL 失败或不支持时回退到 `InterviewerAvatar`。
- 提供 `prefetchAvatarGlb` 用于在准备页预加载模型。

### 映射

```typescript
const EMOTION_TO_MOOD = {
  smile: "happy",
  neutral: "neutral",
  serious: "serious",
  // ...
};
```

`audioLevel` 同样驱动 TalkingHead 的嘴型。

## 选择逻辑

面试页面默认使用 `InterviewerAvatar`（配置简单、无需下载模型）。如果设置页或场景选择启用 3D 头像，则加载 `TalkingHeadAvatar`；加载失败自动回退 2D。

## 与后端情绪的对接

后端 `agent_text.detect_emotion` 从 `(emotion:xxx)` 标记提取情绪，随 `assistant_done` 事件下发。前端情绪映射：

- `smile` → 开心
- `neutral` → 平静
- `serious` → 严肃
- `nervous` → 紧张（较少用于面试官）
- 未知 → 回退 neutral

## 与场景的关系

`scene_id` 影响背景颜色、氛围、可能的粒子/灯光效果。`InterviewerAvatar` 内部根据 `SCENES` 渲染不同背景。

## 开发调试页（avatar-debug）

`src/app/avatar-debug/page.tsx` 是仅开发环境可访问的实机调试路由：并排渲染三个真实 `TalkingHeadAvatar`（`professional_male` / `strict_expert` / `gentle_female`，场景 `meeting_room`），用于验证 3D 人像加载与 React Strict Mode 竞态。生产构建（`NODE_ENV=production`）下该路由调用 `notFound()` 返回 404。

## 相关页面

- [媒体管道](./media-pipeline.md)
- [前端面试室](./pages/interview-room.md)
- [后端 agent_text 情绪检测](../backend/services/interview/prompts.md)
