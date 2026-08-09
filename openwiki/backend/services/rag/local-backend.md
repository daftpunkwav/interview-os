---
type: 后端模块
title: 本地 Chroma RAG 后端
description: app/services/rag/local_backend.py 使用 Chroma PersistentClient 与 LLM 的 OpenAI 兼容 /embeddings 构建企业知识库索引，并通过 query / query_for_company 检索。
tags: [rag, chroma, local, embeddings]
openwiki:
  roles: [domain, integration]
  source_paths:
    - backend/app/services/rag/local_backend.py
    - backend/app/services/rag/_kb_data.py
  symbols: [LocalEmbeddingRAG]
  test_paths: [backend/tests/test_rag_backends.py]
---

# 本地 Chroma RAG 后端

`LocalEmbeddingRAG` 是默认 RAG 后端：本地 Chroma 持久化向量 + LLM 提供商的 OpenAI 兼容 `/embeddings`。

## 关键符号与方法

- `class LocalEmbeddingRAG`（实现 `RAGBackend`）
- `kind = RAGBackendKind.LOCAL`
- `ensure_index()` / `is_empty()`
- `query(query_text, *, top_k=3, company_id=None)` → `list[dict]`
- `query_for_company(query_text, company_id, *, top_k=4)` → `list[dict]`

命中字典字段：`text` / `metadata` / `distance`。不可用时返回 `[]`。

## 数据与索引

- 集合名与文档构建来自 `_kb_data.py`（如 `company_interview_kb`，cosine）。
- Chroma 持久化目录通常在 `backend/data/chroma`（与 SQLite 数据目录同级）。
- `ensure_index` / `build_index` 调用 `LLMClient.embed(texts)` 写入向量；已有索引时可跳过重复构建。

## Embedding 调用

使用 `Settings.effective_embeddings_*`（独立 embedding 配置优先，否则回退主 LLM BYOK）。兼容 OpenAI、DeepSeek、SiliconFlow、Moonshot、GLM 等 `/embeddings` 接口。

## 检索过滤

上层 `ToolRoundRunner.maybe_retrieve_rag` 在拿到 hits 后还会丢弃 `distance >= 0.5` 的弱匹配，再用 `_kb_data.format_context` 格式化为 system 消息。

## 聚焦测试

- `tests/test_rag_backends.py`：索引、检索、格式化、失败回退
- `tests/test_rag.py`：面试路径注入

## 相关页面

- [RAG 协议与工厂](./protocol.md)
- [KB 数据层](./kb-data.md)
- [RAG 概览](./overview.md)
- [StepFun 后端](./stepfun-backend.md)
