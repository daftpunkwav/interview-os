"""本机管理 API 访问加固。

档案 / 简历 / 设置等本地管理接口默认仅允许 loopback 对端，
避免 ``HOST=0.0.0.0`` 时被局域网任意客户端改写 BYOK 配置。
"""

from __future__ import annotations

import ipaddress
import os

from fastapi import HTTPException, Request


def require_local_peer(request: Request) -> None:
    """仅允许 loopback 直连；否则 403。"""
    peer = request.client.host if request.client else None
    if not peer:
        raise HTTPException(status_code=403, detail="仅允许本机访问管理接口")
    # Starlette TestClient / 测试模式放行
    if peer == "testclient" or os.environ.get("INTERVIEWOS_TEST_MODE") == "1":
        return
    try:
        ip = ipaddress.ip_address(peer.strip("[]"))
    except ValueError as e:
        raise HTTPException(status_code=403, detail="仅允许本机访问管理接口") from e
    if not ip.is_loopback:
        raise HTTPException(status_code=403, detail="仅允许本机访问管理接口")
