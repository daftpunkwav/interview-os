"""OpenAI 兼容 LLM 客户端（BYOK）。"""

import json
import logging
from collections.abc import AsyncIterator
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
        protocol: str = "openai_chat",
        reasoning_effort: str | None = None,
    ):
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.protocol = protocol
        self.reasoning_effort = reasoning_effort

    @classmethod
    def from_db(cls, db: Session) -> "LLMClient":
        """从数据库读取 BYOK 配置，回退到环境变量。"""
        settings = get_settings()
        row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()

        api_base = (row.api_base if row and row.api_base else None) or settings.llm_api_base
        api_key = (row.api_key if row and row.api_key else None) or settings.llm_api_key
        model = (row.model if row and row.model else None) or settings.llm_model
        max_tokens = (row.max_tokens if row else None) or settings.llm_max_tokens
        protocol = (row.protocol if row and hasattr(row, "protocol") and row.protocol else None) or "openai_chat"
        reasoning = getattr(row, "reasoning_effort", None) if row else None

        return cls(
            api_base=api_base,
            api_key=api_key,
            model=model,
            max_tokens=max_tokens,
            protocol=protocol or "openai_chat",
            reasoning_effort=reasoning,
        )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(
        self,
        messages: list[dict[str, Any]],
        temperature: float,
        stream: bool = False,
        response_format: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
            "temperature": temperature,
            "stream": stream,
        }
        if response_format:
            payload["response_format"] = response_format
        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        return payload

    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        response_format: dict[str, str] | None = None,
    ) -> str:
        """发送 Chat Completions 请求并返回文本内容。"""
        url = f"{self.api_base}/chat/completions"
        payload = self._build_payload(messages, temperature, response_format=response_format)

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()

        return data["choices"][0]["message"]["content"]

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.75,
    ) -> AsyncIterator[str]:
        """流式返回 token。"""
        url = f"{self.api_base}/chat/completions"
        payload = self._build_payload(messages, temperature, stream=True)

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, headers=self._headers(), json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield token
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

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

    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
    ) -> list[list[float]]:
        """调用 OpenAI 兼容 /embeddings 端点，返回每段文本的向量。

        Args:
            texts: 待嵌入的文本列表。
            model: 可选覆盖默认模型；不传则用 ``self.model``。

        Returns:
            与输入等长的向量列表。
        """
        url = f"{self.api_base}/embeddings"
        payload: dict[str, Any] = {
            "model": model or self.model,
            "input": texts,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()

        # OpenAI 标准：{"data": [{"embedding": [...]}, ...]}
        return [item["embedding"] for item in data["data"]]
