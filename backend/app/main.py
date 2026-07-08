"""InterviewOS FastAPI 应用入口。"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.database import init_db, SessionLocal, engine
from app.core.migrate import run_migrations
from app.services.seed import seed_llm_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "interviewos-backend"}
