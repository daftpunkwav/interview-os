"""DuckDuckGo 网络搜索工具。"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def build_site_scoped_query(query: str, sites: list[str] | None = None) -> str:
    """为查询附加 ``site:`` 过滤；无站点时原样返回。

    供简历评价、面经检索等复用；站点列表由调用方传入（见 ``sites.py``）。
    """
    q = (query or "").strip()
    if not q:
        return ""
    cleaned = [s.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0]
               for s in (sites or []) if s and s.strip()]
    if not cleaned:
        return q
    site_expr = " OR ".join(f"site:{s}" for s in cleaned)
    return f"({site_expr}) {q}"


def web_search(
    query: str,
    max_results: int = 5,
    sites: list[str] | None = None,
) -> str:
    """执行文本搜索；``sites`` 非空时限定域名（为牛客/BOSS 等预留）。"""
    try:
        from duckduckgo_search import DDGS

        final_query = build_site_scoped_query(query, sites)
        if not final_query:
            return "查询词为空。"
        with DDGS() as ddgs:
            results = list(ddgs.text(final_query, max_results=max_results))
        if not results:
            return "未找到相关结果。"
        lines = [
            f"- {r.get('title', '')}: {r.get('href', '')} | {r.get('body', '')[:220]}"
            for r in results
        ]
        return "\n".join(lines)
    except Exception as e:
        logger.warning("搜索失败: %s", e)
        return f"搜索暂时不可用: {e}"
