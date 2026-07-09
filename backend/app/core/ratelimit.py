"""轻量级进程内限流（无需外部依赖）。

设计目标：

- 防止同一个 IP 在短时间对昂贵接口（LLM 调用、上传、分析）打出 DoS；
- 基于滑动窗口的内存计数，单进程足够，本地优先；
- 集成到 FastAPI 中作为 Depends 注入，避免装饰器破坏 OpenAPI 文档。
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass

from fastapi import HTTPException, Request


@dataclass
class _Bucket:
    timestamps: deque[float]


_LOCK = threading.Lock()
_BUCKETS: dict[tuple[str, str], _Bucket] = {}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(
    request: Request,
    *,
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    """检查限流，越界抛 ``HTTPException(429)``。"""
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


def reset_rate_limit(key: str | None = None) -> None:
    """清空限流状态，仅用于测试。"""
    with _LOCK:
        if key is None:
            _BUCKETS.clear()
        else:
            for k in list(_BUCKETS.keys()):
                if k[0] == key:
                    _BUCKETS.pop(k, None)
