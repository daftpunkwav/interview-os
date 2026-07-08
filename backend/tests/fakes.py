"""测试用假 LLM 客户端。

按顺序消费预设 token 序列；``chat_json`` 返回预设 JSON。
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any


class FakeLLMClient:
    """可控的 LLM stub。

    每次 ``chat_stream`` 调用依次吐出 ``tokens`` 列表中的 token，最终返回 ``done``。
    """

    def __init__(self, tokens: list[str] | None = None, json_payload: dict | None = None):
        self.tokens: list[str] = tokens or ["你好，", "请先自我介绍。"]
        self.json_payload = json_payload or {"overall_score": 80}
        self.chat_calls: list[list[dict[str, Any]]] = []
        self.stream_calls: list[list[dict[str, Any]]] = []

    async def chat(self, messages, temperature: float = 0.7, response_format=None) -> str:
        self.chat_calls.append(messages)
        if response_format and response_format.get("type") == "json_object":
            return json.dumps(self.json_payload, ensure_ascii=False)
        return "".join(self.tokens)

    async def chat_stream(self, messages, temperature: float = 0.75) -> AsyncIterator[str]:
        self.stream_calls.append(messages)
        for t in self.tokens:
            yield t

    async def chat_json(self, messages, temperature: float = 0.3) -> dict[str, Any]:
        return self.json_payload

    async def test_connection(self) -> tuple[bool, str]:
        return True, "ok"