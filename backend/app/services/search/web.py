"""DuckDuckGo 网络搜索工具。"""

import logging

logger = logging.getLogger(__name__)


def web_search(query: str, max_results: int = 5) -> str:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return "未找到相关结果。"
        lines = [f"- {r.get('title', '')}: {r.get('body', '')[:200]}" for r in results]
        return "\n".join(lines)
    except Exception as e:
        logger.warning("搜索失败: %s", e)
        return f"搜索暂时不可用: {e}"
