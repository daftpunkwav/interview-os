---
type: backend
title: Prompt 构建与文本清理
description: app/services/interview/agent_prompts.py、prompt_assembler.py、agent_text.py 中 system prompt、用户消息、标记剥离、思考块过滤与情绪检测。
tags: [interview, prompt, llm, text-sanitization, emotion]
---

# Prompt 构建与文本清理

## 文件职责

| 文件 | 职责 |
|---|---|
| `agent_prompts.py` | `build_system_prompt()`：根据配置、简历、公司、工作流、阶段构建完整 system prompt |
| `prompt_assembler.py` | `PromptAssembler`：构造用户消息、附加人脸分析、多模态图片、上下文压缩 |
| `agent_text.py` | 文本工具：标记检测、思考块剥离、情绪检测、ThinkStreamFilter |

## build_system_prompt 输入

- `InterviewConfig`：岗位、职级、公司、工作流、人格、风格、严格度
- `CandidateProfile`：解析后的简历（可选）
- `UserProfile`：用户档案（可选）
- 公司上下文：来自 `get_company_context`
- 当前阶段 `PhaseDef`
- 可选 `followup_probe`：追问提示

## 输出规则

system prompt 明确要求 LLM：

- 一次只问一个问题
- 不使用 emoji
- 阶段结束输出 `[PHASE_COMPLETE]`
- 整场结束输出 `[INTERVIEW_COMPLETE]`
- 情绪标记在回复末尾如 `(emotion:smile)`
- 可用 function tools：GitHub / 公司 / 简历 / 搜索

## 用户消息组装

`PromptAssembler.build_user_content` 将候选人文本与人脸分析拼接：

```text
候选人回答：{text}

面部状态：dominant_emotion=smile, eye_contact=true, ...
```

`build_api_messages` 支持：

- 追加当前 user text
- 附加 `image_base64` 作为多模态 message
- 调用 `compress_messages` 进行上下文压缩

## 文本清理工具

- `strip_markers(text)`：移除 `[PHASE_COMPLETE]` / `[INTERVIEW_COMPLETE]`
- `strip_think_blocks(text)`：移除 `<think>...</think>`
- `ThinkStreamFilter`：流式过滤思考块，按 token 边界处理
- `detect_emotion(text)`：从 `(emotion:xxx)` 提取情绪，默认 `neutral`

## 聚焦测试

- `tests/test_agent_prompts.py`：system prompt 结构、字段注入、工具声明。
- `tests/test_runner.py`：标记剥离、情绪检测、思考块过滤。

## 相关页面

- [InterviewAgent](./agent.md)
- [StreamingConsumer](./streaming.md)
- [LLM 客户端](../llm-client.md)
- [工作流](./workflows.md)
