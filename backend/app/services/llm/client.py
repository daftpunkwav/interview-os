"""OpenAI 兼容 LLM 客户端（BYOK）。

变更点：

- ``from_db`` 自动解密数据库中加密的 ``api_key``；
- 每次请求校验 ``api_base`` 是否安全（SSRF 防御，dev/prod 由 settings 决定）；
- 默认超时收紧到 60 s；
- 错误日志脱敏 API Key；
- 4xx 不重试；429/5xx 自动指数退避重试（默认 3 次）。
"""

from __future__ import annotations

import asyncio
import json
import logging
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


async def _retry_request(
    coro_factory,
    *,
    max_retries: int = 3,
    backoff: float = 0.5,
    is_stream: bool = False,
) -> httpx.Response:
    """对 429/5xx 指数退避重试；4xx 直接抛出。

    ``coro_factory`` 是无参 callable，每次返回新的 coroutine（避免同一
    response 被多次 await）。``is_stream=True`` 时调用方自行处理流关闭。
    """
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        coro = coro_factory()
        try:
            resp = await coro
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code if e.response else 0
            if status_code == 429 or status_code >= 500:
                last_exc = e
                if attempt < max_retries:
                    if is_stream:
                        try:
                            await e.response.aclose()
                        except Exception:
                            pass
                    await asyncio.sleep(backoff * (2 ** attempt))
                    continue
            raise
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteError, httpx.RemoteProtocolError) as e:
            last_exc = e
            if attempt < max_retries:
                await asyncio.sleep(backoff * (2 ** attempt))
                continue
            raise
        if resp.status_code == 429 or resp.status_code >= 500:
            last_exc = httpx.HTTPStatusError(
                f"transient {resp.status_code}",
                request=resp.request,
                response=resp,
            )
            if attempt < max_retries:
                # 流式响应需先关闭连接再重试，避免连接泄漏
                if is_stream:
                    try:
                        await resp.aclose()
                    except Exception:
                        pass
                await asyncio.sleep(backoff * (2 ** attempt))
                continue
            resp.raise_for_status()
        return resp
    # 所有重试耗尽
    assert last_exc is not None
    raise last_exc


def _is_local_allowed() -> bool:
    """每次请求重新计算，避免模块级缓存的环境变量无法响应测试 monkeypatch。"""
    return bool(get_settings().allow_local_llm)


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
        if not is_safe_http_url(self.api_base, allow_local=_is_local_allowed()):
            raise UnsafeURLError(f"LLM api_base 不安全: {self.api_base}")
        url = f"{self.api_base}/chat/completions"
        payload = self._build_payload(
            messages, temperature, response_format=response_format, tools=tools
        )
        headers = self._headers()

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await _retry_request(
                    lambda: client.post(url, headers=headers, json=payload)
                )
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

        content = data["choices"][0]["message"].get("content")
        return content if content is not None else ""

    async def chat_message(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        response_format: dict[str, str] | None = None,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """发送 Chat Completions 并返回完整 message 对象（含 tool_calls）。

        返回形如::

            {
              "role": "assistant",
              "content": "...",
              "tool_calls": [
                {"id": "...", "type": "function",
                 "function": {"name": "...", "arguments": "{...}"}}
              ]
            }

        用于面试 Agent 的工具调用循环；无 tool_calls 时仅含 content。
        """
        if not is_safe_http_url(self.api_base, allow_local=_is_local_allowed()):
            raise UnsafeURLError(f"LLM api_base 不安全: {self.api_base}")
        url = f"{self.api_base}/chat/completions"
        payload = self._build_payload(
            messages, temperature, response_format=response_format, tools=tools
        )
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice
        headers = self._headers()

        async with httpx.AsyncClient(timeout=90.0) as client:
            try:
                resp = await _retry_request(
                    lambda: client.post(url, headers=headers, json=payload)
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as e:
                logger.warning(
                    "LLM chat_message 失败: model=%s status=%s key=%s",
                    self.model,
                    e.response.status_code,
                    redact_api_key(self.api_key),
                )
                raise

        msg = data["choices"][0]["message"]
        # 规范化：保证可 JSON 序列化
        result: dict[str, Any] = {
            "role": msg.get("role") or "assistant",
            "content": msg.get("content"),
        }
        if msg.get("tool_calls"):
            result["tool_calls"] = msg["tool_calls"]
        return result

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.75,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        """流式返回 token。

        可选 ``tools`` 用于注入 OpenAI 兼容的 tools 数组,例如 StepFun 的
        ``tools[].type=retrieval`` —— 检索由服务端在 chat 调用时执行。

        4xx 立即失败；429/5xx 重试。流式响应在重试前需先 aclose 防连接泄漏。
        """
        if not is_safe_http_url(self.api_base, allow_local=_is_local_allowed()):
            raise UnsafeURLError(f"LLM api_base 不安全: {self.api_base}")
        url = f"{self.api_base}/chat/completions"
        payload = self._build_payload(messages, temperature, stream=True, tools=tools)
        headers = self._headers()

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", url, headers=headers, json=payload
            ) as resp:
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
        settings = get_settings()
        base = settings.effective_embeddings_base
        if not is_safe_http_url(base, allow_local=_is_local_allowed()):
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
                resp = await _retry_request(
                    lambda: client.post(url, headers=headers, json=payload)
                )
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
