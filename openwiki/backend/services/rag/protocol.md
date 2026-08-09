---
type: 后端模块
title: RAGBackend 协议与工厂
description: app/services/rag/base.py 的 RAGBackend 协议（ensure_index / is_empty / query / query_for_company）与 factory.py 的 build_rag_backend 选型逻辑。
tags: [rag, protocol, factory, backend]
openwiki:
  roles: [architecture, domain]
  source_paths:
    - backend/app/services/rag/base.py
    - backend/app/services/rag/factory.py
  symbols: [RAGBackend, build_rag_backend, _NullRAG]
  test_paths:
    - backend/tests/test_rag_backends.py
    - backend/tests/test_rag.py
---

# RAGBackend 协议与工厂

## RAGBackend 协议

`app/services/rag/base.py` 定义统一接口（`@runtime_checkable`）：

```python
class RAGBackend(Protocol):
    kind: RAGBackendKind

    async def ensure_index(self) -> None: ...
    def is_empty(self) -> bool: ...
    async def query(
        self, query_text: str, *, top_k: int = 3, company_id: str | None = None
    ) -> list[dict[str, Any]]: ...
    async def query_for_company(
        self, query_text: str, company_id: str, *, top_k: int = 4
    ) -> list[dict[str, Any]]: ...
```

契约要点：

- 命中元素至少包含 `text` / `metadata` / `distance`。
- 检索不可用时返回 **空列表**，不抛异常，以免阻断面试主流程。
- 必须声明 `kind`，供日志与工厂选择。

> 注意：协议方法名是 `query` / `query_for_company`，不是历史文档中的 `retrieve`；也没有通用的 `as_tool` 协议方法。StepFun 后端在实现类上额外提供 `build_retrieval_tool()`。

## 工厂 `build_rag_backend(llm, settings)`

`factory.py` 根据 `settings.rag_backend`：

| `RAGBackendKind` | 实现 | 行为摘要 |
|---|---|---|
| `NONE` | `_NullRAG` | `is_empty` 恒 True，`query*` 永返 `[]` |
| `STEPFUN` | `StepFunRetrievalRAG` | 托管 vector_store；本地 `query*` 空，chat 注入 retrieval tool |
| `LOCAL`（默认） | `LocalEmbeddingRAG` | Chroma + OpenAI 兼容 `/embeddings` |

`_NullRAG` 便于生产或调试时关闭企业知识库。

## 失败隔离

- `ensure_index` 失败倾向 warn，不致命；`CompanyKnowledgeRAG.ensure_index` 捕获异常。
- `query*` 失败返回 `[]`。
- 上层 `ToolRoundRunner.maybe_retrieve_rag` 再过滤弱匹配（`distance < 0.5`）。

## 新增后端步骤

1. 在 `app/services/rag/<name>_backend.py` 实现 `RAGBackend` 协议：声明 `kind`，实现 `ensure_index` / `is_empty` / `query` / `query_for_company`；检索不可用时返回 `[]` 而非抛异常。
2. 在 `factory.build_rag_backend` 中按 `settings.rag_backend` 新增分支返回该实现（`_NullRAG` 为 `NONE` 的占位：`ensure_index` no-op、`is_empty` 恒 True、`query*` 永返 `[]`）。
3. 调用方（`InterviewRunner` / `ToolRoundRunner`）无需任何改动。

协议类标注 `@runtime_checkable`，模块导出 `__all__ = ["RAGBackend"]`。

## 相关页面

- [RAG 概览](./overview.md)
- [本地后端](./local-backend.md)
- [StepFun 后端](./stepfun-backend.md)
- [KB 数据层](./kb-data.md)
- [CompanyKnowledgeRAG 包装](./company-rag.md)
