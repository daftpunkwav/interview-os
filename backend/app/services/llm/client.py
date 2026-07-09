"""OpenAI 兼容 LLM 客户端（BYOK）。

变更点：

- ``from_db`` 自动解密数据库中加密的 ``api_key``；
- 每次请求校验 ``api_base`` 是否安全（SSRF 防御）；
- 默认超时收紧到 60 s；
- 错误日志脱敏 API Key。
"""

import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.constants import DEFAULT_LLM_PROTOCOL
from app.core.security import UnsafeURLError, is_safe_http_url, redact_api_key
from app.core.secrets import LegacySecretFormatError, decrypt_secret
from app.models import LLMSettings

logger = logging.getLogger(__name__)
_IS_DEV = os.environ.get("INTERVIEWOS_ENV", "dev") != "prod"


class LLMClient:
    """支持 OpenAI Chat Completions 格式的 BYOK 客户端。"""

    def __init__(
        self,
        api_base: str,
        api_key: str,
        model: str,
        max_tokens: int = 4096,
        protocol: str = DEFAULT_LLM_PROTOCOL,
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
        raw_api_key = (row.api_key if row and row.api_key else None) or settings.llm_api_key
        # 自动解密加密的 API Key；解密失败回退空串
        try:
            api_key = decrypt_secret(raw_api_key) or ""
        except LegacySecretFormatError as e:
            logger.error("API Key 使用旧版加密格式，请重新保存: %s", e)
            api_key = ""
        except ValueError as e:
            logger.error("API Key 解密失败: %s", e)
            api_key = ""
        model = (row.model if row and row.model else None) or settings.llm_model
        max_tokens = (row.max_tokens if row else None) or settings.llm_max_tokens
        protocol = (row.protocol if row and hasattr(row, "protocol") and row.protocol else None) or DEFAULT_LLM_PROTOCOL
        reasoning = getattr(row, "reasoning_effort", None) if row else None

        return cls(
            api_base=api_base,
            api_key=api_key,
            model=model,
            max_tokens=max_tokens,
            protocol=protocol or DEFAULT_LLM_PROTOCOL,
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
        tools: list[dict[str, Any]] | None = None,
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
        if tools:
            payload["tools"] = tools
        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        return payload

    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        response_format: dict[str, str] | None = None,
        tools: list[dict[str, Any]] | None = None,
    ) -> str:
        """发送 Chat Completions 请求并返回文本内容。"""
        url = f"{self.api_base}/chat/completions"
        if not is_safe_http_url(self.api_base, allow_local=_IS_DEV):
            raise UnsafeURLError(f"LLM api_base 不安全: {self.api_base}")
        payload = self._build_payload(
            messages, temperature, response_format=response_format, tools=tools
        )

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await client.post(url, headers=self._headers(), json=payload)
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as e:
                logger.warning(
                    "LLM chat 失败: model=%s status=%s key=%s",
                    self.model,
                    e.response.status_code,
                    redact_api_key(self.api_key),
                )
                raise

        return data["choices"][0]["message"]["content"]

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.75,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        """流式返回 token。

        可选 ``tools`` 用于注入 OpenAI 兼容的 tools 数组,例如 StepFun 的
        ``tools[].type=retrieval`` —— 检索由服务端在 chat 调用时执行。
        """
        url = f"{self.api_base}/chat/completions"
        payload = self._build_payload(messages, temperature, stream=True, tools=tools)

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

        URL / Key / Model 读取顺序：

        - 优先使用 ``LLM_EMBEDDINGS_BASE`` / ``LLM_EMBEDDINGS_KEY`` /
          ``LLM_EMBEDDINGS_MODEL``(对应 :class:`app.config.Settings`
          的 ``llm_embeddings_*`` 字段)；
        - 任一字段未配置则回退到 ``LLM_API_BASE`` / ``LLM_API_KEY`` / ``LLM_MODEL``,
          行为与重构前完全一致。

        Args:
            texts: 待嵌入的文本列表。
            model: 可选覆盖默认模型；不传则用 ``effective_embeddings_model``。

        Returns:
            与输入等长的向量列表。
        """
        from app.config import get_settings

        settings = get_settings()
        base = settings.effective_embeddings_base
        if not is_safe_http_url(base, allow_local=_IS_DEV):
            raise UnsafeURLError(f"Embeddings api_base 不安全: {base}")

        url = f"{base}/embeddings"
        payload: dict[str, Any] = {
            "model": model or settings.effective_embeddings_model,
            "input": texts,
        }
        # embeddings 使用专用 key（如有），否则回退 chat key。
        embed_key = settings.effective_embeddings_key or self.api_key
        headers = {
            "Authorization": f"Bearer {embed_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as e:
                logger.warning(
                    "LLM embed 失败: model=%s status=%s key=%s",
                    payload["model"],
                    e.response.status_code,
                    redact_api_key(embed_key),
                )
                raise

        # OpenAI 标准：{"data": [{"embedding": [...]}, ...]}
        return [item["embedding"] for item in data["data"]]
