"""企业面试知识库 RAG(向后兼容包装器)。

模块历史：

- 早期版本：:class:`CompanyKnowledgeRAG` 直接管理 Chroma + 嵌入流程；
- 自 M5 起：拆分为 :class:`LocalEmbeddingRAG`(本地 Chroma)、
  :class:`StepFunRetrievalRAG`(StepFun 托管) 与 :func:`build_rag_backend` 工厂。

本模块现在仅承担三件事：

1. 保留 :data:`COLLECTION_NAME` 与 :func:`_build_documents` / :func:`_data_dir`
   给 :class:`LocalEmbeddingRAG` 与现有测试复用；
2. :class:`CompanyKnowledgeRAG` 作为薄包装转发到工厂选出的后端,
   公共 API(``ensure_index`` / ``query`` / ``query_for_company`` / ``is_empty``
   等)与早期版本完全一致；
3. :func:`format_context` 是与具体后端无关的纯字符串格式化函数,
   仍在公共位置提供。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.services.company.knowledge import BUILTIN_COMPANIES

logger = logging.getLogger(__name__)


def _data_dir() -> Path:
    """Chroma 持久化目录。"""
    from app.config import get_settings

    settings = get_settings()
    db_path = settings.database_url.replace("sqlite:///", "")
    if db_path and not db_path.startswith(":"):
        chroma_dir = Path(db_path).parent / "chroma"
    else:
        chroma_dir = Path(__file__).resolve().parent.parent.parent / "data" / "chroma"
    chroma_dir.mkdir(parents=True, exist_ok=True)
    return chroma_dir


COLLECTION_NAME = "company_interview_kb"


def _build_documents() -> tuple[list[str], list[dict[str, Any]], list[str]]:
    """将 BUILTIN_COMPANIES 展开为 Chroma 三元组 (texts, metadatas, ids)。"""
    texts: list[str] = []
    metadatas: list[dict[str, Any]] = []
    ids: list[str] = []

    for company in BUILTIN_COMPANIES:
        cid = company["id"]
        # 切片 1：总体风格
        texts.append(
            f"{company['name']}（{cid}）面试风格：{company['style']}。"
            f"压力等级：{company['pressure_level']}。"
        )
        metadatas.append({
            "company_id": cid,
            "company_name": company["name"],
            "section": "style",
        })
        ids.append(f"{cid}::style")

        # 切片 2：重点领域
        texts.append(
            f"{company['name']}考察重点领域：{', '.join(company['focus_areas'])}。"
        )
        metadatas.append({
            "company_id": cid,
            "company_name": company["name"],
            "section": "focus_areas",
        })
        ids.append(f"{cid}::focus_areas")

        # 切片 3：典型问题（每题一片）
        for idx, q in enumerate(company["sample_questions"]):
            texts.append(
                f"{company['name']}典型面试问题示例：{q}"
            )
            metadatas.append({
                "company_id": cid,
                "company_name": company["name"],
                "section": "sample_question",
                "question_index": idx,
            })
            ids.append(f"{cid}::q::{idx}")

        # 切片 4：面试流程
        texts.append(
            f"{company['name']}典型面试流程：{company['interview_flow']}"
        )
        metadatas.append({
            "company_id": cid,
            "company_name": company["name"],
            "section": "interview_flow",
        })
        ids.append(f"{cid}::flow")

    return texts, metadatas, ids


def format_context(hits: list[dict[str, Any]]) -> str:
    """把检索结果格式化为可注入 LLM prompt 的中文上下文片段。"""
    if not hits:
        return ""
    lines = ["## 企业知识库检索补充"]
    for i, hit in enumerate(hits, 1):
        meta = hit.get("metadata", {})
        section = meta.get("section", "")
        text = hit.get("text", "")
        lines.append(f"{i}. [{section}] {text}")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────
# 向后兼容包装器
# ──────────────────────────────────────────────────────────────────


class _LegacyChromaStub:
    """``CompanyKnowledgeRAG(llm=None)`` 用的最小占位实现。

    早期版本的 ``CompanyKnowledgeRAG(llm=None)`` 仅创建 Chroma 集合、不调用
    embed。测试用 fixture 在此场景下直接接管 ``_collection`` / ``_client``,
    因此这里只需满足属性存在。
    """

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
    """企业知识库 RAG 的向后兼容包装器。

    所有公开方法（``ensure_index`` / ``query`` / ``query_for_company`` /
    ``is_empty``）委托给工厂选出的 :class:`RAGBackend`。当 ``llm=None``
    时（仅测试场景）保持早期行为：返回 ``_LegacyChromaStub``,由测试 fixture
    直接接管 ``_collection`` 等属性。

    兼容策略：``_llm`` / ``_client`` / ``_collection`` / ``kind`` 既可读
    也可写。写入时同步到 ``_impl``,从而保留 ``rag._client = ...`` /
    ``rag._collection = ...`` 这类历史测试用法。
    """

    _FORWARD_ATTRS = ("kind", "_llm", "_client", "_collection")

    def __init__(self, llm=None):  # type: ignore[no-untyped-def]
        from app.config import get_settings
        from app.services.rag.factory import build_rag_backend

        settings = get_settings()

        if llm is None:
            self._impl: Any = _LegacyChromaStub()
        else:
            self._impl = build_rag_backend(llm=llm, settings=settings)

    # ── 协议层属性透传(支持读写)──────────────────────────────
    def __getattr__(self, name: str) -> Any:
        # ``__getattr__`` 只在常规查找失败时触发;直接走 _impl。
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

    # ── 协议层方法透传 ──────────────────────────────────────
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