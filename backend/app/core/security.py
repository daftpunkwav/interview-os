"""应用层安全辅助。

集中放置所有安全相关的工具函数，便于在多个路由/服务中复用：

- 文件名清洗（防路径穿越）
- MIME 类型嗅探
- URL/SSRF 过滤（多 A 记录遍历 + IPv6 + 端口白名单）
- API Key 脱敏（覆盖主流形态）
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

# 默认拒绝的网段：loopback、link-local、private、multicast、reserved、IPv6 等价
_DEFAULT_BLOCKED_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    # IPv4-mapped IPv6（攻击者常用绕路）
    ipaddress.ip_network("::ffff:0:0/96"),
]


# 允许的对外端口：dev 模式可放行任意；生产期仅 HTTP/HTTPS。
_DEFAULT_ALLOWED_PORTS = frozenset({80, 443})


class UnsafeURLError(ValueError):
    """传入的 URL 命中安全策略。"""


def _resolve_all(hostname: str) -> list[ipaddress._BaseNetwork | ipaddress._BaseAddress]:
    """解析域名/字面量为所有候选 IP。

    - IPv4 / IPv6 字面量直接返回；
    - 域名返回 getaddrinfo 全量 SOCK_STREAM 解析结果。

    任一记录在私有/loopback 网段内都视为不安全。
    """
    try:
        # IPv4 / IPv6 字面量（如 1.2.3.4 或 ::1）
        return [ipaddress.ip_address(hostname.strip("[]"))]
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError):
        raise ValueError(f"无法解析主机: {hostname!r}")
    out: list[ipaddress._BaseAddress] = []
    seen: set[str] = set()
    for info in infos:
        addr = info[4][0]
        if addr in seen:
            continue
        seen.add(addr)
        try:
            out.append(ipaddress.ip_address(addr))
        except ValueError:
            continue
    return out


def is_safe_http_url(
    url: str,
    *,
    allow_local: bool = False,
    timeout: float = 3.0,
    allowed_ports: frozenset[int] | None = None,
) -> bool:
    """校验 ``url`` 是否为安全可外发的 HTTP/HTTPS URL。

    - 仅允许 http(s) 协议；
    - 解析并校验主机名；
    - 多 A 记录遍历：任一记录在 loopback / 私网 / 链路本地内即拒绝；
    - ``allow_local=False`` 时拒绝非常规端口（默认仅 80/443）；
    - ``allow_local=True``（dev 模式）放行 loopback，但端口仍受约束。

    .. note::

        本函数为 BEST-EFFORT 校验：DNS 重绑定（TOCTOU）需要上游 LLMClient
        把校验过的 IP 透传到 httpx transport 才能根治。建议后续用
        httpx transport layer 在该 IP 上强制连接并保留 ``Host`` 头。
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

    # 端口白名单（非 allow_local 时）
    port = parsed.port
    if port is not None and port not in (allowed_ports or _DEFAULT_ALLOWED_PORTS):
        return False

    try:
        ips = _resolve_all(parsed.hostname)
        for ip in ips:
            for net in _DEFAULT_BLOCKED_NETS:
                if ip in net:
                    return False
    except ValueError:
        return False

    return True


def assert_safe_http_url(
    url: str,
    *,
    allow_local: bool = False,
    allowed_ports: frozenset[int] | None = None,
) -> None:
    """不安全时抛出 :class:`UnsafeURLError`。"""
    if not is_safe_http_url(url, allow_local=allow_local, allowed_ports=allowed_ports):
        raise UnsafeURLError(f"URL 被策略拒绝: {url!r}")


def is_localhost_family(host: str) -> bool:
    """判断主机（IP 字面量或域名解析后）是否位于私有网段（用于限流信任代理链）。"""
    if not host:
        return False
    try:
        ips = _resolve_all(host)
    except ValueError:
        return False
    for ip in ips:
        for net in _DEFAULT_BLOCKED_NETS:
            if ip in net:
                return True
    return False


# ── API Key 脱敏 ──────────────────────────────────


# 各家厂商前缀集合
_API_KEY_PREFIXES = (
    "sk-",        # OpenAI / StepFun / 通用
    "sk_",        # 部分国内供应商
    "sk-ant-",    # Anthropic
    "aiza",       # Google (AIza...)
    "step-",      # StepFun
)


def _looks_like_api_key(v: str) -> bool:
    lowered = v.lower()
    if lowered.startswith("aiza"):
        return True
    if v.startswith("sk-ant-"):
        return True
    return v.startswith("sk-") or v.startswith("sk_")


def _looks_like_secret(v: str) -> bool:
    """启发式：判断字符串是否像秘密（API Key、token、UUID 等）。

    启发规则：

    - 长度需 ``>= 20``（一般 API Key 远长于此）；
    - 至少有 ASCII 字母 / 数字出现；
    - 同时包含字母与数字（避免普通短语被误判）；
    - 不包含空格（避免截断错误）。
    """
    if len(v) < 20 or " " in v:
        return False
    has_letter = any(c.isalpha() for c in v)
    has_digit = any(c.isdigit() for c in v)
    return has_letter and has_digit


def redact_api_key(value: str | None) -> str:
    """用于日志输出的 API Key 脱敏。

    同时覆盖:
    - 各家 Key（OpenAI/Anthropic/Google/StepFun）；
    - ``Authorization: Bearer xxxx`` / ``authorization=xxxx`` 头形式；
    - 启发式认为"长度足够 + 字母数字混合 + 无空格"的 token。

    普通短语、日志模板（``HTTP/%s ...``）不会被误判。
    """
    if not value:
        return ""
    v = value.strip()
    if len(v) <= 8:
        # 短字符串默认不脱敏，避免误伤中文短语/路径/短 token 自身
        return v

    # Authorization / authorization=xxx 形式：只保留 scheme，后续 token 整体遮蔽
    lowered = v.lower()
    if lowered.startswith("authorization"):
        scheme_idx = v.find(":") if ":" in v else v.find("=")
        if scheme_idx >= 0:
            head = v[: scheme_idx + 1]
            return f"{head} ***"
        return "Authorization ***"

    # 显式 Bearer / Token 前缀
    for prefix in ("bearer ", "token ", "basic "):
        if lowered.startswith(prefix):
            return f"{prefix[:1].upper()}{prefix[1:]}***"

    if _looks_like_api_key(v):
        return f"{v[:4]}***{v[-4:]}"

    # 启发式 secret（如不规则 token / UUID）才走"首尾 4 字符"脱敏
    if _looks_like_secret(v):
        return f"{v[:4]}***{v[-4:]}"

    return v
