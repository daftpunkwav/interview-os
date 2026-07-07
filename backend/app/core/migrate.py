"""SQLite 轻量迁移：为已有库添加新列。"""

import logging
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# table -> [(column_def_sql)]
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
}


def run_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    with engine.connect() as conn:
        for table, statements in MIGRATIONS.items():
            if table not in existing_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            for stmt in statements:
                col_name = stmt.split("ADD COLUMN")[1].strip().split()[0]
                if col_name in existing_cols:
                    continue
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                    logger.info("迁移成功: %s", stmt[:60])
                except Exception as e:
                    logger.debug("迁移跳过: %s", e)
