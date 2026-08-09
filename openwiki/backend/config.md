---
type: backend
title: 应用配置 Settings
description: app/config.py 中全局环境变量、交叉验证、计算属性与 env 别名设计。
tags: [config, settings, env, pydantic]
---

# 应用配置

`app/config.py` 通过 `pydantic-settings` 加载环境变量与 `.env` 文件，是后端唯一的全局配置源。

## 关键符号

- `class Settings(BaseSettings)`
- `get_settings()` — LRU 缓存单例
- 安全相关字段同时接受无前缀与 `INTERVIEWOS_` 前缀别名（如 `CORS_ORIGINS` / `INTERVIEWOS_CORS_ORIGINS`）

## 主要字段分组

| 分组 | 字段示例 | 说明 |
|---|---|---|
| LLM BYOK | `llm_api_base`, `llm_api_key`, `llm_model`, `llm_max_tokens`, `llm_context_window` | 思考 LLM 默认回退 |
| 嵌入 | `llm_embeddings_base/key/model` | 为空时回退到 LLM BYOK 配置 |
| RAG 后端 | `rag_backend` (`local/stepfun/none`), `stepfun_vector_store_id` | 见 [rag/overview](services/rag/overview.md) |
| 服务 | `database_url`, `upload_dir`, `cors_origins`, `host`, `port`, `env` | SQLite 默认路径在 `backend/data/` |
| 语音 | `whisper_model`, `tts_voice`, `silence_nudge_seconds` | 仅作回退；正式指派在设置页 |
| GitHub/工具 | `github_token`, `interview_tools_enabled`, `interview_max_tool_rounds` | 工具循环开关与上限 |
| 安全 | `allow_local_llm`, `trusted_proxy_cidrs`, `cookie_secure` | 生产级约束 |

## 计算属性

- `is_prod`：`env.strip().lower() == "prod"`
- `cors_origin_list`：逗号拆分并去空白
- `effective_embeddings_base/key/model`：独立配置优先，否则回退主 LLM

## 交叉验证

```python
if self.is_prod and self.allow_local_llm:
    raise ValueError("生产环境不允许 allow_local_llm=True")
```

StepFun 后端未配置 vector_store_id 时仅打 warning，不阻断启动（启动时会自动创建）。

## 与前端环境的关系

前端 `frontend/.env.local` 主要设置 `NEXT_PUBLIC_API_BASE`、`NEXT_PUBLIC_WS_URL` 等；后端密钥类配置不暴露给前端。`allow_local_llm` 与 `CORS_ORIGINS` 的 prod 策略必须前后端一致。

## 相关页面

- [后端入口](./main.md)
- [核心安全](./core/security.md)
- [RAG 概览](services/rag/overview.md)
