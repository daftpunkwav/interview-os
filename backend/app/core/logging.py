"""结构化日志与敏感字段脱敏。

- :class:`SafeFormatter`: 默认 JSON 风格输出，包含 trace_id；
- :class:`RedactFilter`: 自动替换日志中的 API Key / Authorization 头；
- :func:`configure_logging`: 在 FastAPI lifespan 启动时一次性安装。
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
import uuid

from app.core.security import redact_api_key

# 请求级 trace_id，便于把同一次请求的日志串起来
_trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "trace_id", default=""
)


def new_trace_id() -> str:
    return uuid.uuid4().hex


def set_trace_id(value: str | None = None) -> str:
    token = _trace_id_var.set(value or new_trace_id())
    return _trace_id_var.get()


def get_trace_id() -> str:
    return _trace_id_var.get()


# 日志中的 API Key / Bearer token 自动脱敏
_TOKEN_RE = re.compile(
    r"(?i)(authorization\s*[:=]\s*(?:bearer\s+)?[\w\-]+|sk-[A-Za-z0-9_\-]+)"
)


class RedactFilter(logging.Filter):
    """日志输出前脱敏敏感字段。"""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
            msg = _TOKEN_RE.sub(lambda m: redact_api_key(m.group(0)), msg)
            record.msg = msg
            record.args = ()
        except Exception:  # pragma: no cover - fail open
            pass
        return True


class SafeFormatter(logging.Formatter):
    """JSON 结构化输出 + 内嵌 trace_id。"""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "trace_id": get_trace_id(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    """替换默认 handler，安装脱敏过滤器。

    - 生产环境默认输出 JSON，方便被 Loki / ES 采集；
    - 开发环境同时保留 stdout 文本输出（最简明）。
    """
    root = logging.getLogger()
    # 清掉 uvicorn / 默认安装
    for h in list(root.handlers):
        root.removeHandler(h)

    stream = logging.StreamHandler(stream=sys.stdout)
    stream.setLevel(level)
    stream.addFilter(RedactFilter())
    stream.setFormatter(SafeFormatter())
    root.addHandler(stream)
    root.setLevel(level)

    # uvicorn 自身的日志继承同一格式
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True
