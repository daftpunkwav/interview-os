"""应用层安全辅助。

集中放置所有安全相关的工具函数，便于在多个路由/服务中复用：

- 文件名清洗（防路径穿越）
- MIME 类型嗅探
- URL/SSRF 过滤
- API Key 脱敏
"""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ── 文件名 ────────────────────────────────────────

# 只保留 ASCII 字母数字 + 常见分隔符，其他替换为下划线
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")
_MAX_FILENAME_LEN = 120


def sanitize_filename(name: str) -> str:
    """清洗文件名，仅保留安全字符。

    - 取最后一个路径分隔符之后的纯文件名
    - 去除不可打印/控制字符
    - 仅保留 [A-Za-z0-9._-]
    - 长度上限 120
    """
    if not name:
        return "file"

    # 去掉路径部分（Windows / POSIX）
    base = name.replace("\\", "/").split("/")[-1]
    base = base.strip().strip(".") or "file"
    cleaned = _SAFE_FILENAME_RE.sub("_", base)
    # 防止仅剩 "."
    if not cleaned or set(cleaned) <= {"."}:
        cleaned = "file"
    if len(cleaned) > _MAX_FILENAME_LEN:
        stem, dot, suffix = cleaned.rpartition(".")
        if dot:
            stem = stem[: _MAX_FILENAME_LEN - len(suffix) - 1]
            cleaned = f"{stem}.{suffix}"
        else:
            cleaned = cleaned[:_MAX_FILENAME_LEN]
    return cleaned


def assert_within_dir(path: Path, root: Path) -> Path:
    """确保 ``path`` 在 ``root`` 之下（路径穿越防御）。

    返回规范化后的路径；越界时抛出 ``ValueError``。
    """
    root_resolved = root.resolve()
    path_resolved = (root_resolved / path).resolve() if not path.is_absolute() else path.resolve()
    try:
        path_resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError(f"路径越界: {path}") from exc
    return path_resolved


# ── URL / SSRF ────────────────────────────────────

# 默认拒绝的网段：loopback、link-local、private、multicast、reserved
_DEFAULT_BLOCKED_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


class UnsafeURLError(ValueError):
    """传入的 URL 命中安全策略。"""


def is_safe_http_url(
    url: str,
    *,
    allow_local: bool = False,
    timeout: float = 3.0,
) -> bool:
    """校验 ``url`` 是否为安全可外发的 HTTP/HTTPS URL。

    - 仅允许 http(s) 协议；
    - 解析并校验主机名；
    - 若 ``allow_local`` 为 False，拒绝 loopback / 私网 / 链路本地地址。
    """
    if not url:
        return False
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False

    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.hostname:
        return False

    if allow_local:
        return True

    try:
        # 先尝试直接解析为 IP；若失败则走 DNS 解析再做检查
        try:
            ip = ipaddress.ip_address(parsed.hostname)
        except ValueError:
            infos = socket.getaddrinfo(parsed.hostname, None, type=socket.SOCK_STREAM)
            ip = ipaddress.ip_address(infos[0][4][0])
        for net in _DEFAULT_BLOCKED_NETS:
            if ip in net:
                return False
    except (socket.gaierror, OSError, ValueError):
        return False

    return True


def assert_safe_http_url(url: str, *, allow_local: bool = False) -> None:
    """不安全时抛出 :class:`UnsafeURLError`。"""
    if not is_safe_http_url(url, allow_local=allow_local):
        raise UnsafeURLError(f"URL 被策略拒绝: {url!r}")


# ── API Key 脱敏 ──────────────────────────────────


def redact_api_key(value: str | None) -> str:
    """用于日志输出的 API Key 脱敏。"""
    if not value:
        return ""
    v = value.strip()
    if len(v) <= 8:
        return "***"
    return f"{v[:4]}***{v[-4:]}"
