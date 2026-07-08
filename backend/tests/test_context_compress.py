"""上下文压缩单元测试。"""

from __future__ import annotations

from app.services.context.manager import (
    compress_messages,
    estimate_messages_tokens,
    estimate_tokens,
)


def test_estimate_tokens_empty() -> None:
    assert estimate_tokens("") == 0


def test_estimate_tokens_rough_ratio() -> None:
    # 1.5 字符/token 启发式
    assert estimate_tokens("abc") == 2  # 3 / 1.5 = 2
    assert estimate_tokens("你好") == 1  # 2 / 1.5 = 1


def test_compress_under_threshold_returns_input() -> None:
    msgs = [{"role": "user", "content": "短消息"}]
    out = compress_messages(msgs, max_tokens=10000)
    assert out is msgs or out == msgs


def test_compress_keeps_all_system_messages() -> None:
    msgs = [
        {"role": "system", "content": "规则一"},
        {"role": "system", "content": "规则二"},
    ] + [{"role": "user", "content": f"消息{i}"} for i in range(50)]
    out = compress_messages(msgs, max_tokens=100)
    system = [m for m in out if m["role"] == "system"]
    # 包含 2 条原始 system 消息 + 1 条压缩说明
    rule_msgs = [m for m in system if m["content"] in ("规则一", "规则二")]
    assert len(rule_msgs) == 2
    # 最近 20 条对话应保留
    assert any("消息49" in m["content"] for m in out)


def test_compress_adds_summary_marker() -> None:
    msgs = (
        [{"role": "system", "content": "规则"}]
        + [{"role": "user", "content": f"old{i}"} for i in range(30)]
        + [{"role": "user", "content": f"new{i}"} for i in range(5)]
    )
    out = compress_messages(msgs, max_tokens=100)
    summary = [m for m in out if m["role"] == "system" and "上下文压缩" in m["content"]]
    assert summary


def test_estimate_messages_tokens_sums_contents() -> None:
    msgs = [
        {"role": "system", "content": "abc"},
        {"role": "user", "content": "defg"},
    ]
    # 3/1.5=2, 4/1.5=2 -> 4
    assert estimate_messages_tokens(msgs) == 4