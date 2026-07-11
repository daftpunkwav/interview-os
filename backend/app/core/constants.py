"""全局协议常量。

集中放置前后端契约中用到的字符串字面量，便于：

- 前端 ``src/config/*.ts`` 与后端此处一一对照；
- 重命名 / 协议演进时编辑器可以定位所有引用；
- 避免 ``"foo"`` 散落在数十个文件中。

改动任何一个常量前，请同时改两处并提交一个原子 commit。
"""

from __future__ import annotations

from enum import StrEnum


# ── LLM 协议 ────────────────────────────────────────


class LLMProtocol(StrEnum):
    OPENAI_CHAT = "openai_chat"


DEFAULT_LLM_PROTOCOL = LLMProtocol.OPENAI_CHAT


# ── RAG 后端 ────────────────────────────────────────


class RAGBackendKind(StrEnum):
    """企业知识库 RAG 的实现后端。

    - ``local``:本地 Chroma + 调用 LLM 提供商的 ``/embeddings`` 端点。
      适用于 OpenAI / DeepSeek / SiliconFlow / Moonshot / GLM 等所有暴露
      OpenAI 兼容 embeddings 接口的 provider。
    - ``stepfun``:StepFun 托管的 ``/vector_stores`` 检索,检索通过
      ``tools[].type=retrieval`` 在 chat 调用时由 StepFun 服务端完成。
    - ``none``:完全关闭企业知识库检索。
    """

    LOCAL = "local"
    STEPFUN = "stepfun"
    NONE = "none"


DEFAULT_RAG_BACKEND = RAGBackendKind.LOCAL


# ── 面试工作流 / 阶段 ────────────────────────────────────────


class WorkflowType(StrEnum):
    TECHNICAL = "technical"
    HR = "hr"
    MANAGEMENT = "management"


class InterviewPhase(StrEnum):
    IDENTITY_CHECK = "identity_check"
    SELF_INTRO = "self_intro"
    BASIC_KNOWLEDGE = "basic_knowledge"
    PROJECT_DEEP_DIVE = "project_deep_dive"
    TECHNICAL_DEEP = "technical_deep"
    SYSTEM_DESIGN = "system_design"
    SCENARIO = "scenario"
    REVERSE_QA = "reverse_qa"
    SUMMARY = "summary"


# 默认 technical workflow 的阶段顺序（与 ``PHASE_ORDER`` 前端常量一致）
TECHNICAL_PHASE_ORDER: tuple[InterviewPhase, ...] = (
    InterviewPhase.IDENTITY_CHECK,
    InterviewPhase.SELF_INTRO,
    InterviewPhase.BASIC_KNOWLEDGE,
    InterviewPhase.PROJECT_DEEP_DIVE,
    InterviewPhase.TECHNICAL_DEEP,
    InterviewPhase.SYSTEM_DESIGN,
    InterviewPhase.SCENARIO,
    InterviewPhase.REVERSE_QA,
    InterviewPhase.SUMMARY,
)


# ── 面试官人格 / 风格 ────────────────────────────────────────


class Personality(StrEnum):
    GENTLE = "gentle"
    PROFESSIONAL = "professional"
    PRESSURE = "pressure"
    HR = "hr"
    EXPERT = "expert"


DEFAULT_PERSONALITY = Personality.PROFESSIONAL


class InterviewStyle(StrEnum):
    DEEP_DIVE = "deep_dive"
    CONCISE = "concise"


DEFAULT_INTERVIEW_STYLE = InterviewStyle.DEEP_DIVE


# ── 会话状态 ────────────────────────────────────────


class SessionStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


# ── 追问信号分类 ────────────────────────────────────────


class FollowupCategory(StrEnum):
    """追问信号分类（与 ``services/interview/followup.py`` 共同定义）。"""

    VAGUE = "vague"
    DEPTH = "depth"
    CONTRADICTION = "contradiction"
    KEY_TERM = "key_term"


# ── SSE / WebSocket 事件 ────────────────────────────────────────


class SSEMessageType(StrEnum):
    TOKEN = "token"
    DONE = "done"
    ERROR = "error"


class WSServerEvent(StrEnum):
    """WebSocket 服务端事件类型（前端 ``ServerEvent`` 联合类型一一对应）。"""

    TURN_STATE = "turn_state"
    ASSISTANT_TOKEN = "assistant_token"
    ASSISTANT_DONE = "assistant_done"
    ASSISTANT_AUDIO_START = "assistant_audio_start"
    ASSISTANT_AUDIO_CHUNK = "assistant_audio_chunk"
    ASSISTANT_AUDIO_END = "assistant_audio_end"
    STT_PARTIAL = "stt_partial"
    STT_FINAL = "stt_final"
    TTS_AUDIO = "tts_audio"
    SILENCE_NUDGE = "silence_nudge"
    REFERENCE_HINT_LOADING = "reference_hint_loading"
    REFERENCE_HINT = "reference_hint"
    PHASE_CHANGED = "phase_changed"
    INTERVIEW_COMPLETE = "interview_complete"
    ERROR = "error"


class WSClientEvent(StrEnum):
    """WebSocket 客户端事件类型（前端 ``ClientEvent`` 联合类型一一对应）。"""

    USER_TEXT = "user_text"
    USER_TURN_END = "user_turn_end"
    STT_TEXT = "stt_text"
    SILENCE_TIMEOUT = "silence_timeout"
    REQUEST_HINT = "request_hint"
    VISION_UPDATE = "vision_update"


# ── 速率限制 ────────────────────────────────────────

DEFAULT_RATE_LIMIT_PER_MINUTE = 60
DEFAULT_LLM_RATE_LIMIT_PER_MINUTE = 10


# ── HTTP 头 / 安全 ────────────────────────────────────────

API_KEY_ENCRYPTION_VERSION = "enc:v1"
TRACE_ID_HEADER = "X-Trace-Id"


# ── 简历分析 ────────────────────────────────────────

RESUME_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
RESUME_ALLOWED_EXTENSIONS: frozenset[str] = frozenset({"pdf", "docx", "doc", "md", "txt"})

# ── WebSocket / 面试运行时 ────────────────────────────────────────

HEARTBEAT_TIMEOUT_SEC = 30.0
HEARTBEAT_MAX_MISSES = 3
AUDIO_BUFFER_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
TTS_QUEUE_MAX_SIZE = 50
