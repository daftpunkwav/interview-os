"""企业面试知识库 RAG。

设计：
- 数据源：``services.company.knowledge.BUILTIN_COMPANIES`` 内置 7 家公司
- 存储：Chroma（嵌入式、持久化到 backend/data/chroma）
- 嵌入模型：复用 ``LLMClient.embed``，与 BYOK 配置一致
- 切片策略：每家公司按维度切片（风格 / 重点领域 / 样题 / 流程 / 压力等级），
  便于按意图精确检索
- 索引构建：进程启动时若检测到空集合则构建一次；后续手工触发重建
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from app.services.company.knowledge import BUILTIN_COMPANIES
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)


def _data_dir() -> Path:
    """Chroma 持久化目录。"""
    # 与 SQLite 数据库同目录
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


class CompanyKnowledgeRAG:
    """公司面试知识库 RAG 封装。"""

    def __init__(self, llm: LLMClient | None = None):
        import chromadb
        from chromadb.config import Settings

        self._llm = llm
        self._client = chromadb.PersistentClient(
            path=str(_data_dir()),
            settings=Settings(anonymized_telemetry=False, allow_reset=True),
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    def is_empty(self) -> bool:
        return self._collection.count() == 0

    async def build_index(self, force: bool = False) -> int:
        """构建（首次）或重建索引。

        Args:
            force: 为 True 时清空已有索引。

        Returns:
            写入的文档数。
        """
        if force and self._collection.count() > 0:
            self._delete_all()

        if self._collection.count() > 0:
            logger.info("RAG 索引已存在，跳过构建")
            return self._collection.count()

        texts, metadatas, ids = _build_documents()
        if self._llm is None:
            raise RuntimeError("首次构建 RAG 索引需要提供 LLMClient 以调用 embed()")

        logger.info("构建 RAG 索引：%d 条文档", len(texts))
        # 分批嵌入，避免单次请求过大
        embeddings = await self._llm.embed(texts)
        self._collection.add(
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )
        return len(texts)

    async def ensure_index(self) -> None:
        """确保索引存在（用于启动时）。若为空则尝试构建，失败也不抛错。"""
        if self.is_empty():
            try:
                await self.build_index(force=False)
            except Exception as e:
                logger.warning("RAG 索引构建失败，将保持空状态: %s", e)

    async def query(
        self,
        query_text: str,
        *,
        top_k: int = 3,
        company_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """检索与查询最相关的文档片段。

        Args:
            query_text: 查询文本（候选人问题或面试上下文）。
            top_k: 返回结果数。
            company_id: 可选限定公司 ID。

        Returns:
            包含 ``text`` / ``metadata`` / ``distance`` 的字典列表。
        """
        if self._collection.count() == 0:
            logger.warning("RAG 索引为空，跳过检索")
            return []

        if self._llm is None:
            raise RuntimeError("RAG 检索需要 LLMClient 用于 query embedding")

        query_emb = (await self._llm.embed([query_text]))[0]
        kwargs: dict[str, Any] = {
            "query_embeddings": [query_emb],
            "n_results": top_k,
        }
        if company_id:
            kwargs["where"] = {"company_id": company_id}

        result = self._collection.query(**kwargs)
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]

        return [
            {
                "text": doc,
                "metadata": meta or {},
                "distance": dist,
            }
            for doc, meta, dist in zip(documents, metadatas, distances)
        ]

    async def query_for_company(
        self,
        query_text: str,
        company_id: str,
        *,
        top_k: int = 4,
    ) -> list[dict[str, Any]]:
        """限定公司检索（面试回合注入用）。"""
        return await self.query(query_text, top_k=top_k, company_id=company_id)

    def _delete_all(self) -> None:
        # 通过删除并重建实现
        try:
            self._client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )


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


__all__ = ["CompanyKnowledgeRAG", "format_context"]