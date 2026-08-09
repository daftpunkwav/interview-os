---
type: backend
title: 视觉 Agent（占位）
description: app/agents/vision/agent.py 中当前为 face_analysis 透传占位，未来可扩展多模态视觉分析。
tags: [agents, vision, face-analysis, placeholder]
---

# 视觉 Agent（占位）

`app/agents/vision/agent.py` 当前是一个轻量占位实现，仅接收前端 `VideoPanel` 捕获的 `face_analysis` 数据并透传给 `InterviewOrchestrator`。

## 关键符号

- `analyze(face_analysis: dict) -> dict`：直接返回输入或做最小字段校验

## FaceAnalysis 字段

`frontend/src/types/index.ts` 中定义：

- `face_detected`: bool
- `eye_contact`: bool
- `dominant_emotion`: string（如 smile, neutral, nervous）
- `nervousness`: float
- `looking_away`: bool

## 扩展方向

未来可在此模块扩展：

- 多帧聚合与趋势分析（如连续紧张、眼神游离）
- 基于 OpenCV 或更复杂模型的后端视觉分析
- 将分析结果直接写入 `agent_state` 或生成 `followup` 信号

当前所有视觉分析由前端 `VideoPanel` 使用浏览器 FaceDetector API 完成，每 3 秒采样一次。

## 相关页面

- [Orchestrator](./orchestrator.md)
- [前端 VideoPanel](../../frontend/media-pipeline.md)
- [前端面试室](../../frontend/pages/interview-room.md)
