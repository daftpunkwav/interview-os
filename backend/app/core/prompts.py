"""Agent / LLM 共用提示词片段。

所有面向用户或结构化输出的 system prompt 应通过 :func:`with_agent_output_rules`
注入统一输出约束，避免各处复制粘贴不一致。
"""

from __future__ import annotations

# 全站 Agent 输出硬性约束（追加到 system 末尾）
AGENT_OUTPUT_RULES = """
## 输出约束（必须遵守）
- 禁止使用任何 emoji 表情符号、颜文字、绘文字或表情包式符号（例如笑脸、鼓掌、火焰等 Unicode 表情）
- 仅使用纯文字、数字与常规中英文标点；可用 Markdown 排版
- 不要用表情代替语气；保持专业书面表达
""".strip()


def with_agent_output_rules(system_prompt: str) -> str:
    """在 system prompt 末尾追加统一输出约束（幂等）。"""
    text = (system_prompt or "").rstrip()
    if "禁止使用任何 emoji" in text:
        return text
    if not text:
        return AGENT_OUTPUT_RULES
    return f"{text}\n\n{AGENT_OUTPUT_RULES}"
