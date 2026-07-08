"""pytest 全局 fixtures：内存 SQLite、隔离上传目录、覆盖环境变量。"""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


def pytest_configure(config: pytest.Config) -> None:
    """在最早阶段覆盖环境变量，避免 app 模块导入时缓存默认值。"""
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    os.environ.setdefault("LLM_API_KEY", "test-key")
    os.environ.setdefault("LLM_API_BASE", "http://localhost:9999/v1")
    os.environ.setdefault("LLM_MODEL", "test-model")
    os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """为每个测试隔离 upload_dir，并确保 engine 表结构存在。

    engine 缓存由 pytest_configure + 模块导入时创建一次，StaticPool 使 :memory:
    在整个测试会话内共享同一份库。lifespan 与测试代码访问同一份内存库。
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))

    yield

    # 不重置 engine —— StaticPool + :memory: 必须保持单例


@pytest.fixture
def engine():
    """复用全局 engine，确保 fixture 与 FastAPI Depends 注入的 Session 共享同一份 :memory: 库。"""
    from app.database import get_engine

    return get_engine()


@pytest.fixture
def session_factory(engine):
    """返回 sessionmaker，绑定到全局 engine，使测试 fixture 与 FastAPI 注入共享同一份库。"""
    from app.database import Base
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db(session_factory) -> Generator:
    """提供 Session，测试结束后自动关闭。"""
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def temp_upload_dir(tmp_path: Path) -> Path:
    p = tmp_path / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p