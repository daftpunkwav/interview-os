"""``app.core.security`` 单元测试。

覆盖：
- ``redact_api_key`` 的多种输入形态；
- ``sanitize_filename`` 防路径穿越；
- ``assert_within_dir`` 越界检测；
- ``is_safe_http_url`` SSRF 防御（loopback / 私网 / 链路本地）。
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.security import (
    UnsafeURLError,
    assert_safe_http_url,
    assert_within_dir,
    is_safe_http_url,
    redact_api_key,
    sanitize_filename,
)


# ---------------------------------------------------------------------------
# redact_api_key
# ---------------------------------------------------------------------------


class TestRedactApiKey:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("", ""),
            (None, ""),
            ("sk-12345678abcdefgh", "sk-1***efgh"),
            ("sk-proj-abc123def456ghi789", "sk-p***i789"),
            ("sk-verylongapikeywithmanychars", "sk-v***hars"),
            ("authorization: Bearer abc123def456", "authorization: ***"),
            ("Authorization: Bearer abc123def456", "Authorization: ***"),
            ("authorization=abc123def456", "authorization= ***"),
            ("bearer abc123def456", "Bearer ***"),
            ("token abc123def456", "Token ***"),
            ("basic dXNlcjpwYXNz", "Basic ***"),
            ("short", "***"),  # <= 8 chars
        ],
    )
    def test_redact_variants(self, raw: str | None, expected: str) -> None:
        assert redact_api_key(raw) == expected


# ---------------------------------------------------------------------------
# sanitize_filename
# ---------------------------------------------------------------------------


class TestSanitizeFilename:
    @pytest.mark.parametrize(
        "raw,expected_substr",
        [
            ("../../../etc/passwd", "passwd"),
            ("..\\..\\windows\\system32", "system32"),
            ("file with spaces.pdf", "file_with_spaces.pdf"),
            # 中文路径分隔后只剩扩展名,因为仅保留 ASCII 字母数字 + . _ -
            ("中文简历.pdf", ".pdf"),
            ("...hidden", "hidden"),  # 清理 "." 前缀但保留核心内容
            ("", "file"),
            ("\x00evil\x00.exe", "_evil_.exe"),
            ("a" * 200 + ".pdf", ".pdf"),
        ],
    )
    def test_sanitization(self, raw: str, expected_substr: str) -> None:
        result = sanitize_filename(raw)
        assert expected_substr in result
        # 永远不应包含路径分隔符或控制字符
        assert "/" not in result
        assert "\\" not in result
        assert "\x00" not in result


# ---------------------------------------------------------------------------
# assert_within_dir
# ---------------------------------------------------------------------------


class TestAssertWithinDir:
    def test_relative_path_inside(self, tmp_path: Path) -> None:
        p = assert_within_dir(Path("subdir/file.txt"), tmp_path)
        assert p == (tmp_path / "subdir" / "file.txt").resolve()

    def test_relative_path_traversal_blocked(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="路径越界"):
            assert_within_dir(Path("../escape.txt"), tmp_path)

    def test_absolute_path_inside(self, tmp_path: Path) -> None:
        inner = tmp_path / "inner.txt"
        inner.write_text("ok")
        resolved = assert_within_dir(inner, tmp_path)
        assert resolved == inner.resolve()

    def test_absolute_path_outside_blocked(self, tmp_path: Path) -> None:
        outside = tmp_path.parent / "outside.txt"
        outside.write_text("ok")
        with pytest.raises(ValueError, match="路径越界"):
            assert_within_dir(outside, tmp_path)


# ---------------------------------------------------------------------------
# is_safe_http_url / assert_safe_http_url
# ---------------------------------------------------------------------------


class TestIsSafeHttpUrl:
    @pytest.mark.parametrize(
        "url,allow_local,expected",
        [
            # 协议校验
            ("javascript:alert(1)", False, False),
            ("file:///etc/passwd", False, False),
            ("ftp://example.com", False, False),
            ("", False, False),
            # 公网 https
            ("https://api.openai.com/v1", False, True),
            ("http://api.example.com/v1", False, True),
            # loopback / 私网 在严格模式下拒绝
            ("http://127.0.0.1:8000", False, False),
            ("http://10.0.0.1", False, False),
            ("http://192.168.1.1", False, False),
            ("http://172.16.0.1", False, False),
            ("http://169.254.169.254/latest/meta-data", False, False),
            ("http://[::1]", False, False),
            # Dev 模式允许本地
            ("http://127.0.0.1:8000", True, True),
            ("http://localhost:8000", True, True),
        ],
    )
    def test_classification(self, url: str, allow_local: bool, expected: bool) -> None:
        assert is_safe_http_url(url, allow_local=allow_local) is expected

    def test_assert_raises_unsafe(self) -> None:
        with pytest.raises(UnsafeURLError):
            assert_safe_http_url("http://127.0.0.1:8000")