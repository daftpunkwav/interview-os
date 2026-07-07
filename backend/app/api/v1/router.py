"""API v1 路由。"""

from fastapi import APIRouter

from app.api.v1 import prep, ws_interview

v1_router = APIRouter(prefix="/v1")

v1_router.include_router(ws_interview.router, tags=["realtime"])
v1_router.include_router(prep.router, prefix="/prep", tags=["prep"])
