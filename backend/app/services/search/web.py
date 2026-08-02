"""网络搜索工具（优先 ddgs，兼容旧包 duckduckgo_search）。"""

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
    cleaned = [
        s.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0]
        for s in (sites or [])
        if s and s.strip()
    ]
    if not cleaned:
        return q
    site_expr = " OR ".join(f"site:{s}" for s in cleaned)
    return f"({site_expr}) {q}"


def _format_results(results: list[dict], max_results: int) -> str:
    if not results:
        return "未找到相关结果。"
    lines: list[str] = []
    for i, r in enumerate(results[:max_results], start=1):
        title = (r.get("title") or "").strip()
        href = (r.get("href") or r.get("link") or "").strip()
        body = (r.get("body") or r.get("snippet") or "").strip()
        lines.append(f"[{i}] {title}\n    URL: {href}\n    摘要: {body[:280]}")
    return "\n".join(lines)


# 国内网络下 bing 通常最稳；不把 auto 放进列表，避免卡在 yandex 长时间超时
_DDGS_BACKENDS = ("bing", "duckduckgo")


def _search_with_ddgs(query: str, max_results: int) -> list[dict]:
    from ddgs import DDGS

    errors: list[str] = []
    with DDGS() as client:
        for backend in _DDGS_BACKENDS:
            try:
                results = list(
                    client.text(query, max_results=max_results, backend=backend)
                )
                if results:
                    return results
                errors.append(f"{backend}: empty")
            except Exception as e:
                errors.append(f"{backend}: {e}")
                logger.info("ddgs backend=%s 失败: %s", backend, e)
    raise RuntimeError("; ".join(errors)[:400] or "no backend succeeded")


def _search_with_legacy(query: str, max_results: int) -> list[dict]:
    from duckduckgo_search import DDGS

    with DDGS() as client:
        return list(client.text(query, max_results=max_results))


def web_search(
    query: str,
    max_results: int = 5,
    sites: list[str] | None = None,
) -> str:
    """执行文本搜索；``sites`` 非空时限定域名（为牛客/BOSS 等预留）。"""
    final_query = build_site_scoped_query(query, sites)
    if not final_query:
        return "查询词为空。"

    errors: list[str] = []

    # 1) 新包 ddgs（需已安装；按 backend 依次回退）
    try:
        results = _search_with_ddgs(final_query, max_results)
        return _format_results(results, max_results)
    except Exception as e:
        errors.append(f"ddgs: {e}")
        logger.warning("ddgs 搜索失败，尝试旧包: %s", e)

    # 2) 兼容旧依赖
    try:
        results = _search_with_legacy(final_query, max_results)
        return _format_results(results, max_results)
    except Exception as e:
        errors.append(f"duckduckgo_search: {e}")
        logger.warning("旧包搜索失败: %s", e)

    detail = " | ".join(errors)[:400]
    return (
        "SEARCH_UNAVAILABLE\n"
        f"搜索暂时不可用（{detail}）。\n"
        "请勿编造搜索结果列表、链接或引用编号；可基于通用知识继续辅导，"
        "并明确告知用户「以下为通用知识整理，非实时检索」。"
    )
