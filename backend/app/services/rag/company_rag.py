"""企业面试知识库 RAG（向后兼容包装器）。

模块职责（单一职责）：

1. :class:`CompanyKnowledgeRAG` — 薄包装，委托工厂选出的 :class:`RAGBackend`；
2. 向后兼容：当 ``llm=None``（测试场景）时提供 ``_LegacyChromaStub``。

纯数据/工具函数（:func:`_build_documents`、:func:`_data_dir`、
:func:`format_context`、:data:`COLLECTION_NAME`）已迁移到
:mod:`app.services.rag._kb_data`，避免循环导入。
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.rag._kb_data import COLLECTION_NAME, _build_documents, _data_dir, format_context
from app.services.rag.factory import build_rag_backend

logger = logging.getLogger(__name__)


class _LegacyChromaStub:
    """``CompanyKnowledgeRAG(llm=None)`` 用的最小占位实现。"""

    kind = None  # type: ignore[assignment]
    _llm = None
    _client = None
    _collection = None

    async def ensure_index(self) -> None:
        return None

    def is_empty(self) -> bool:
        if self._collection is None:
            return True
        return self._collection.count() == 0


class CompanyKnowledgeRAG:
    """企业知识库 RAG 向后兼容包装器。

    公开方法委托给工厂选出的 :class:`RAGBackend`。
    """

    _FORWARD_ATTRS = ("kind", "_llm", "_client", "_collection")

    def __init__(self, llm=None):  # type: ignore[no-untyped-def]
        from app.config import get_settings

        settings = get_settings()

        if llm is None:
            self._impl: Any = _LegacyChromaStub()
        else:
            self._impl = build_rag_backend(llm=llm, settings=settings)

    def __getattr__(self, name: str) -> Any:
        impl = object.__getattribute__(self, "_impl")
        return getattr(impl, name)

    def __setattr__(self, name: str, value: Any) -> None:
        if name in self._FORWARD_ATTRS:
            try:
                impl = object.__getattribute__(self, "_impl")
            except AttributeError:
                object.__setattr__(self, name, value)
                return
            setattr(impl, name, value)
            return
        object.__setattr__(self, name, value)

    async def ensure_index(self) -> None:
        await self._impl.ensure_index()

    def is_empty(self) -> bool:
        return self._impl.is_empty()

    async def query(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        return await self._impl.query(*args, **kwargs)

    async def query_for_company(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        return await self._impl.query_for_company(*args, **kwargs)


__all__ = [
    "CompanyKnowledgeRAG",
    "COLLECTION_NAME",
    "format_context",
    "_build_documents",
    "_data_dir",
]
