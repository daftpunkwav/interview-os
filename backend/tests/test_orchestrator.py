"""InterviewOrchestrator 单元测试，重点覆盖静默追问索引算法。"""

from __future__ import annotations

from app.agents.orchestrator import InterviewOrchestrator


def test_silence_nudge_strict_branch_uses_strict_templates() -> None:
    """压力人格应走严格分支模板。"""
    orch = InterviewOrchestrator()
    nudge = orch.build_silence_nudge("pressure", strictness=3)
    # strictness=3 本应走温柔分支，但 pressure 人格强制走严格分支
    assert "直接回答" in nudge or "尽快给出" in nudge or "更具体" in nudge


def test_silence_nudge_gentle_branch_uses_gentle_templates() -> None:
    """温和人格 + 低严格度应走温柔分支模板。"""
    orch = InterviewOrchestrator()
    nudge = orch.build_silence_nudge("gentle", strictness=1)
    assert "没关系" in nudge or "印象最深" in nudge or "换个角度" in nudge


def test_silence_nudge_low_strictness_uses_first_template() -> None:
    """严格度 1-4 应命中第 0 条模板（最温和/最克制）。"""
    orch = InterviewOrchestrator()
    for s in (1, 2, 3, 4):
        nudge = orch.build_silence_nudge("professional", strictness=s)
        assert "没关系" in nudge, f"strictness={s} 应命中第0条: {nudge}"


def test_silence_nudge_mid_strictness_uses_second_template() -> None:
    """严格度 5-8 应命中第 1 条模板。"""
    orch = InterviewOrchestrator()
    for s in (5, 6, 7, 8):
        nudge = orch.build_silence_nudge("professional", strictness=s)
        # 严格度>=6 走严格分支，5 走温柔分支
        if s >= 6:
            assert "时间有限" in nudge, f"strictness={s} 应命中严格第1条: {nudge}"
        else:
            assert "印象最深" in nudge, f"strictness={s} 应命中温柔第1条: {nudge}"


def test_silence_nudge_max_strictness_uses_last_template() -> None:
    """严格度 9-10 应命中第 2 条模板（最直接/最施压）。"""
    orch = InterviewOrchestrator()
    for s in (9, 10):
        nudge = orch.build_silence_nudge("professional", strictness=s)
        assert "更具体" in nudge, f"strictness={s} 应命中第2条: {nudge}"


def test_silence_nudge_normal_strictness_not_skips_first_template() -> None:
    """回归：正常严格度(3)不应跳过第0条模板（修复 A-12 的核心断言）。

    旧 bug: idx=min(strictness,2) 使 strictness=1 时 idx=1，跳过第0条；
    且非压力分支下 strictness 1-5 全映射到固定区间。
    """
    orch = InterviewOrchestrator()
    nudge = orch.build_silence_nudge("professional", strictness=1)
    # strictness=1 应命中第0条（最温和），不是第1条
    assert "没关系" in nudge, f"strictness=1 应命中第0条最温和模板: {nudge}"
