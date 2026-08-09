---
type: backend
title: RAG 服务概览
description: app/services/rag/* 中企业知识库 RAG 的协议、工厂、本地 Chroma 后端、StepFun 后端与 KB 数据层。
tags: [rag, knowledge-base, chroma, stepfun, retrieval]
---

# RAG 服务概览

RAG 模块负责在面试中检索公司面经/风格知识。设计为可插拔后端：本地 Chroma + 自建 embeddings，或 StepFun 托管的 vector_store retrieval。

## 文件结构

| 文件 | 职责 |
|---|---|
| `base.py` | `RAGBackend` 协议 |
| `factory.py` | `build_rag_backend` 按 `RAGBackendKind` 选型，`_NullRAG` 空实现 |
| `local_backend.py` | `LocalEmbeddingRAG`：Chroma + OpenAI 兼容 embeddings |
| `stepfun_backend.py` | `StepFunRetrievalRAG`：vector_store 上传 + retrieval 工具 |
| `_kb_data.py` | 纯数据层：7 家公司种子文档、collection 名、格式化 |
| `company_rag.py` | `CompanyKnowledgeRAG` 向后兼容包装器 |

## 后端选择

由 `Settings.rag_backend`（`RAGBackendKind.LOCAL` / `STEPFUN` / `NONE`）决定：

- `local`：本地 Chroma 持久化，调用 LLM 的 `/embeddings` 生成向量。
- `stepfun`：上传文档到 StepFun vector_store，chat 时通过 `tools[].type=retrieval` 由服务端检索。
- `none`：返回空上下文，不报错。

## 启动索引

`app/main.py` 的 `lifespan` 在启动时调用 `CompanyKnowledgeRAG(llm).ensure_index()`：

- 仅在 LLM API Key 已配置时执行。
- 失败不阻断启动，仅记录 warning。
- 异步执行在 `asyncio.to_thread` 中，避免阻塞事件循环。

## 在面试中的使用

`InterviewRunner._maybe_retrieve_rag(query)` 在 `stream_turn` 中可选注入 RAG 上下文。`tools.py` 也可能将 RAG 作为 `company_style_lookup` 工具暴露给 LLM。

## 聚焦测试

- `tests/test_rag.py`：基础 RAG 接口与上下文注入。
- `tests/test_rag_backends.py`：本地与 StepFun 后端完整测试。

## 相关页面

- [RAG 协议与工厂](./protocol.md)
- [本地 Chroma 后端](./local-backend.md)
- [StepFun 后端](./stepfun-backend.md)
- [KB 数据层](./kb-data.md)
- [CompanyKnowledgeRAG 包装器](./company-rag.md)
- [公司知识](../company-knowledge.md)
- [LLM 客户端](../llm-client.md)
