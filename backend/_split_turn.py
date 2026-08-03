"""历史痕迹：2026-08 God 模块拆分时，从 turn_coordinator 切出 mixin 的一次性脚本。

用途
----
- 记录当时如何把 `app/realtime/turn_coordinator.py` 竖切为
  `turn_streaming.py` / `turn_control.py`，coordinator 保留编排与兼容导出。
- 对应提交：`6295804`（refactor(interview): 拆分 agent 与 turn 上帝模块）。

注意
----
- **不是**应用运行时入口，**不要**在启动/CI 中执行。
- 行号与源文件已可能漂移；若再跑可能覆盖现有拆分结果。仅作审计/回滚参考。
- 成对文件：`_split_agent.py`（interview agent 拆分痕迹）。
"""
from pathlib import Path

src = Path("app/realtime/turn_coordinator.py")
lines = src.read_text(encoding="utf-8").splitlines(True)


def chunk(a: int, b: int) -> str:
    return "".join(lines[a - 1 : b])


# Streaming mixin: lines 291-405 (_consume_* and _stream_events_with_tts)
streaming = '''"""回合流式消费与 TTS 入队（WS mixin）。"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession
from app.services.interview.agent import ThinkStreamFilter, strip_markers
from app.services.interview.events import EventKind, StreamEvent
from app.services.tts.edge import (
    extract_emotion,
    next_soft_min,
    should_flush_sentence_buffer,
)

logger = logging.getLogger(__name__)

_IMAGE_BASE64_MAX_LEN: int = 300_000


class TurnStreamingMixin:
    """依赖宿主提供 runner/orchestrator/tts/_spawn/send/_stream_epoch 等。"""

''' + chunk(291, 405)

Path("app/realtime/turn_streaming.py").write_text(streaming, encoding="utf-8")

# Control: persist interrupt, barge, process_user_text, finish, dispatch, silence
# lines 407-end
control = '''"""话轮副作用：打断、收尾、静默追问、事件分发（WS mixin）。"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.constants import SessionStatus
from app.database import SessionLocal
from app.models import InterviewSession
from app.realtime.events import TurnState
from app.services.interview.events import EventKind, StreamEvent

logger = logging.getLogger(__name__)


class TurnControlMixin:
    """依赖宿主提供 runner/tts/_spawn/send/_stream_events_with_tts 等。"""

''' + chunk(407, len(lines))

Path("app/realtime/turn_control.py").write_text(control, encoding="utf-8")

# Slim coordinator: header + locks + user turns (1-286) + inherit mixins
coord = '''"""回合协调（WS mixin）：话轮锁、候选人回合；流式/副作用委托子 mixin。"""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import InterviewSession
from app.realtime.events import TurnState
from app.realtime.turn_control import TurnControlMixin
from app.realtime.turn_streaming import TurnStreamingMixin, _IMAGE_BASE64_MAX_LEN
from app.realtime.voice_pipeline import _is_echo_of_assistant, _pick_stt_text
from app.services.stt import transcribe_utterance_result

logger = logging.getLogger(__name__)

_AUDIO_BUFFER_MAX_BYTES: int = 5 * 1024 * 1024


class TurnCoordinatorMixin(TurnStreamingMixin, TurnControlMixin):
    """候选人回合入口；组合流式消费与打断/收尾副作用。"""

''' + chunk(37, 286)

# Fix indentation - chunk 37-286 starts with "    def _can_start" which is class body - good
# But we already opened class TurnCoordinatorMixin - the methods need to stay indented

Path("app/realtime/turn_coordinator.py").write_text(coord, encoding="utf-8")
print("turn split ok", len(lines))
