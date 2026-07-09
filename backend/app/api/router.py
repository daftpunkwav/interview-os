"""API 路由聚合。

新路径标准：所有 endpoint 挂在 ``/api/v1`` 前缀下。
兼容别名（3 个月弃用期）：同一组 router 同样挂在 ``/api`` 下。

各业务 router 集中在 :data:`app.api.v1.router.v1_router`，
这里再 include 一次到 legacy 前缀。
"""

from fastapi import APIRouter

from app.api.v1.router import v1_router

# /api/v1/*
api_router = APIRouter()
api_router.include_router(v1_router, prefix="/api/v1")

# /api/* —— 3 个月兼容别名；前端请迁移到 /api/v1
api_router.include_router(v1_router, prefix="/api")
