---
type: backend
title: 上下文压缩管理器
description: app/services/context/manager.py 中 token 估算与 compress_messages：超过 context_window 30% 阈值时保留全部 system 消息与最近 N 条对话，并插入静态压缩说明。
tags: [context, compression, llm, memory, long-context]
---

# 上下文压缩管理器

`app/services/context/manager.py` 实现长上下文面试的**无 LLM 调用**压缩策略：当消息估算 token 超过预算阈值时，丢弃较早的 user/assistant 对话，仅保留全部 system 消息与最近若干条对话，并追加一条静态说明消息。

## 关键符号

```python
def estimate_tokens(text: str) -> int: ...
def estimate_messages_tokens(messages: list[dict[str, Any]]) -> int: ...
def compress_messages(
    messages: list[dict[str, Any]],
    max_tokens: int,
    *,
    keep_recent: int = 20,
    threshold: float = 0.3,
) -> list[dict[str, Any]]: ...
```

注意：`compress_messages` 的签名是 `(messages, max_tokens, *, keep_recent, threshold)`，**不接收 llm_client，也不调用 LLM 生成摘要**。

## Token 估算

- `estimate_tokens`：中文约 1.5 字符/token（`max(1, len(text) // 1.5)`），仅供预算检查，不追求与具体 tokenizer 完全一致。
- `estimate_messages_tokens`：逐条累加；`content` 为 list 时（多模态消息）逐项提取 `text` 片段累加，`None` 跳过。

## 触发阈值

当 `estimate_messages_tokens(messages) > max_tokens * threshold`（默认 30%）时触发压缩：

```python
total = estimate_messages_tokens(messages)
if total <= max_tokens * threshold:
    return messages  # 不压缩
```

## 压缩策略

1. **总是保留所有 `system` 消息**（面试规则、追问引导等不可丢失）。
2. 其余 user/assistant 对话仅保留最近 `keep_recent`（默认 20）条。
3. 在 system 段末尾**追加一条静态 system 说明**，让 LLM 知道上下文被截断：

```python
{
    "role": "system",
    "content": "[上下文压缩] 早期 N 条对话已省略，保留最近 M 条。",
}
```

## 与结构化记忆的关系

`InterviewAgent.refresh_system_memory()` 只替换 system prompt 中的记忆段落（已问问题、薄弱点、GitHub 发现），不重建整个 prompt。由于压缩保留全部 system 消息，结构化记忆在压缩后仍然完整，避免重复提问与遗漏追问。压缩本身不生成任何 LLM 摘要。

## 聚焦测试

- `backend/tests/test_context_compress.py`：压缩触发、system 保留、最近 N 条保持、多模态消息计数。

## 相关页面

- [InterviewAgent](./interview/agent.md)
- [PromptAssembler](./interview/prompts.md)
- [LLM 客户端](./llm-client.md)
