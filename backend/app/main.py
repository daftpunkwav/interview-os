"""InterviewOS FastAPI 应用入口。"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.database import init_db, SessionLocal
from app.services.seed import seed_llm_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    init_db()
    db = SessionLocal()
    try:
        seed_llm_settings(db)
    finally:
        db.close()
    logger.info("InterviewOS 后端已启动")
    yield
    logger.info("InterviewOS 后端已关闭")


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
