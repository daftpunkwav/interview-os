---
type: backend
title: 启动种子
description: app/services/seed.py 中 idempotent 的 LLMSettings 默认记录初始化。
tags: [seed, startup, llm-settings]
---

# 启动种子

`app/services/seed.py` 在应用启动时确保 `LLMSettings` 表存在 id=1 的默认记录，幂等执行。

## 关键符号

- `seed_llm_settings(db)`
- 如果 `LLMSettings` 表为空，则创建 id=1 记录，填充默认值
- 已存在记录则不覆盖（避免重置用户配置）

## 调用时机

`app/main.py` 的 `lifespan` 在 `_bootstrap_db_and_seed()` 中调用，同步执行在线程池中完成：

```python
await asyncio.to_thread(_bootstrap_db_and_seed)
```

## 默认值来源

默认值来自 `app.config.Settings` 的字段默认值，如：

- `api_base = "https://api.openai.com/v1"`
- `model = "gpt-4o"`
- `provider = "openai"`
- `speech_recognize_handler = "local"`
- `speech_speak_handler = "edge"`

## 相关页面

- [后端入口](../main.md)
- [应用配置](../config.md)
- [LLMSettings 模型](../models.md)
