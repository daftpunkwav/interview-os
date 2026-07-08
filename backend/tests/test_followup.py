"""followup 信号分析器单元测试。"""

from __future__ import annotations

from app.services.interview.followup import analyze


def test_empty_answer_triggers_missing_data() -> None:
    sig = analyze("")
    assert sig.needs_followup
    assert sig.category == "missing_data"


def test_vague_terms_short_answer_triggers_vague() -> None:
    sig = analyze("差不多就是这样吧", question="请描述一次性能优化")
    assert sig.needs_followup
    assert sig.category == "vague"


def test_long_answer_without_data_triggers_missing_data() -> None:
    sig = analyze(
        "我们对这个接口进行了完整的性能优化工作，从架构设计到代码实现"
        "都做了深入的改进，整体效果非常好，用户反馈也很满意。",
        question="请说说这次性能优化的具体效果",
    )
    assert sig.needs_followup
    assert sig.category == "missing_data"


def test_answer_with_quantitative_data_passes() -> None:
    sig = analyze(
        "接口 RT 从 200ms 降至 35ms，QPS 从 1.2k 提升到 8k，错误率下降 90%。",
        question="请说说这次性能优化的具体效果",
    )
    assert not sig.needs_followup


def test_off_topic_low_overlap_triggers_off_topic() -> None:
    sig = analyze(
        "我平时喜欢打篮球，周末会和朋友去爬山。",
        question="请介绍一个你最有成就感的项目，并说明你在其中的角色。",
    )
    assert sig.needs_followup
    assert sig.category == "off_topic"


def test_tech_hole_triggers_when_no_domain_match() -> None:
    sig = analyze(
        "我做了用户调研和需求分析，与产品经理合作完成了 PRD 撰写。",
        question="请介绍你的技术项目",
        tech_domains=["Python", "FastAPI", "PostgreSQL"],
    )
    assert sig.needs_followup
    assert sig.category == "tech_hole"


def test_answer_with_tech_keywords_passes() -> None:
    sig = analyze(
        "我们使用 FastAPI 重构了接口，配合 PostgreSQL 索引优化，"
        "QPS 提升至 1.2 万。",
        question="请介绍你的技术项目",
        tech_domains=["Python", "FastAPI", "PostgreSQL"],
    )
    assert not sig.needs_followup


def test_suggested_probe_is_non_empty_when_followup() -> None:
    sig = analyze("可能差不多吧", question="自我介绍")
    assert sig.suggested_probe
    assert len(sig.suggested_probe) > 5