---
type: frontend
title: 前端测试
description: vitest 配置、cnText 与 thinkStream 单元测试的职责。
tags: [frontend, testing, vitest, typescript]
---

# 前端测试

## 配置

`frontend/vitest.config.ts`：

- 使用 Vitest 作为测试运行器。
- 通常与 TypeScript 路径别名（`@/*`）兼容。

## 测试文件

### src/lib/cnText.test.ts

测试中文文本处理工具：

- 标点规范化（全角/半角）
- 段落分割
- 文本清理
- 简历评价文本解析相关辅助函数

### src/lib/thinkStream.test.ts

测试流式 `<think>...</think>` 思考块解析：

- 完整思考块提取
- 部分 token 流式累积
- 边界情况（未闭合、嵌套错误）
- 与后端 `ThinkStreamFilter` 行为对齐

## 运行方式

```bash
cd frontend
npm test
npm test -- --watch
```

## 类型检查

```bash
cd frontend
npx tsc --noEmit
```

`tsconfig.json` 启用 `noUncheckedIndexedAccess`，要求对所有数组/对象索引做显式 undefined 检查。

## 未来扩展

建议为以下组件/hook 补充测试：

- `useInterviewWS` 重连与事件分发逻辑
- `useAudioRecorder` 能量检测与重采样
- `useTTSPlayer` 队列与播放状态机
- 主要页面的表单校验与 API 调用

## 相关页面

- [前端概览](./overview.md)
- [API 客户端与类型](./api-client.md)
- [媒体管道](./media-pipeline.md)
