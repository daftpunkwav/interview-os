"""InterviewRunner 单元测试。"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import pytest

from app.models import InterviewSession, LLMSettings
from app.services.interview.events import EventKind
from app.services.interview.runner import InterviewRunner
from tests.fakes import FakeLLMClient


def _make_session(db) -> InterviewSession:
    s = InterviewSession(
        profile_id=1,
        role="后端工程师",
        level="中级工程师",
        company="bytedance",
        workflow_type="technical",
        personality="professional",
        strictness=3,
        interview_style="deep_dive",
        avatar_id="professional_male",
        scene_id="meeting_room",
        status="pending",
        current_phase="identity_check",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


async def _consume(events: AsyncIterator) -> list:
    return [e async for e in events]


def test_stream_opening_records_first_question(db) -> None:
    """开场回合应流式输出 token 并保存状态。"""
    session = _make_session(db)
    llm = FakeLLMClient(tokens=["你好，", "我是面试官。", "请自我介绍一下。"])
    runner = InterviewRunner(session, llm)

    events = []
    import asyncio

    async def run():
        async for e in runner.stream_opening(db):
            events.append(e)

    asyncio.run(run())

    tokens = [e.token for e in events if e.kind == EventKind.TOKEN]
    assert tokens == ["你好，", "我是面试官。", "请自我介绍一下。"]

    turn_done = next(e for e in events if e.kind == EventKind.TURN_COMPLETE)
    assert turn_done.content == "你好，我是面试官。请自我介绍一下。"
    assert turn_done.phase_id == "identity_check"
    assert turn_done.is_complete is False

    db.refresh(session)
    assert session.status == "active"
    assert session.started_at is not None
    state = json.loads(session.agent_state)
    assert state["phase_idx"] == 0
    assert state["questions_in_phase"] == 1


def test_stream_turn_increments_question_count(db) -> None:
    """普通回合在未达 max_questions 时不应触发 phase_changed。"""
    session = _make_session(db)
    # 手动把 phase_idx 推到 project_deep_dive（max=6）避免自动 advance
    session.agent_state = json.dumps({"phase_idx": 3, "questions_in_phase": 0})
    session.current_phase = "project_deep_dive"
    db.commit()
    db.refresh(session)

    llm = FakeLLMClient(tokens=["好的，", "请讲讲你最擅长的项目。"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        events = []
        async for e in runner.stream_turn("我叫张三", db):
            events.append(e)
        return events

    events = asyncio.run(run())
    turn_done = next(e for e in events if e.kind == EventKind.TURN_COMPLETE)
    assert turn_done.phase_id == "project_deep_dive"
    assert turn_done.phase_changed is False

    db.refresh(session)
    state = json.loads(session.agent_state)
    assert state["questions_in_phase"] == 1


def test_stream_turn_advances_phase_on_marker(db) -> None:
    """LLM 输出 [PHASE_COMPLETE] 时应推进到下一阶段。"""
    session = _make_session(db)
    llm = FakeLLMClient(tokens=["好的，", "身份确认完毕。", "[PHASE_COMPLETE]"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        async for _ in runner.stream_opening(db):
            pass
        events = []
        async for e in runner.stream_turn("我叫张三", db):
            events.append(e)
        return events

    events = asyncio.run(run())
    turn_done = next(e for e in events if e.kind == EventKind.TURN_COMPLETE)
    assert turn_done.phase_changed is True
    assert turn_done.phase_id == "self_intro"

    db.refresh(session)
    state = json.loads(session.agent_state)
    assert state["phase_idx"] == 1
    assert state["questions_in_phase"] == 0


def test_stream_turn_advances_phase_on_max_reached(db) -> None:
    """问题数达到当前阶段 max 时自动推进。"""
    session = _make_session(db)
    # identity_check 阶段 max_questions = 1
    llm = FakeLLMClient(tokens=["继续。"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        async for _ in runner.stream_opening(db):
            pass
        events = []
        async for e in runner.stream_turn("回答", db):
            events.append(e)
        return events

    events = asyncio.run(run())
    turn_done = next(e for e in events if e.kind == EventKind.TURN_COMPLETE)
    assert turn_done.phase_changed is True
    assert turn_done.phase_id == "self_intro"


def test_stream_turn_marks_complete_on_interview_marker(db) -> None:
    """[INTERVIEW_COMPLETE] 标记应结束面试。"""
    session = _make_session(db)
    llm = FakeLLMClient(tokens=["面试结束，", "感谢你的时间。", "[INTERVIEW_COMPLETE]"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        events = []
        async for e in runner.stream_turn("最后一条回答", db):
            events.append(e)
        return events

    events = asyncio.run(run())
    turn_done = next(e for e in events if e.kind == EventKind.TURN_COMPLETE)
    assert turn_done.is_complete is True

    db.refresh(session)
    assert session.status == "completed"
    assert session.ended_at is not None


def test_stream_turn_with_face_appends_hints(db) -> None:
    """面部分析提示应拼接到 LLM 消息文本。"""
    session = _make_session(db)
    llm = FakeLLMClient(tokens=["好。"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        async for _ in runner.stream_turn("我在听", db, face={
            "face_detected": True,
            "looking_away": True,
            "nervousness": 0.8,
        }):
            pass

    asyncio.run(run())

    last_call = llm.stream_calls[-1]
    user_msg = next(m for m in reversed(last_call) if m["role"] == "user")
    assert "面部分析" in user_msg["content"]
    assert "看镜头" in user_msg["content"]
    assert "紧张" in user_msg["content"]


def test_stream_turn_emits_error_on_llm_failure(db, monkeypatch) -> None:
    """LLM 抛错时应输出 ERROR 事件而不崩溃。"""
    session = _make_session(db)

    class BrokenLLM(FakeLLMClient):
        async def chat_stream(self, messages, temperature: float = 0.75):
            raise RuntimeError("LLM 不可用")
            yield  # unreachable，但让 mypy 满意

    runner = InterviewRunner(session, BrokenLLM())
    import asyncio

    async def run():
        events = []
        async for e in runner.stream_turn("测试", db):
            events.append(e)
        return events

    events = asyncio.run(run())
    errors = [e for e in events if e.kind == EventKind.ERROR]
    assert errors and "LLM 不可用" in errors[0].error


def test_stream_turn_injects_followup_probe_when_vague(db) -> None:
    """模糊回答触发追问引导注入到 LLM messages。"""
    session = _make_session(db)
    # 注入上一轮 LLM 提问
    session.messages = json.dumps([
        {"role": "system", "content": "你是面试官"},
        {"role": "assistant", "content": "请描述一次性能优化经历"},
    ])
    db.commit()
    db.refresh(session)

    llm = FakeLLMClient(tokens=["好的。"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        async for _ in runner.stream_turn("差不多就是这样吧", db):
            pass

    asyncio.run(run())

    last_call = llm.stream_calls[-1]
    system_msgs = [m["content"] for m in last_call if m["role"] == "system"]
    assert any("追问引导" in s and "vague" in s for s in system_msgs), system_msgs


def test_stream_turn_no_followup_probe_when_solid(db) -> None:
    """具体回答不应触发追问引导。"""
    session = _make_session(db)
    session.messages = json.dumps([
        {"role": "system", "content": "你是面试官"},
        {"role": "assistant", "content": "请说说性能优化的效果"},
    ])
    db.commit()
    db.refresh(session)

    llm = FakeLLMClient(tokens=["好。"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        async for _ in runner.stream_turn(
            "接口 RT 从 200ms 降到 35ms，QPS 提升 5 倍，错误率下降 90%。",
            db,
        ):
            pass

    asyncio.run(run())

    last_call = llm.stream_calls[-1]
    system_msgs = [m["content"] for m in last_call if m["role"] == "system"]
    assert not any("追问引导" in s for s in system_msgs)


def test_stream_turn_applies_context_compression(db) -> None:
    """context_window 较小时应触发上下文压缩。"""
    from app.models import LLMSettings
    session = _make_session(db)
    # 写入 200 条 user/assistant 对话，迫使压缩
    base = [{"role": "system", "content": "你是面试官"}]
    base += [
        {"role": "user" if i % 2 == 0 else "assistant",
         "content": "对话内容" * 20}
        for i in range(40)
    ]
    session.messages = json.dumps(base, ensure_ascii=False)
    settings = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
    if settings is None:
        settings = LLMSettings(id=1, api_key="x", api_base="http://x", model="m",
                                context_window=500, max_tokens=100)
        db.add(settings)
    else:
        settings.context_window = 500
    db.commit()
    db.refresh(session)

    llm = FakeLLMClient(tokens=["好。"])
    runner = InterviewRunner(session, llm)

    import asyncio

    async def run():
        async for _ in runner.stream_turn("新回答", db):
            pass

    asyncio.run(run())

    last_call = llm.stream_calls[-1]
    # 压缩后消息数应少于原始
    assert len(last_call) < len(base) + 1  # +1 for new user msg
    # 应包含压缩说明
    assert any("上下文压缩" in m.get("content", "") for m in last_call)


def test_stream_turn_injects_rag_context(db) -> None:
    """当 RAG 命中时，检索片段应作为 system 消息注入到 LLM 调用。"""
    import uuid
    from pathlib import Path
    from app.services.rag import company_rag as rag_mod

    # 用临时目录隔离 chroma
    chroma_dir = Path(db.get_bind().url.database).parent / f"chroma_{uuid.uuid4().hex[:6]}"
    chroma_dir.mkdir(parents=True, exist_ok=True)

    import chromadb
    from chromadb.config import Settings

    class _StubRAG:
        def __init__(self):
            self.embed_called_with: list[str] = []

        async def query_for_company(self, query, company_id, top_k=4):
            self.embed_called_with.append(query)
            return [
                {
                    "text": f"{company_id} 风格：高频追问",
                    "metadata": {"company_id": company_id, "section": "style"},
                    "distance": 0.1,
                },
            ]

        async def query(self, query, top_k=3, company_id=None):
            return []

    rag = _StubRAG()
    session = _make_session(db)
    session.messages = json.dumps([
        {"role": "system", "content": "你是面试官"},
        {"role": "assistant", "content": "请说说性能优化"},
    ], ensure_ascii=False)
    db.commit()
    db.refresh(session)

    llm = FakeLLMClient(tokens=["好。"])
    runner = InterviewRunner(session, llm, rag=rag)

    import asyncio

    async def run():
        async for _ in runner.stream_turn("接口 RT 从 200ms 降到 35ms", db):
            pass

    asyncio.run(run())

    last_call = llm.stream_calls[-1]
    system_msgs = [m["content"] for m in last_call if m["role"] == "system"]
    assert any("企业知识库检索补充" in s and "bytedance" in s for s in system_msgs), system_msgs


def test_stream_turn_skips_rag_when_no_hits(db) -> None:
    """RAG 无命中时不应注入空片段。"""
    class _EmptyRAG:
        async def query_for_company(self, query, company_id, top_k=4):
            return []
        async def query(self, query, top_k=3, company_id=None):
            return []

    rag = _EmptyRAG()
    session = _make_session(db)
    session.messages = json.dumps([
        {"role": "system", "content": "你是面试官"},
        {"role": "assistant", "content": "自我介绍"},
    ], ensure_ascii=False)
    db.commit()
    db.refresh(session)

    llm = FakeLLMClient(tokens=["好。"])
    runner = InterviewRunner(session, llm, rag=rag)

    import asyncio

    async def run():
        async for _ in runner.stream_turn("我叫张三", db):
            pass

    asyncio.run(run())

    last_call = llm.stream_calls[-1]
    system_msgs = [m["content"] for m in last_call if m["role"] == "system"]
    assert not any("企业知识库" in s for s in system_msgs)


def test_stream_turn_rag_error_does_not_break_turn(db) -> None:
    """RAG 抛错时面试回合应正常完成，不影响主流程。"""
    class _BrokenRAG:
        async def query_for_company(self, query, company_id, top_k=4):
            raise RuntimeError("RAG unavailable")
        async def query(self, query, top_k=3, company_id=None):
            raise RuntimeError("RAG unavailable")

    rag = _BrokenRAG()
    session = _make_session(db)
    session.messages = json.dumps([
        {"role": "system", "content": "你是面试官"},
        {"role": "assistant", "content": "自我介绍"},
    ], ensure_ascii=False)
    db.commit()
    db.refresh(session)

    llm = FakeLLMClient(tokens=["好的。"])
    runner = InterviewRunner(session, llm, rag=rag)

    import asyncio

    async def run():
        events = []
        async for e in runner.stream_turn("我叫李四", db):
            events.append(e)
        return events

    events = asyncio.run(run())
    # 应有 turn_done 且无 error
    assert any(e.kind.value == "turn_done" for e in events)
    assert not any(e.kind.value == "error" for e in events)


def test_agent_public_methods_no_longer_underscore(db) -> None:
    """确保私有字段已被收敛为公共方法（防止 ws_handler 直接访问）。"""
    from app.services.interview.agent import InterviewAgent

    public = {
        "save_state", "current_phase", "phases_remaining",
        "mark_active", "mark_completed",
        "record_user_text", "record_assistant_text",
        "advance_phase_if_needed",
        "build_opening_prompt", "build_turn_prompt",
        "set_questions_in_phase", "reset_messages",
    }
    assert public.issubset(set(dir(InterviewAgent)))