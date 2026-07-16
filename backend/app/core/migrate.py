"""SQLite 轻量迁移：为已有库添加新列。

使用 ``engine.begin()`` 事务包裹同一张表的所有 ADD COLUMN，单张表迁移
要么全部成功要么全部回滚；其他表的失败互不影响。

.. note::

    本迁移器只负责 *现有表的列补全*；表的创建由 SQLAlchemy
    :func:`app.database.init_db` 走 ``Base.metadata.create_all``，
    新模型请加到 ``app/models/``。
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, OperationalError

logger = logging.getLogger(__name__)

# table -> [ALTER 语句列表]
MIGRATIONS: dict[str, list[str]] = {
    "user_profiles": [
        "ALTER TABLE user_profiles ADD COLUMN gender VARCHAR(20) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN identity VARCHAR(50) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN school VARCHAR(200) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN major VARCHAR(100) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN graduation_year VARCHAR(20) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN work_years_detail VARCHAR(100) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN current_company VARCHAR(200) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN expected_salary VARCHAR(100) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN self_intro TEXT DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN github_username VARCHAR(100) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN portfolio_url VARCHAR(500) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN linkedin_url VARCHAR(500) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN city VARCHAR(100) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN preferred_languages VARCHAR(200) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN career_highlights TEXT DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN open_to_remote VARCHAR(20) DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN notice_period VARCHAR(50) DEFAULT ''",
    ],
    "llm_settings": [
        "ALTER TABLE llm_settings ADD COLUMN protocol VARCHAR(50) DEFAULT 'openai_chat'",
        "ALTER TABLE llm_settings ADD COLUMN reasoning_effort VARCHAR(20) DEFAULT 'medium'",
        "ALTER TABLE llm_settings ADD COLUMN supports_vision BOOLEAN DEFAULT 1",
        "ALTER TABLE llm_settings ADD COLUMN supports_audio BOOLEAN DEFAULT 0",
        "ALTER TABLE llm_settings ADD COLUMN stt_model VARCHAR(50) DEFAULT 'base'",
        "ALTER TABLE llm_settings ADD COLUMN tts_voice VARCHAR(100) DEFAULT 'zh-CN-XiaoxiaoNeural'",
    ],
    "resumes": [
        "ALTER TABLE resumes ADD COLUMN is_active BOOLEAN DEFAULT 0",
        "ALTER TABLE resumes ADD COLUMN score INTEGER",
        "ALTER TABLE resumes ADD COLUMN analysis TEXT DEFAULT '{}'",
    ],
    "interview_sessions": [
        "ALTER TABLE interview_sessions ADD COLUMN avatar_id VARCHAR(50) DEFAULT 'professional_male'",
        "ALTER TABLE interview_sessions ADD COLUMN scene_id VARCHAR(50) DEFAULT 'meeting_room'",
        "ALTER TABLE interview_sessions ADD COLUMN token_usage INTEGER DEFAULT 0",
    ],
    "prep_sessions": [
        "ALTER TABLE prep_sessions ADD COLUMN status VARCHAR(20) DEFAULT 'active'",
    ],
}


def _column_name_from_stmt(stmt: str) -> str | None:
    """从形如 ``ALTER TABLE x ADD COLUMN name TYPE DEFAULT ...`` 的语句里
    抽取列名；无法抽取时返回 None（进入 try/except 路径判断）。"""
    try:
        marker = "ADD COLUMN"
        idx = stmt.upper().find(marker)
        if idx < 0:
            return None
        rest = stmt[idx + len(marker):].strip()
        # 取第一个 token，去掉可能的引号
        token = rest.split()[0] if rest else ""
        return token.strip('"').strip("`").strip("[]") or None
    except Exception:
        return None


def run_migrations(engine: Engine) -> dict[str, list[str]]:
    """幂等地为已有库补齐缺失列。

    每张表的所有 ADD COLUMN 在同一事务中执行；任意一条失败该表回滚，
    其它表不受影响。

    :returns: ``{table_name: [applied_column_sqls]}`` 便于测试断言。
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: dict[str, list[str]] = {}

    for table, statements in MIGRATIONS.items():
        if table not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        to_apply: list[str] = [
            s for s in statements
            if (col := _column_name_from_stmt(s)) and col not in existing_cols
        ]
        if not to_apply:
            continue
        try:
            with engine.begin() as conn:
                for stmt in to_apply:
                    conn.execute(text(stmt))
                    logger.info("迁移成功: %s", stmt[:80])
            applied[table] = to_apply
        except (OperationalError, IntegrityError) as e:
            # 整张表回滚；其它表的迁移仍可继续
            logger.error(
                "迁移失败 %s（事务已回滚）: %s", table, e, exc_info=True
            )
        except Exception as e:
            logger.error(
                "迁移失败 %s（事务已回滚，未知异常类型）: %s",
                table, e, exc_info=True,
            )

    if applied:
        logger.info(
            "数据库迁移完成，共 %d 张表 %d 列新增",
            len(applied),
            sum(len(v) for v in applied.values()),
        )
    else:
        logger.debug("数据库无需迁移")
    return applied
