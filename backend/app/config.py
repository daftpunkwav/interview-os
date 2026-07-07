"""应用配置模块。"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """全局配置，支持环境变量与 .env 文件。"""

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM BYOK
    llm_api_base: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o"
    llm_max_tokens: int = 4096
    llm_context_window: int = 128000

    # 服务
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'data' / 'interviewos.db'}"
    upload_dir: str = str(BACKEND_ROOT / "uploads")
    cors_origins: str = "http://localhost:3000"
    host: str = "0.0.0.0"
    port: int = 8000

    # 语音
    whisper_model: str = "base"
    tts_voice: str = "zh-CN-XiaoxiaoNeural"
    silence_nudge_seconds: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
