"""上下文压缩与 token 估算。"""

import json
from typing import Any


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数（中文约 1.5 字符/token）。"""
    return max(1, int(len(text) / 1.5))


def compress_messages(messages: list[dict[str, Any]], max_tokens: int) -> list[dict[str, Any]]:
    """超过阈值时保留 system + 最近对话。"""
    total = sum(estimate_tokens(str(m.get("content", ""))) for m in messages)
    if total <= max_tokens * 0.6:
        return messages
    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]
    # 保留最近 20 条
    return system + rest[-20:]
