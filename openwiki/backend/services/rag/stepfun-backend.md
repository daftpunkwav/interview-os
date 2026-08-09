---
type: backend
title: StepFun 托管 RAG 后端
description: app/services/rag/stepfun_backend.py 中 StepFun vector_store 上传与 chat tools retrieval 的 RAG 后端实现。
tags: [rag, stepfun, vector-store, retrieval]
---

# StepFun 托管 RAG 后端

`StepFunRetrievalRAG` 使用 StepFun 平台托管的 `vector_stores` 与 chat 中的 `tools[].type=retrieval` 完成检索。适用于不想在本地维护 Chroma 与 embeddings 模型的部署。

## 关键符号

- `class StepFunRetrievalRAG`
- `ensure_index()`：上传 KB 文档到 StepFun vector_store（幂等复用已有 store）
- `retrieve(query, top_k=3)`：通过 LLM chat 调用 retrieval 工具获取片段
- `as_tool()`：返回 StepFun 风格的 retrieval 工具定义

## 配置

- `Settings.rag_backend = "stepfun"`
- `Settings.stepfun_vector_store_id`：可选；留空时启动自动创建并复用

## 上传流程

1. 从 `_kb_data._build_documents()` 获取 7 家公司文档。
2. 按 StepFun API 要求切分并上传。
3. 记录 `vector_store_id` 供后续使用。

## 检索流程

StepFun 的 retrieval 在 chat 调用时由服务端完成，客户端在 messages 中附加 `tools` 定义即可。因此 `retrieve` 的实现会调用一次 LLM chat 并解析返回的检索片段。

## 与本地后端的差异

| 维度 | Local | StepFun |
|---|---|---|
| 向量存储 | 本地 Chroma | StepFun 云端 |
| Embeddings | 调用 LLM /embeddings | StepFun 内部 |
| 检索触发 | 直接 Chroma query | 通过 chat tools retrieval |
| 依赖 | chromadb, 本地磁盘 | StepFun API Key |

## 聚焦测试

- `tests/test_rag_backends.py`：StepFun 后端上传、检索、工具定义。

## 相关页面

- [RAG 协议与工厂](./protocol.md)
- [KB 数据层](./kb-data.md)
- [RAG 概览](./overview.md)
