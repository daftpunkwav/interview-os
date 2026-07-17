"""会话修复：HTTP 面试 start/message 走 InterviewRunner，无 agent.start/respond。"""

from __future__ import annotations

import inspect

from app.api import interview as interview_api
from app.services.interview import agent as agent_mod


def test_interview_agent_has_no_start_or_respond() -> None:
    assert not hasattr(agent_mod.InterviewAgent, "start")
    assert not hasattr(agent_mod.InterviewAgent, "respond")
    assert not hasattr(agent_mod.InterviewAgent, "get_phases_remaining")
    assert hasattr(agent_mod.InterviewAgent, "phases_remaining")


def test_start_interview_source_uses_runner() -> None:
    src = inspect.getsource(interview_api.start_interview)
    assert "InterviewRunner" in src or "runner" in src
    assert "agent.start" not in src


def test_send_message_source_uses_runner() -> None:
    src = inspect.getsource(interview_api.send_message)
    assert "stream_turn" in src or "InterviewRunner" in src
    assert "agent.respond" not in src
    assert "phases_remaining" in src
