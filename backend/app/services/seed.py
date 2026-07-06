"""启动时从环境变量初始化 LLM 配置。"""

import logging

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import LLMSettings

logger = logging.getLogger(__name__)


def seed_llm_settings(db: Session) -> None:
    """若数据库无 LLM 配置且环境变量有 Key，则自动写入。"""
    settings = get_settings()
    row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()

    if row and row.api_key:
        return

    if not settings.llm_api_key:
        return

    if not row:
        row = LLMSettings(id=1)
        db.add(row)

    row.api_base = settings.llm_api_base
    row.api_key = settings.llm_api_key
    row.model = settings.llm_model
    row.max_tokens = settings.llm_max_tokens
    row.context_window = settings.llm_context_window
    row.provider = "stepfun" if "stepfun" in settings.llm_api_base else "openai"
    db.commit()
    logger.info("已从环境变量初始化 LLM 配置")
