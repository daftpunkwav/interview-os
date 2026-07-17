"""本会话回归测试的 pytest 配置。

将 ``backend/`` 加入 ``sys.path``，并复用与 ``backend/tests`` 一致的隔离环境。
"""

from __future__ import annotations

import os
import sys
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy.orm import sessionmaker

# 仓库根 / backend 入 path
_ROOT = Path(__file__).resolve().parents[1]
_BACKEND = _ROOT / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def pytest_configure(config: pytest.Config) -> None:
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    os.environ.setdefault("LLM_API_KEY", "test-key")
    os.environ.setdefault("LLM_API_BASE", "http://localhost:9999/v1")
    os.environ.setdefault("LLM_MODEL", "test-model")
    os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
    os.environ["INTERVIEWOS_TEST_MODE"] = "1"


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    yield


@pytest.fixture
def engine():
    from app.database import get_engine

    return get_engine()


@pytest.fixture
def session_factory(engine):
    from app import models  # noqa: F401
    from app.database import Base

    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db(session_factory) -> Generator:
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
