"""InterviewOS FastAPI 应用入口。"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.core.logging import configure_logging, get_trace_id, set_trace_id
from app.database import init_db, SessionLocal, engine
from app.core.migrate import run_migrations
from app.services.seed import seed_llm_settings

configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    init_db()
    run_migrations(engine)
    db = SessionLocal()
    try:
        seed_llm_settings(db)
        await _ensure_rag_index(db)
    finally:
        db.close()
    logger.info("InterviewOS 后端已启动")
    yield
    logger.info("InterviewOS 后端已关闭")


async def _ensure_rag_index(db) -> None:
    """首次启动时构建企业知识库 RAG 索引。

    若未配置 LLM API Key，跳过（不影响启动）。
    """
    from app.services.llm.client import LLMClient
    from app.services.rag.company_rag import CompanyKnowledgeRAG

    try:
        llm = LLMClient.from_db(db)
    except Exception as e:
        logger.warning("跳过 RAG 初始化（LLM 配置不可用）: %s", e)
        return

    api_key = getattr(llm, "api_key", None)
    if not api_key:
        logger.info("未配置 LLM API Key，跳过 RAG 索引构建")
        return

    try:
        rag = CompanyKnowledgeRAG(llm)
        await rag.ensure_index()
    except Exception as e:
        logger.warning("RAG 索引构建失败（启动继续）: %s", e)


app = FastAPI(
    title="InterviewOS",
    description="AI 智能模拟面试 Agent 平台",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def trace_middleware(request, call_next):
    """为每个 HTTP 请求注入 trace_id，便于日志串联。"""
    set_trace_id(request.headers.get("x-request-id"))
    response = await call_next(request)
    response.headers["X-Trace-Id"] = get_trace_id()
    return response


# CORS 配置：禁止与 credentials=True 同时使用通配 origins
_allow_origins = settings.cors_origin_list
if "*" in _allow_origins:
    logger.warning("CORS 允许 * 通配，建议在生产环境收紧")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "interviewos-backend", "version": "1.0.0"}
