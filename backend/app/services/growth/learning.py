"""面试结束后的学习沉淀。

两类「自我成长」：
1. 候选人成长：写入 GrowthRecord（弱项、训练计划）——已有路径
2. 系统迭代：本地 JSON memory，统计哪些追问类别更常触发、公司/岗位组合效果

本模块专注 (2)，不依赖外部服务。
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.models import InterviewSession

logger = logging.getLogger(__name__)


def _memory_path() -> Path:
    root = Path(__file__).resolve().parents[2] / "data"
    root.mkdir(parents=True, exist_ok=True)
    return root / "system_learning.json"


def _load() -> dict[str, Any]:
    path = _memory_path()
    if not path.exists():
        return {
            "version": 1,
            "followup_category_hits": {},
            "company_session_counts": {},
            "role_session_counts": {},
            "avg_scores_by_company": {},
            "effective_probes": [],
            "updated_at": None,
        }
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("读取 system_learning 失败: %s", e)
        return {"version": 1}


def _save(data: dict[str, Any]) -> None:
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    path = _memory_path()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def record_interview_learning(
    session: InterviewSession,
    *,
    agent_state: dict[str, Any] | None = None,
    report: dict[str, Any] | None = None,
) -> None:
    """从一次已完成面试中提取系统可学习信号。"""
    data = _load()
    company = session.company or "unknown"
    role = session.role or "unknown"

    counts = data.setdefault("company_session_counts", {})
    counts[company] = int(counts.get(company, 0)) + 1

    roles = data.setdefault("role_session_counts", {})
    roles[role] = int(roles.get(role, 0)) + 1

    score = session.overall_score
    if score is not None:
        avgs = data.setdefault("avg_scores_by_company", {})
        prev = avgs.get(company) or {"sum": 0, "n": 0}
        prev["sum"] = int(prev.get("sum", 0)) + int(score)
        prev["n"] = int(prev.get("n", 0)) + 1
        avgs[company] = prev

    state = agent_state or {}
    try:
        if not state and session.agent_state:
            state = json.loads(session.agent_state)
    except json.JSONDecodeError:
        state = {}

    # 追问工具轨迹
    hits = data.setdefault("followup_category_hits", {})
    for item in state.get("tool_trace") or []:
        tool = item.get("tool") if isinstance(item, dict) else None
        if tool:
            hits[tool] = int(hits.get(tool, 0)) + 1

    # 有效追问线索（薄弱点）
    probes = data.setdefault("effective_probes", [])
    for wp in (state.get("weak_points") or [])[:5]:
        entry = {
            "company": company,
            "role": role,
            "point": str(wp)[:200],
            "session_id": session.id,
        }
        probes.append(entry)
    if len(probes) > 200:
        del probes[:-200]

    # 报告中的弱项也可计入
    if report:
        for w in (report.get("weaknesses") or [])[:5]:
            probes.append({
                "company": company,
                "role": role,
                "point": str(w)[:200],
                "session_id": session.id,
                "source": "report",
            })

    _save(data)
    logger.info("系统学习已更新 session=%s company=%s", session.id, company)


def get_system_insights(limit: int = 10) -> dict[str, Any]:
    """供成长页 / API 读取的系统洞察摘要。"""
    data = _load()
    avgs_raw = data.get("avg_scores_by_company") or {}
    avg_scores = {
        k: round(v["sum"] / v["n"], 1) if v.get("n") else None
        for k, v in avgs_raw.items()
        if isinstance(v, dict)
    }
    probes = list(reversed(data.get("effective_probes") or []))[:limit]
    return {
        "company_session_counts": data.get("company_session_counts") or {},
        "role_session_counts": data.get("role_session_counts") or {},
        "avg_scores_by_company": avg_scores,
        "followup_category_hits": data.get("followup_category_hits") or {},
        "recent_probes": probes,
        "updated_at": data.get("updated_at"),
        "github_token_configured": bool(get_settings().github_token),
        "interview_tools_enabled": bool(get_settings().interview_tools_enabled),
    }
