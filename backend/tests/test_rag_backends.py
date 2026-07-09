"""RAG 多后端抽象层与 StepFun 后端的契约测试。

设计要点：

- 不打真实 HTTP；通过 ``monkeypatch`` 替换 ``httpx.AsyncClient`` 观察
  StepFun 后端的请求 URL / payload 是否符合官方文档协议；
- 校验 :func:`build_rag_backend` 工厂选择逻辑；
- 校验 :class:`CompanyKnowledgeRAG` 包装器仍对外提供稳定 API。
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.config import Settings, get_settings
from app.core.constants import RAGBackendKind
from app.services.llm.client import LLMClient
from app.services.rag.base import RAGBackend
from app.services.rag.company_rag import CompanyKnowledgeRAG
from app.services.rag.factory import _NullRAG, build_rag_backend
from app.services.rag.local_backend import LocalEmbeddingRAG
from app.services.rag.stepfun_backend import (
    StepFunRetrievalRAG,
    _serialize_documents_to_jsonl,
)
from tests.fakes import FakeLLMClient


# ── 工厂选择 ──────────────────────────────────────


def _make_settings(**overrides: Any) -> Settings:
    base = {
        "llm_api_base": "https://api.stepfun.com/v1",
        "llm_api_key": "sk-test",
        "llm_model": "step-3.7-flash",
        "rag_backend": "local",
    }
    base.update(overrides)
    return Settings(**base)


def test_factory_returns_local_embedding_rag_by_default() -> None:
    s = _make_settings()
    rag = build_rag_backend(llm=FakeLLMClient(), settings=s)
    assert isinstance(rag, RAGBackend)
    assert rag.kind == RAGBackendKind.LOCAL
    assert isinstance(rag, LocalEmbeddingRAG)


def test_factory_returns_stepfun_backend_when_configured() -> None:
    s = _make_settings(rag_backend="stepfun")
    rag = build_rag_backend(llm=FakeLLMClient(), settings=s)
    assert isinstance(rag, StepFunRetrievalRAG)
    assert rag.kind == RAGBackendKind.STEPFUN


def test_factory_returns_null_rag_when_disabled() -> None:
    s = _make_settings(rag_backend="none")
    rag = build_rag_backend(llm=FakeLLMClient(), settings=s)
    assert isinstance(rag, _NullRAG)
    assert rag.kind == RAGBackendKind.NONE
    assert rag.is_empty() is True


# ── LocalEmbeddingRAG 契约 ──────────────────────────────────────


def test_local_embedding_rag_satisfies_protocol(tmp_path, monkeypatch) -> None:
    """使用 tmp_path 隔离 Chroma 目录,验证 LocalEmbeddingRAG 满足 RAGBackend 协议。"""
    from app.services.rag import company_rag

    monkeypatch.setattr(company_rag, "_data_dir", lambda: tmp_path / "chroma")
    rag = LocalEmbeddingRAG(llm=FakeLLMClient(), settings=_make_settings())
    assert isinstance(rag, RAGBackend)
    assert rag.is_empty() is True
    assert rag.kind == RAGBackendKind.LOCAL


# ── StepFunRetrievalRAG ──────────────────────────────────────


def test_stepfun_rag_unready_tool_returns_none() -> None:
    """vector_store 尚未就绪时,build_retrieval_tool 必须返 None,避免注入空工具。"""
    rag = StepFunRetrievalRAG(llm=FakeLLMClient(api_key="sk-test"), settings=_make_settings())
    assert rag.is_empty() is True
    assert rag.build_retrieval_tool() is None


def test_stepfun_rag_ready_tool_shape() -> None:
    rag = StepFunRetrievalRAG(llm=FakeLLMClient(api_key="sk-test"), settings=_make_settings())
    rag._vector_store_id = "171215831957549056"
    rag._ready = True
    tool = rag.build_retrieval_tool()
    assert tool is not None
    assert tool["type"] == "retrieval"
    assert tool["function"]["name"] == "company_kb"
    options = tool["function"]["options"]
    assert options["vector_store_id"] == "171215831957549056"
    assert "{{knowledge}}" in options["prompt_template"]
    assert "{{query}}" in options["prompt_template"]


def test_stepfun_rag_query_returns_empty_list() -> None:
    """StepFun 后端 query 必须返 [] —— 真实检索在 chat 时由服务端完成。"""
    rag = StepFunRetrievalRAG(llm=FakeLLMClient(api_key="sk-test"), settings=_make_settings())
    rag._ready = True
    rag._vector_store_id = "1712"
    # query/query_for_company 应返回空(对调用方无副作用)
    import asyncio

    async def _go() -> list[dict[str, Any]]:
        return await rag.query("anything", top_k=3, company_id="bytedance")

    hits = asyncio.run(_go())
    assert hits == []


def test_serialize_documents_to_jsonl_shape() -> None:
    """JSONL 序列化必须每行一个 JSON 对象,字段 text/metadata 齐全。"""
    raw = _serialize_documents_to_jsonl()
    lines = [ln for ln in raw.decode("utf-8").splitlines() if ln.strip()]
    assert len(lines) > 30
    for line in lines[:5]:
        obj = json.loads(line)
        assert "text" in obj and obj["text"]
        meta = obj["metadata"]
        assert meta.get("company_id")
        assert meta.get("section")


def test_stepfun_ensure_index_degrades_on_http_failure(monkeypatch) -> None:
    """ensure_index 在 HTTP 调用失败时应仅 warn,不抛出。"""
    import httpx

    rag = StepFunRetrievalRAG(llm=FakeLLMClient(api_key="sk-test"), settings=_make_settings())

    class _Boom:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            raise RuntimeError("network down")

        async def get(self, *a, **kw):
            raise RuntimeError("network down")

    monkeypatch.setattr(httpx, "AsyncClient", _Boom)
    import asyncio

    async def _go() -> None:
        await rag.ensure_index()

    asyncio.run(_go())
    assert rag.is_empty() is True
    assert rag._ready is False


def test_stepfun_ensure_index_uses_configured_vector_store_id(monkeypatch) -> None:
    """若 settings 已提供 STEPFUN_VECTOR_STORE_ID,应仅做 GET 校验,不创建。"""
    import httpx

    captured: dict[str, Any] = {"calls": []}

    class _StubResp:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {"id": "1712", "name": "kb"}

        def raise_for_status(self) -> None:
            return None

    class _StubClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, **kw):
            captured["calls"].append(("GET", url))
            return _StubResp()

        async def post(self, url, **kw):
            captured["calls"].append(("POST", url))
            return _StubResp()

    monkeypatch.setattr(httpx, "AsyncClient", _StubClient)

    settings = _make_settings(
        rag_backend="stepfun",
        stepfun_vector_store_id="171215831957549056",
    )
    rag = StepFunRetrievalRAG(llm=FakeLLMClient(api_key="sk-test"), settings=settings)
    import asyncio

    asyncio.run(rag.ensure_index())
    # 只应触发一次 GET(校验存在),不应触发 POST(创建)
    methods = [m for m, _ in captured["calls"]]
    assert "GET" in methods
    assert "POST" not in methods
    assert rag._ready is True


# ── CompanyKnowledgeRAG 包装器 ──────────────────────────────────────


def test_company_knowledge_rag_wrapper_delegates_kind() -> None:
    """包装器应将 kind 透传给内部 impl。"""
    rag = CompanyKnowledgeRAG(llm=FakeLLMClient())
    assert rag.kind == RAGBackendKind.LOCAL


def test_company_knowledge_rag_wrapper_legacy_when_no_llm() -> None:
    rag = CompanyKnowledgeRAG(llm=None)
    assert rag.kind is None
    assert rag.is_empty() is True


# ── LLMClient.embed 独立 base ──────────────────────────────────────


def test_llm_client_embed_uses_dedicated_embeddings_base(monkeypatch) -> None:
    """``LLM_EMBEDDINGS_BASE`` 应优先于 ``LLM_API_BASE`` 用于 embeddings 调用。"""
    captured: dict[str, Any] = {}

    class _StubResp:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {"data": [{"embedding": [0.1, 0.2, 0.3]}]}

        def raise_for_status(self) -> None:
            return None

    class _StubClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, **kw):
            captured["url"] = url
            return _StubResp()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _StubClient)
    # 重置 settings 缓存,让本次测试读到独立 embeddings base
    get_settings.cache_clear()

    monkeypatch.setenv("LLM_API_BASE", "https://api.openai.com/v1")
    monkeypatch.setenv("LLM_API_KEY", "sk-chat")
    monkeypatch.setenv("LLM_EMBEDDINGS_BASE", "https://api.siliconflow.cn/v1")
    monkeypatch.setenv("LLM_EMBEDDINGS_KEY", "sk-emb")
    monkeypatch.setenv("LLM_EMBEDDINGS_MODEL", "BAAI/bge-m3")

    llm = LLMClient(api_base="https://api.openai.com/v1", api_key="sk-chat", model="gpt-4o")
    import asyncio

    vecs = asyncio.run(llm.embed(["hello"]))
    assert vecs == [[0.1, 0.2, 0.3]]
    assert captured["url"].startswith("https://api.siliconflow.cn/v1/embeddings")


def test_llm_client_embed_falls_back_to_chat_base_when_no_override(monkeypatch) -> None:
    """未配置 LLM_EMBEDDINGS_BASE 时,embed 应回退到 LLM_API_BASE(行为不变)。"""
    captured: dict[str, Any] = {}

    class _StubResp:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {"data": [{"embedding": [0.0]}]}

        def raise_for_status(self) -> None:
            return None

    class _StubClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, **kw):
            captured["url"] = url
            return _StubResp()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _StubClient)
    get_settings.cache_clear()
    monkeypatch.delenv("LLM_EMBEDDINGS_BASE", raising=False)
    monkeypatch.delenv("LLM_EMBEDDINGS_KEY", raising=False)
    monkeypatch.delenv("LLM_EMBEDDINGS_MODEL", raising=False)
    monkeypatch.setenv("LLM_API_BASE", "https://api.deepseek.com/v1")
    monkeypatch.setenv("LLM_API_KEY", "sk-ds")
    monkeypatch.setenv("LLM_MODEL", "deepseek-chat")

    llm = LLMClient(api_base="https://api.deepseek.com/v1", api_key="sk-ds", model="deepseek-chat")
    import asyncio

    asyncio.run(llm.embed(["hi"]))
    assert captured["url"].startswith("https://api.deepseek.com/v1/embeddings")


# ── 集成：InterviewRunner 注入 tools ──────────────────────────────


def _make_session(db) -> Any:
    """复用 test_runner._make_session 的最小等价实现,避免跨测试文件耦合。"""
    from app.models import InterviewSession

    s = InterviewSession(
        profile_id=1,
        role="backend",
        level="中级工程师",
        company="bytedance",
        workflow_type="technical",
        personality="professional",
        strictness=3,
        interview_style="deep_dive",
        avatar_id="professional_male",
        scene_id="meeting_room",
        status="pending",
        current_phase="identity_check",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_interview_runner_collects_stepfun_tools(db) -> None:
    """当 rag 为 StepFunRetrievalRAG 且就绪时,_collect_chat_tools 应返回单元素列表。"""
    from app.services.interview.runner import InterviewRunner

    session = _make_session(db)
    rag = StepFunRetrievalRAG(llm=FakeLLMClient(api_key="sk-test"), settings=_make_settings())
    rag._vector_store_id = "1712"
    rag._ready = True

    runner = InterviewRunner(session=session, llm=FakeLLMClient(), rag=rag)
    tools = runner._collect_chat_tools()
    assert tools is not None
    assert len(tools) == 1
    assert tools[0]["type"] == "retrieval"


def test_interview_runner_no_tools_when_rag_unready(db) -> None:
    from app.services.interview.runner import InterviewRunner

    session = _make_session(db)
    rag = StepFunRetrievalRAG(llm=FakeLLMClient(api_key="sk-test"), settings=_make_settings())
    # _ready=False(默认)
    runner = InterviewRunner(session=session, llm=FakeLLMClient(), rag=rag)
    assert runner._collect_chat_tools() is None


def test_interview_runner_no_tools_when_no_rag(db) -> None:
    from app.services.interview.runner import InterviewRunner

    session = _make_session(db)
    runner = InterviewRunner(session=session, llm=FakeLLMClient(), rag=None)
    assert runner._collect_chat_tools() is None