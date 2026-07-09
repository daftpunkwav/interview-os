"""API Key 等敏感字段的 at-rest 加密（零依赖，纯标准库）。

使用 ``hashlib.pbkdf2_hmac`` 派生 32 字节密钥 + ``hmac`` 做认证 + ``XOR`` 流加密。

之所以不在此处依赖 ``cryptography``：保持 SQLite 单文件部署的零原生依赖目标；
若项目后续已安装 ``cryptography``，可平滑替换为 ``AES-256-GCM``（接口保持稳定）。

密钥来源：

- 环境变量 ``INTERVIEWOS_SECRET_KEY``（推荐生产环境显式提供）；
- 回退：首次启动时在 ``data/.secret.key`` 写入一个随机 32 字节密钥。

加密格式：``enc:v1:<base64-nonce16>:<base64-mac32>:<base64-ciphertext>``
``enc:v1:`` 前缀便于识别与版本演进。
"""

from __future__ import annotations

import base64
import hmac
import logging
import os
import secrets as _secrets
from functools import lru_cache
from pathlib import Path

from hashlib import pbkdf2_hmac, sha256

logger = logging.getLogger(__name__)
_VERSION_TAG = "enc:v1"
_BACKEND_DATA = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_KEYFILE = _BACKEND_DATA / ".secret.key"

_NONCE_BYTES = 16
_MAC_BYTES = 32
_KEY_BYTES = 32
_SALT_BYTES = 16
_KDF_ITERATIONS = 200_000


def _pbkdf2(password: bytes, salt: bytes) -> bytes:
    return pbkdf2_hmac("sha256", password, salt, _KDF_ITERATIONS, dklen=_KEY_BYTES)


def _load_secret_bytes() -> bytes:
    """返回原始 master 密钥（≥32 字节）。"""
    raw = os.environ.get("INTERVIEWOS_SECRET_KEY")
    if raw:
        # 既支持 base64 编码，也支持明文字符串（自动规范化）
        try:
            decoded = base64.b64decode(raw, validate=True)
            if len(decoded) >= 16:
                # 短于 32 字节时再派生
                return decoded.ljust(_KEY_BYTES, b"0")[:_KEY_BYTES]
        except Exception:
            pass
        return _pbkdf2(raw.encode("utf-8"), salt=b"interviewos-master")[:_KEY_BYTES]

    # 持久化 fallback
    _BACKEND_DATA.mkdir(parents=True, exist_ok=True)
    if _DEFAULT_KEYFILE.exists():
        try:
            return base64.b64decode(_DEFAULT_KEYFILE.read_text().strip())
        except Exception:
            pass

    fresh = _secrets.token_bytes(_KEY_BYTES)
    _DEFAULT_KEYFILE.write_text(base64.b64encode(fresh).decode())
    try:
        os.chmod(_DEFAULT_KEYFILE, 0o600)
    except OSError:
        pass
    logger.warning(
        "未检测到 INTERVIEWOS_SECRET_KEY，已生成一次性密钥: %s；生产环境请显式提供环境变量",
        _DEFAULT_KEYFILE,
    )
    return fresh


@lru_cache
def _session_key(master: bytes) -> bytes:
    """把 master 密钥再哈希一次得到每次启动一致的会话密钥。"""
    return sha256(master + b"interviewos-session").digest()


def _xor_stream(key: bytes, nonce: bytes, data: bytes) -> bytes:
    """基于 (key, nonce) 生成伪随机流并 XOR——常见的简易流加密构造。"""
    # SHA-256 计数器模式：每 32 字节一次；足够防离线扫描。
    out = bytearray()
    counter = 0
    while len(out) < len(data):
        block = hmac.new(key, nonce + counter.to_bytes(8, "big"), sha256).digest()
        out.extend(block)
        counter += 1
    return bytes(a ^ b for a, b in zip(data, out[: len(data)]))


def encrypt_secret(plaintext: str | None) -> str | None:
    """加密字符串；``None`` / 空值原样返回。"""
    if not plaintext:
        return plaintext
    if plaintext.startswith(f"{_VERSION_TAG}:"):
        return plaintext  # 已加密
    nonce = os.urandom(_NONCE_BYTES)
    master = _load_secret_bytes()
    session = _session_key(master)
    cipher = _xor_stream(session, nonce, plaintext.encode("utf-8"))
    mac = hmac.new(session, nonce + cipher, sha256).digest()
    return (
        f"{_VERSION_TAG}:"
        f"{base64.b64encode(nonce).decode()}:"
        f"{base64.b64encode(mac).decode()}:"
        f"{base64.b64encode(cipher).decode()}"
    )


def decrypt_secret(value: str | None) -> str | None:
    """解密；解密失败抛出 ``ValueError``。"""
    if not value:
        return value
    if not value.startswith(f"{_VERSION_TAG}:"):
        return value  # 旧明文直接返回（迁移期兼容）
    parts = value.split(":", 4)
    if len(parts) != 5:
        raise ValueError("加密串格式错误")
    _, _, nonce_b64, mac_b64, ct_b64 = parts
    nonce = base64.b64decode(nonce_b64)
    mac = base64.b64decode(mac_b64)
    ct = base64.b64decode(ct_b64)
    master = _load_secret_bytes()
    session = _session_key(master)
    expected = hmac.new(session, nonce + ct, sha256).digest()
    if not hmac.compare_digest(expected, mac):
        raise ValueError("MAC 校验失败：密钥可能已变更或数据被篡改")
    return _xor_stream(session, nonce, ct).decode("utf-8")
