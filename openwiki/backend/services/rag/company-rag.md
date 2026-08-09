---
type: backend
title: CompanyKnowledgeRAG 包装器
description: app/services/rag/company_rag.py 向后兼容的 RAG 包装器，委托工厂选出的后端。
tags: [rag, company, wrapper, compatibility]
---

# CompanyKnowledgeRAG 包装器

`CompanyKnowledgeRAG` 是早期代码中直接使用的 RAG 类。当前实现委托 `factory.build_rag_backend` 选出的具体后端，保留旧 API 以兼容已有测试和调用点。

## 关键符号

- `class CompanyKnowledgeRAG`
- `ensure_index()` → 委托后端 `ensure_index`
- `retrieve(query, top_k=3)` → 委托后端 `retrieve`
- `as_tool()` → 委托后端 `as_tool`

## 使用位置

- `app/main.py` 的 `lifespan` 中启动索引构建。
- `app/services/interview/runner.py` 中可注入 RAG 实例。
- `app/services/interview/tools.py` 中 `company_style_lookup` 工具可能使用。

## 新代码建议

新代码优先直接使用 `factory.build_rag_backend(Settings.rag_backend, llm)` 获取 `RAGBackend` 实例，减少对 `CompanyKnowledgeRAG` 的依赖。旧调用点逐步迁移。

## 相关页面

- [RAG 协议与工厂](./protocol.md)
- [RAG 概览](./overview.md)
