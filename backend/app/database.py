"""数据库连接与会话管理。"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    """SQLAlchemy 声明基类。"""


_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """惰性创建引擎，便于测试时通过环境变量切换数据库。

    对于内存 SQLite 使用 StaticPool，确保 :memory: 在多个连接间共享同一份库。
    """
    global _engine
    if _engine is None:
        from sqlalchemy.pool import StaticPool

        settings = get_settings()
        url = settings.database_url
        connect_args: dict = {}
        pool_kwargs: dict = {}
        if url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
            if url.endswith(":memory:") or url == "sqlite://":
                pool_kwargs["poolclass"] = StaticPool
        _engine = create_engine(url, connect_args=connect_args, **pool_kwargs)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """惰性创建 SessionLocal。"""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal


def reset_engine() -> None:
    """测试用：清除缓存的 engine/SessionLocal，强制重新创建。"""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


# 向后兼容：模块级别名。首次访问时调用工厂，确保总是最新的实例。
# 注意：导入这些模块级名称后会触发首次实例化，请在 setenv 之后再导入。
engine = get_engine()
SessionLocal = get_session_factory()


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖注入用的 Session 生成器。"""
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """创建所有数据表。"""
    from app import models  # noqa: F401 — 确保模型被注册

    settings = get_settings()
    db_path = settings.database_url.replace("sqlite:///", "")
    if db_path and not db_path.startswith(":"):
        from pathlib import Path

        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    Base.metadata.create_all(bind=get_engine())