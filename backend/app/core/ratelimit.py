"""轻量级进程内限流（无需外部依赖）。

设计目标：

- 防止同一个 IP 在短时间对昂贵接口（LLM 调用、上传、分析）打出 DoS；
- 基于滑动窗口的内存计数，单进程足够，本地优先；
- 集成到 FastAPI 中作为 Depends 注入，避免装饰器破坏 OpenAPI 文档。

内存治理：桶空闲超过 ``_BUCKET_TTL_SECONDS`` 会被后台清理线程回收，
避免长跑服务下字典无界增长。
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass

from fastapi import HTTPException, Request


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


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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
    ip = _client_ip(request)
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
