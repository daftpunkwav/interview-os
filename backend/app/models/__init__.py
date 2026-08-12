"""SQLAlchemy 数据模型。"""

import json
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import DEFAULT_LLM_PROTOCOL
from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserProfile(Base):
    """本地用户档案。"""

    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), default="求职者")
    gender: Mapped[str] = mapped_column(String(20), default="")
    identity: Mapped[str] = mapped_column(String(50), default="")  # 学生/在职/待业
    school: Mapped[str] = mapped_column(String(200), default="")
    major: Mapped[str] = mapped_column(String(100), default="")
    graduation_year: Mapped[str] = mapped_column(String(20), default="")
    job_direction: Mapped[str] = mapped_column(String(100), default="")
    experience_years: Mapped[str] = mapped_column(String(50), default="")
    work_years_detail: Mapped[str] = mapped_column(String(100), default="")
    current_company: Mapped[str] = mapped_column(String(200), default="")
    expected_salary: Mapped[str] = mapped_column(String(100), default="")
    self_intro: Mapped[str] = mapped_column(Text, default="")
    tech_domains: Mapped[str] = mapped_column(Text, default="[]")
    target_role: Mapped[str] = mapped_column(String(100), default="")
    # 扩展字段：供 Agent 获取更丰富候选人上下文
    github_username: Mapped[str] = mapped_column(String(100), default="")
    portfolio_url: Mapped[str] = mapped_column(String(500), default="")
    linkedin_url: Mapped[str] = mapped_column(String(500), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    preferred_languages: Mapped[str] = mapped_column(String(200), default="")  # 如 中文,English
    career_highlights: Mapped[str] = mapped_column(Text, default="")
    open_to_remote: Mapped[str] = mapped_column(String(20), default="")  # yes/no/hybrid
    notice_period: Mapped[str] = mapped_column(String(50), default="")
    # 面试常用扩展字段
    education_level: Mapped[str] = mapped_column(String(50), default="")  # 本科/硕士/博士等
    expected_city: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(100), default="")  # 电话或微信
    certificates: Mapped[str] = mapped_column(Text, default="")
    english_level: Mapped[str] = mapped_column(String(100), default="")
    signature_projects: Mapped[str] = mapped_column(Text, default="")
    strengths: Mapped[str] = mapped_column(Text, default="")
    weaknesses: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    @property
    def tech_domains_list(self) -> list[str]:
        try:
            return json.loads(self.tech_domains)
        except json.JSONDecodeError:
            return []

    def set_tech_domains(self, domains: list[str]) -> None:
        self.tech_domains = json.dumps(domains, ensure_ascii=False)


class StageConfig(Base):
    """三阶段处理器独立配置：recognize / reason / speak。

    每条记录对应一个阶段，支持自定义供应商、API 格式、模型能力等。
    """

    __tablename__ = "stage_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stage: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(100), default="")
    api_base: Mapped[str] = mapped_column(String(500), default="")
    api_key: Mapped[str] = mapped_column(String(500), default="")
    protocol: Mapped[str] = mapped_column(String(50), default=DEFAULT_LLM_PROTOCOL)
    model: Mapped[str] = mapped_column(String(100), default="")
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)
    context_window: Mapped[int] = mapped_column(Integer, default=128000)
    supports_vision: Mapped[bool] = mapped_column(Boolean, default=False)
    supports_audio_input: Mapped[bool] = mapped_column(Boolean, default=False)
    supports_audio_output: Mapped[bool] = mapped_column(Boolean, default=False)
    supports_video_input: Mapped[bool] = mapped_column(Boolean, default=False)
    fallback_handler: Mapped[str] = mapped_column(String(100), default="")
    fallback_mode: Mapped[str] = mapped_column(String(30), default="")
    extras: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class LLMSettings(Base):
    """BYOK LLM 配置（保留做兼容读；新逻辑优先使用 stage_configs）。"""

    __tablename__ = "llm_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    api_base: Mapped[str] = mapped_column(String(500), default="")
    api_key: Mapped[str] = mapped_column(String(500), default="")
    model: Mapped[str] = mapped_column(String(100), default="")
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)
    context_window: Mapped[int] = mapped_column(Integer, default=128000)
    provider: Mapped[str] = mapped_column(String(50), default="")
    protocol: Mapped[str] = mapped_column(String(50), default=DEFAULT_LLM_PROTOCOL)
    reasoning_effort: Mapped[str] = mapped_column(String(20), default="medium")
    supports_vision: Mapped[bool] = mapped_column(Boolean, default=True)
    supports_audio: Mapped[bool] = mapped_column(Boolean, default=False)
    # 兼容旧字段：识别模型 / Edge 音色
    stt_model: Mapped[str] = mapped_column(String(50), default="whisper-1")
    tts_voice: Mapped[str] = mapped_column(String(100), default="zh-CN-XiaoxiaoNeural")
    # ── 三阶段处理器指派 ──────────────────────────────
    # 阶段1 语音识别
    speech_recognize_handler: Mapped[str] = mapped_column(String(50), default="local")
    speech_recognize_mode: Mapped[str] = mapped_column(String(30), default="transcribe")
    asr_api_base: Mapped[str] = mapped_column(String(500), default="")
    asr_api_key: Mapped[str] = mapped_column(String(500), default="")
    asr_model: Mapped[str] = mapped_column(String(100), default="")
    asr_app_id: Mapped[str] = mapped_column(String(100), default="")
    asr_api_secret: Mapped[str] = mapped_column(String(500), default="")
    asr_access_key: Mapped[str] = mapped_column(String(500), default="")
    asr_resource_id: Mapped[str] = mapped_column(String(100), default="")
    asr_app_key: Mapped[str] = mapped_column(String(100), default="")
    # 阶段3 语音输出（阶段2 复用上方 provider/api_* / model）
    speech_speak_handler: Mapped[str] = mapped_column(String(50), default="edge")
    speech_speak_mode: Mapped[str] = mapped_column(String(30), default="tts_from_text")
    tts_api_base: Mapped[str] = mapped_column(String(500), default="")
    tts_api_key: Mapped[str] = mapped_column(String(500), default="")
    tts_model: Mapped[str] = mapped_column(String(100), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class Resume(Base):
    """上传的简历及解析结果。"""

    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, default=1)
    filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(20))
    raw_text: Mapped[str] = mapped_column(Text, default="")
    parsed_profile: Mapped[str] = mapped_column(Text, default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    analysis: Mapped[str] = mapped_column(Text, default="{}")  # 评分建议 JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class InterviewSession(Base):
    """面试会话记录。"""

    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, default=1)
    resume_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role: Mapped[str] = mapped_column(String(100))
    level: Mapped[str] = mapped_column(String(50))
    company: Mapped[str] = mapped_column(String(100))
    workflow_type: Mapped[str] = mapped_column(String(50), default="technical")
    personality: Mapped[str] = mapped_column(String(50), default="professional")
    strictness: Mapped[int] = mapped_column(Integer, default=3)
    interview_style: Mapped[str] = mapped_column(String(50), default="deep_dive")
    avatar_id: Mapped[str] = mapped_column(String(50), default="professional_male")
    scene_id: Mapped[str] = mapped_column(String(50), default="meeting_room")
    status: Mapped[str] = mapped_column(String(30), default="pending")
    current_phase: Mapped[str] = mapped_column(String(50), default="identity_check")
    agent_state: Mapped[str] = mapped_column(Text, default="{}")
    messages: Mapped[str] = mapped_column(Text, default="[]")
    report: Mapped[str] = mapped_column(Text, default="{}")
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    # 能力令牌：创建时下发，可变操作必验；勿写入 list/get 响应
    access_token: Mapped[str] = mapped_column(String(64), default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class PrepSession(Base):
    """面试准备辅导会话。"""

    __tablename__ = "prep_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resume_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_role: Mapped[str] = mapped_column(String(100), default="")
    target_company: Mapped[str] = mapped_column(String(100), default="")
    messages: Mapped[str] = mapped_column(Text, default="[]")
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    # 与 migrate.py 中 prep_sessions.status 一致；缺列时启动迁移会补齐
    status: Mapped[str] = mapped_column(String(20), default="active")
    # 能力令牌：创建时下发，message/history 必验
    access_token: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class GrowthRecord(Base):
    """用户成长记录。"""

    __tablename__ = "growth_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, default=1)
    session_id: Mapped[int] = mapped_column(Integer)
    weak_skills: Mapped[str] = mapped_column(Text, default="[]")
    common_mistakes: Mapped[str] = mapped_column(Text, default="[]")
    training_plan: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
