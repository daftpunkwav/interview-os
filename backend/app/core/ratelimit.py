"""轻量级进程内限流（无需外部依赖）。

设计目标：

- 防止同一个 IP 在短时间对昂贵接口（LLM 调用、上传、分析）打出 DoS；
- 基于滑动窗口的内存计数，单进程足够，本地优先；
- 集成到 FastAPI 中作为 Depends 注入，避免装饰器破坏 OpenAPI 文档。

内存治理：桶空闲超过 ``_BUCKET_TTL_SECONDS`` 会被后台清理线程回收，
避免长跑服务下字典无界增长。

.. warning::

    多 worker 部署（``uvicorn --workers N``）时每个 worker 独立计数，限额
    会被放大 N 倍；如需跨 worker 一致，请接入 Redis 等集中式存储。

代理信任链：X-Forwarded-For 首段仅在 :func:`is_localhost_family` 命中
时（即认为请求来自内网代理，如 Nginx / Traefik 反代）才采纳，避免伪造
头绕过限流。公网直连时使用 ``request.client.host``。
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass

from fastapi import HTTPException, Request

from app.core.security import is_localhost_family


# 桶空闲回收时间窗。超过该时间无访问视为可回收。
_BUCKET_TTL_SECONDS = 600
_CLEANUP_INTERVAL_SECONDS = 120


@dataclass
class _Bucket:
    timestamps: deque[float]
    last_access: float = 0.0

    def __post_init__(self) -> None:
        if self.last_access == 0.0:
            self.last_access = time.monotonic()


_LOCK = threading.Lock()
_BUCKETS: dict[tuple[str, str], _Bucket] = {}
_cleanup_started = False


def _resolve_client_ip(request: Request) -> str:
    """解析客户端 IP。

    - 仅当 ``request.client.host`` 属于私有/loopback 网段（即可信代理链路）
      时才采纳 ``X-Forwarded-For`` 首段；
    - 公网直连总是使用 ``request.client.host``，防止伪造。
    """
    peer = request.client.host if request.client else None
    fwd = request.headers.get("x-forwarded-for")
    if fwd and peer and is_localhost_family(peer):
        return fwd.split(",")[0].strip() or peer
    return peer or "unknown"


def _ensure_cleanup_thread() -> None:
    """惰性启动后台清理线程，单进程内仅启动一次。"""
    global _cleanup_started
    if _cleanup_started:
        return
    _cleanup_started = True

    def _sweep() -> None:
        while True:
            time.sleep(_CLEANUP_INTERVAL_SECONDS)
            cutoff = time.monotonic() - _BUCKET_TTL_SECONDS
            with _LOCK:
                stale = [k for k, b in _BUCKETS.items() if b.last_access < cutoff]
                for k in stale:
                    _BUCKETS.pop(k, None)

    t = threading.Thread(target=_sweep, name="ratelimit-sweeper", daemon=True)
    t.start()


def check_rate_limit(
    request: Request,
    *,
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    """检查限流，越界抛 ``HTTPException(429)``。"""
    _ensure_cleanup_thread()
    ip = _resolve_client_ip(request)
    bucket_key = (key, ip)
    now = time.monotonic()
    with _LOCK:
        bucket = _BUCKETS.get(bucket_key)
        if bucket is None:
            bucket = _Bucket(timestamps=deque())
            _BUCKETS[bucket_key] = bucket
        # 弹出窗口外
        while bucket.timestamps and bucket.timestamps[0] <= now - window_seconds:
            bucket.timestamps.popleft()
        if len(bucket.timestamps) >= limit:
            retry_after = max(1, int(window_seconds - (now - bucket.timestamps[0])))
            raise HTTPException(
                status_code=429,
                detail=f"请求过于频繁，请在 {retry_after}s 后重试",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.timestamps.append(now)
        bucket.last_access = now


def reset_rate_limit(key: str | None = None) -> None:
    """清空限流状态，仅用于测试。"""
    with _LOCK:
        if key is None:
            _BUCKETS.clear()
        else:
            for k in list(_BUCKETS.keys()):
                if k[0] == key:
                    _BUCKETS.pop(k, None)
