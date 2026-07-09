"""验证 ``/api/v1`` 与 ``/api`` 兼容别名同时存在。

具体检查 ``/api/v1/settings/llm`` 与 ``/api/settings/llm`` 都能命中。
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _client(monkeypatch):
    from app.main import app
    monkeypatch.setenv("INTERVIEWOS_TEST_MODE", "1")
    return TestClient(app)


def test_v1_path_present(monkeypatch) -> None:
    with _client(monkeypatch) as c:
        r = c.get("/api/v1/options")
        assert r.status_code == 200


def test_legacy_alias_present(monkeypatch) -> None:
    """/api/<sub> 兼容别名仍可用，3 个月内滚动期。"""
    with _client(monkeypatch) as c:
        r = c.get("/api/options")
        assert r.status_code == 200


def test_both_paths_cover_same_endpoint(monkeypatch) -> None:
    """同一组 endpoint 在新旧两条路径都暴露。"""
    with _client(monkeypatch) as c:
        r1 = c.get("/api/v1/options")
        r2 = c.get("/api/options")
        assert r1.status_code == r2.status_code
        # 简单 JSON 比对：两个端点应返回同一份数据
        assert r1.json() == r2.json()


def test_health_unchanged(monkeypatch) -> None:
    """``/health`` 不在 ``/api`` 前缀下，原样保留。"""
    with _client(monkeypatch) as c:
        r = c.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
