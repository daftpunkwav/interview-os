"""应用配置模块。"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.constants import DEFAULT_RAG_BACKEND, RAGBackendKind

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

    # LLM 嵌入（可选）：None 时回退到上方 LLM BYOK 配置
    llm_embeddings_base: str | None = None
    llm_embeddings_key: str | None = None
    llm_embeddings_model: str | None = None

    # RAG 后端选择
    rag_backend: RAGBackendKind = DEFAULT_RAG_BACKEND
    # StepFun 后端专用：若已存在 StepFun vector_store，直接复用 ID；留空则启动时自动创建。
    stepfun_vector_store_id: str | None = None

    # 服务
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'data' / 'interviewos.db'}"
    upload_dir: str = str(BACKEND_ROOT / "uploads")
    cors_origins: str = "http://localhost:3000"
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)

    # 语音
    whisper_model: str = "base"
    tts_voice: str = "zh-CN-XiaoxiaoNeural"
    silence_nudge_seconds: int = Field(default=10, ge=1, le=600)

    @field_validator("cors_origins")
    @classmethod
    def _strip_cors(cls, v: str) -> str:
        """清理每个 origin 两侧的空白，便于后续拆分。"""
        return ",".join(o.strip() for o in v.split(",") if o.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o for o in self.cors_origins.split(",") if o]

    @property
    def effective_embeddings_base(self) -> str:
        """解析后的 embeddings base：独立配置优先，否则回退到 chat base。"""
        return (self.llm_embeddings_base or self.llm_api_base).rstrip("/")

    @property
    def effective_embeddings_key(self) -> str:
        return self.llm_embeddings_key or self.llm_api_key

    @property
    def effective_embeddings_model(self) -> str:
        return self.llm_embeddings_model or self.llm_model


@lru_cache
def get_settings() -> Settings:
    return Settings()
