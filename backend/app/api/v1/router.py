"""API v1 路由聚合。

``v1_router`` 只是一组 APIRouter 集合，不是 prefix。
实际包含在 :mod:`app.api.router` 中，由 ``prefix="/api/v1"`` 一次性挂载。
"""

from fastapi import APIRouter

from app.api import interview, options, profile, reports, resume, settings
from app.api.v1 import prep, ws_interview

# 用于 include_router 的子路由集合；prefix 由调用方注入
v1_router = APIRouter()
v1_router.include_router(settings.router, prefix="/settings", tags=["settings"])
v1_router.include_router(profile.router, prefix="/profile", tags=["profile"])
v1_router.include_router(resume.router, prefix="/resume", tags=["resume"])
v1_router.include_router(interview.router, prefix="/interview", tags=["interview"])
v1_router.include_router(reports.router, prefix="/reports", tags=["reports"])
v1_router.include_router(options.router, prefix="/options", tags=["options"])
v1_router.include_router(ws_interview.router, tags=["realtime"])
v1_router.include_router(prep.router, prefix="/prep", tags=["prep"])
