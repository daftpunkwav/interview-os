"""``app.core.secrets`` 单元测试。

覆盖：
- 加解密往返；
- 旧明文格式向后兼容（无前缀）；
- 篡改 MAC 校验失败；
- 空值/None 边界。
"""

from __future__ import annotations

import base64
import os

import pytest

from app.core.secrets import (
    _load_secret_bytes,
    decrypt_secret,
    encrypt_secret,
)


@pytest.fixture(autouse=True)
def _stable_master_key(monkeypatch: pytest.MonkeyPatch, tmp_path):
    """用临时固定 master 隔离测试，避免污染全局 ``data/.secret.key``。"""
    master = b"a" * 32
    monkeypatch.setattr(
        "app.core.secrets._load_secret_bytes", lambda: master
    )
    yield


class TestEncryptDecrypt:
    def test_roundtrip(self) -> None:
        plain = "sk-1234567890abcdef"
        enc = encrypt_secret(plain)
        assert enc is not None
        assert enc.startswith("enc:v1:")
        assert enc != plain
        assert decrypt_secret(enc) == plain

    def test_encrypt_idempotent(self) -> None:
        """已加密的字符串二次调用直接返回，不重复包裹。"""
        plain = "hello"
        enc = encrypt_secret(plain)
        assert encrypt_secret(enc) == enc

    def test_decrypt_legacy_plaintext(self) -> None:
        """未带 ``enc:v1:`` 前缀的旧明文直接返回,保证迁移期兼容。"""
        legacy = "legacy-plain-key"
        assert decrypt_secret(legacy) == legacy

    def test_decrypt_empty_and_none(self) -> None:
        assert decrypt_secret(None) is None
        assert decrypt_secret("") == ""
        assert encrypt_secret(None) is None
        assert encrypt_secret("") == ""

    def test_tampered_mac_rejected(self) -> None:
        enc = encrypt_secret("top-secret")
        assert enc is not None
        # 替换 MAC 段:enc:v1:nonce:mac:cipher,整体翻转 MAC 段第一个字符。
        parts = enc.split(":")
        assert len(parts) == 5
        mac = parts[3]
        # 替换 MAC 第一字符(确保仍是合法 base64,但值不同)
        parts[3] = ("B" if mac[0] != "B" else "C") + mac[1:]
        tampered = ":".join(parts)
        with pytest.raises(ValueError, match="MAC 校验失败"):
            decrypt_secret(tampered)

    def test_wrong_format_raises(self) -> None:
        with pytest.raises(ValueError, match="加密串格式错误"):
            decrypt_secret("enc:v1:only:three")

    def test_random_nonce_each_time(self) -> None:
        """同一明文两次加密应得到不同密文（nonce 随机）。"""
        a = encrypt_secret("same")
        b = encrypt_secret("same")
        assert a != b
        # 但都能解回原文
        assert decrypt_secret(a) == decrypt_secret(b) == "same"

    def test_unicode_roundtrip(self) -> None:
        plain = "你好世界 🔑 résumé"
        assert decrypt_secret(encrypt_secret(plain)) == plain