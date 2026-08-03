"""历史痕迹：2026-08 God 模块拆分时，从 agent.py 切出子模块的一次性脚本。

用途
----
- 记录当时如何把 `app/services/interview/agent.py` 竖切为
  `agent_prompts.py` / `agent_text.py` / `report.py`，以及 `agent.py` re-export 壳。
- 对应提交：`6295804`（refactor(interview): 拆分 agent 与 turn 上帝模块）。

注意
----
- **不是**应用运行时入口，**不要**在启动/CI 中执行。
- 行号与源文件已可能漂移；若再跑可能覆盖现有拆分结果。仅作审计/回滚参考。
- 成对文件：`_split_turn.py`（turn_coordinator 拆分痕迹）。
"""
from pathlib import Path

src = Path("app/services/interview/agent.py")
lines = src.read_text(encoding="utf-8").splitlines(True)


def chunk(a: int, b: int) -> str:
    return "".join(lines[a - 1 : b])


header = '''"""面试 Agent 提示词组装。"""

from __future__ import annotations

from app.core.prompts import with_agent_output_rules
from app.models import UserProfile
from app.schemas import CandidateProfile, InterviewConfig
from app.services.interview.workflows import (
    PERSONALITY_PROMPTS,
    STRICTNESS_DESCRIPTIONS,
    STYLE_PROMPTS,
    InterviewPhase,
    Workflow,
)

'''
Path("app/services/interview/agent_prompts.py").write_text(
    header + chunk(44, 179), encoding="utf-8"
)

text_header = '''"""面试 Agent 文本处理：标记剥离、思考块过滤、情绪检测。"""

from __future__ import annotations

import re

PHASE_COMPLETE_MARKER = "[PHASE_COMPLETE]"
INTERVIEW_COMPLETE_MARKER = "[INTERVIEW_COMPLETE]"

'''
Path("app/services/interview/agent_text.py").write_text(
    text_header + chunk(185, 310), encoding="utf-8"
)

report_header = '''"""面试报告生成与持久化。"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.prompts import with_agent_output_rules
from app.models import InterviewSession
from app.schemas import InterviewReport, ScoreBreakdown
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

_REPORT_LOCKS: dict[int, asyncio.Lock] = {}

'''
Path("app/services/interview/report.py").write_text(
    report_header + chunk(625, 946), encoding="utf-8"
)

# InterviewAgent body: 318-623 (before REPORT_SYSTEM)
agent_header = '''"""面试 Agent 数据层：消息历史、阶段索引、状态持久化。

提示词见 :mod:`agent_prompts`；文本过滤见 :mod:`agent_text`；报告见 :mod:`report`。
本模块 re-export 旧符号以保持 import 兼容。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession, Resume, UserProfile
from app.schemas import CandidateProfile, InterviewConfig
from app.services.company.knowledge import get_company_context
from app.services.interview.agent_prompts import build_system_prompt
from app.services.interview.agent_text import (
    INTERVIEW_COMPLETE_MARKER,
    PHASE_COMPLETE_MARKER,
    ThinkStreamFilter,
    detect_emotion,
    has_marker,
    strip_markers,
    strip_think_blocks,
)
from app.services.interview.report import (
    generate_and_persist_report,
    generate_report,
    stream_report,
)
from app.services.interview.workflows import (
    InterviewPhase,
    Workflow,
    get_workflow,
)
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

'''

agent_body = chunk(318, 623)
# Fix InterviewAgent to import build_system_prompt from agent_prompts - already in class methods via self
# Class uses build_system_prompt, has_marker, etc. - need to check internal refs

Path("app/services/interview/agent.py").write_text(
    agent_header
    + agent_body
    + '''

__all__ = [
    "InterviewAgent",
    "build_system_prompt",
    "ThinkStreamFilter",
    "detect_emotion",
    "has_marker",
    "strip_markers",
    "strip_think_blocks",
    "PHASE_COMPLETE_MARKER",
    "INTERVIEW_COMPLETE_MARKER",
    "generate_and_persist_report",
    "generate_report",
    "stream_report",
]
''',
    encoding="utf-8",
)

print("ok")
