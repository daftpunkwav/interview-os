"""API 路由聚合。"""

from fastapi import APIRouter

from app.api import interview, options, profile, reports, resume, settings
from app.api.v1.router import v1_router

api_router = APIRouter(prefix="/api")

api_router.include_router(v1_router)

api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(resume.router, prefix="/resume", tags=["resume"])
api_router.include_router(interview.router, prefix="/interview", tags=["interview"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(options.router, prefix="/options", tags=["options"])
