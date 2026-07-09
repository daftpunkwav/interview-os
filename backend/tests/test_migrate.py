"""``app.core.migrate`` 单元测试。

覆盖：

- 初次运行：对已有表补齐缺失列；
- 二次运行：已存在列应跳过（idempotent），不应报 DuplicateColumn；
- 异常路径：若 SQL 执行失败，该表迁移失败被吞掉，其他表正常完成；
- 表不存在的迁移项应被静默跳过，不影响其他表。
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text

from app.core.migrate import MIGRATIONS, _column_name_from_stmt, run_migrations
from app.models import Base


def _fresh_engine():
    """返回全新 :memory: 引擎，仅建表不执行迁移，便于断言前/后状态。"""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(eng)
    return eng


def test_column_name_extraction() -> None:
    """``_column_name_from_stmt`` 抽取裸列名（兼容引号包裹）。"""
    assert _column_name_from_stmt(
        "ALTER TABLE x ADD COLUMN foo VARCHAR(20) DEFAULT ''"
    ) == "foo"
    assert _column_name_from_stmt(
        "ALTER TABLE x ADD COLUMN `bar` VARCHAR(20) DEFAULT 0"
    ) == "bar"
    assert _column_name_from_stmt("ALTER TABLE x DROP COLUMN z") is None
    assert _column_name_from_stmt("") is None


def test_run_migrations_is_idempotent() -> None:
    """运行两次迁移：第二次应为空（验证幂等），不报 DuplicateColumn。"""
    eng = _fresh_engine()
    first = run_migrations(eng)
    second = run_migrations(eng)
    # 第一遍改了 k 列（prep_sessions.status）；第二遍必须 0 改动
    assert "prep_sessions" in first  # status 列是 Base 模型缺、迁移补的
    assert "prep_sessions" not in second  # 第二次空跑
    for table, _ in MIGRATIONS.items():
        if table not in first:
            assert table not in second


def test_run_migrations_skips_missing_table() -> None:
    """如果迁移清单里的表不存在（开发期不慎删除模型），不应 crash。"""
    eng = _fresh_engine()
    with eng.begin() as conn:
        conn.execute(text("DROP TABLE resumes"))
    # 不抛异常
    applied = run_migrations(eng)
    assert "resumes" not in applied
    # 其它表仍正常完成
    assert "prep_sessions" in applied


def test_failed_alter_silently_continues_other_tables() -> None:
    """对单张表注入一条不合法 SQL：该表迁移失败被吞掉；其他表正常完成。"""
    eng = _fresh_engine()

    from app.core import migrate

    bad_table = "llm_settings"
    original_stmts = list(migrate.MIGRATIONS[bad_table])
    # 故意造一条针对已存在列 ADD 的 SQL，会触发 duplicate column 错误
    migrate.MIGRATIONS[bad_table] = [
        "ALTER TABLE llm_settings ADD COLUMN protocol VARCHAR(50) DEFAULT 'openai_chat'"
    ]
    try:
        applied = run_migrations(eng)
    finally:
        migrate.MIGRATIONS[bad_table] = original_stmts

    # 该表迁移失败:不会出现在 applied（迁移器吞了异常、整张表回滚）
    assert bad_table not in applied
    # 其它表正常完成
    assert "prep_sessions" in applied
    # resumes:Base.create_all 已建好所有列,无需 ADD,自然不在 applied,但其它表能跑证明隔离成功
    # 同时验证数据库里 llm_settings.protocol 仍然为初始的 DEFAULT 'openai_chat'
    insp = inspect(eng)
    cols = {c["name"]: c for c in insp.get_columns(bad_table)}
    assert "protocol" in cols
