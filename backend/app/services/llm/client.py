"""OpenAI 兼容 LLM 客户端（BYOK）。"""

import json
import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import LLMSettings

logger = logging.getLogger(__name__)


class LLMClient:
    """支持 OpenAI Chat Completions 格式的 BYOK 客户端。"""

    def __init__(
        self,
        api_base: str,
        api_key: str,
        model: str,
        max_tokens: int = 4096,
    ):
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens

    @classmethod
    def from_db(cls, db: Session) -> "LLMClient":
        """从数据库读取 BYOK 配置，回退到环境变量。"""
        settings = get_settings()
        row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()

        api_base = (row.api_base if row and row.api_base else None) or settings.llm_api_base
        api_key = (row.api_key if row and row.api_key else None) or settings.llm_api_key
        model = (row.model if row and row.model else None) or settings.llm_model
        max_tokens = (row.max_tokens if row else None) or settings.llm_max_tokens

        return cls(api_base=api_base, api_key=api_key, model=model, max_tokens=max_tokens)

    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        response_format: dict[str, str] | None = None,
    ) -> str:
        """发送 Chat Completions 请求并返回文本内容。"""
        url = f"{self.api_base}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        return data["choices"][0]["message"]["content"]

    async def chat_json(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
    ) -> dict[str, Any]:
        """请求 JSON 格式响应并解析。"""
        content = await self.chat(
            messages,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        return json.loads(content)

    async def test_connection(self) -> tuple[bool, str]:
        """测试 API 连通性。"""
        try:
            reply = await self.chat(
                [{"role": "user", "content": "请回复：连接成功"}],
                temperature=0,
            )
            return True, reply[:100]
        except httpx.HTTPStatusError as e:
            return False, f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        except Exception as e:
            return False, str(e)
