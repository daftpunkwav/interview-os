---
type: frontend
title: 设置页面
description: src/app/settings/page.tsx 中 BYOK 三处理器（ASR/LLM/TTS）配置、供应商目录、阶段测试与密钥保存。
tags: [frontend, page, settings, byok, asr, llm, tts]
---

# 设置页面

`src/app/settings/page.tsx` 允许用户分别配置面试的三个处理器：

- **阶段1 识别（ASR）**：本地 Whisper 或云端 ASR 厂商
- **阶段2 思考（LLM）**：必须是 OpenAI 兼容的文本模型
- **阶段3 播报（TTS）**：Edge TTS（默认）或 MiniMax 等云端 TTS，或仅字幕

## 关键符号

- `SettingsPage`
- `StageSection`：单个处理器配置卡片
- `ProviderPicker`：供应商选择
- `CapabilityBadges`：能力标签展示
- `Field`：表单字段封装

## 数据流

1. 页面加载时调用 `api.getVoiceCatalog()` 与 `api.getLLMSettings()`。
2. 根据目录渲染供应商与字段。
3. 用户填写后点击保存，调用 `api.updateLLMSettings(settings)`。
4. 密钥字段使用占位符；`_SECRET_KEEP` 表示不修改。

## 三阶段测试

每个阶段旁有「测试」按钮：

- **测试识别**：发送标准 wav fixture，返回转写文本。
- **测试思考**：发送短文本，返回 LLM 响应。
- **测试播报**：生成短音频并播放。

对应后端端点 `POST /api/v1/settings/test/{stage}`。

## 密钥安全

- 前端不保存原始 API Key（只通过表单提交）。
- 后端加密后存储，读取时只返回 `has_*` 布尔。
- 表单字段在未修改时显示 `********` 等占位符，提交时若保持占位符则发送 `_SECRET_KEEP`。

## 相关页面

- [后端 API 设置端点](../../backend/api/settings.md)
- [后端 Voice 目录](../../backend/services/voice.md)
- [后端 STT](../../backend/services/stt.md)
- [后端 TTS](../../backend/services/tts.md)
- [后端 LLM 客户端](../../backend/services/llm-client.md)
