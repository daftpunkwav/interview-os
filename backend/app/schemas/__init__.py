"""Pydantic 请求/响应模型。"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.constants import (
    DEFAULT_LLM_PROTOCOL,
    DEFAULT_PERSONALITY,
    DEFAULT_INTERVIEW_STYLE,
)


# ── LLM 设置 ──────────────────────────────────────────

class LLMSettingsUpdate(BaseModel):
    api_base: str
    api_key: str
    model: str
    max_tokens: int = 4096
    context_window: int = 128000
    provider: str = "openai"
    protocol: str = DEFAULT_LLM_PROTOCOL
    reasoning_effort: str = "medium"
    supports_vision: bool = True
    supports_audio: bool = False
    stt_model: str = "base"
    tts_voice: str = "zh-CN-XiaoxiaoNeural"


class LLMSettingsResponse(BaseModel):
    api_base: str
    model: str
    max_tokens: int
    context_window: int
    provider: str
    protocol: str = DEFAULT_LLM_PROTOCOL
    reasoning_effort: str = "medium"
    supports_vision: bool = True
    supports_audio: bool = False
    stt_model: str = "base"
    tts_voice: str = "zh-CN-XiaoxiaoNeural"
    has_api_key: bool
    updated_at: datetime | None = None


class LLMTestResponse(BaseModel):
    success: bool
    message: str
    model: str | None = None


# ── 用户档案 ──────────────────────────────────────────

class UserProfileUpdate(BaseModel):
    name: str = "求职者"
    gender: str = ""
    identity: str = ""
    school: str = ""
    major: str = ""
    graduation_year: str = ""
    job_direction: str = ""
    experience_years: str = ""
    work_years_detail: str = ""
    current_company: str = ""
    expected_salary: str = ""
    self_intro: str = ""
    tech_domains: list[str] = Field(default_factory=list)
    target_role: str = ""
    github_username: str = ""
    portfolio_url: str = ""
    linkedin_url: str = ""
    city: str = ""
    preferred_languages: str = ""
    career_highlights: str = ""
    open_to_remote: str = ""
    notice_period: str = ""


class UserProfileResponse(BaseModel):
    id: int
    name: str
    gender: str = ""
    identity: str = ""
    school: str = ""
    major: str = ""
    graduation_year: str = ""
    job_direction: str
    experience_years: str
    work_years_detail: str = ""
    current_company: str = ""
    expected_salary: str = ""
    self_intro: str = ""
    tech_domains: list[str]
    target_role: str
    github_username: str = ""
    portfolio_url: str = ""
    linkedin_url: str = ""
    city: str = ""
    preferred_languages: str = ""
    career_highlights: str = ""
    open_to_remote: str = ""
    notice_period: str = ""
    updated_at: datetime | None = None


# ── 简历 ──────────────────────────────────────────

class CandidateProfile(BaseModel):
    name: str = ""
    education: list[dict[str, Any]] = Field(default_factory=list)
    work_experience: list[dict[str, Any]] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    projects: list[dict[str, Any]] = Field(default_factory=list)
    summary: str = ""


class ResumeResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    parsed_profile: CandidateProfile
    is_active: bool = False
    score: int | None = None
    analysis: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DimensionScore(BaseModel):
    """简历评价单维度得分。"""
    score: int = Field(ge=0, le=100)
    comment: str = ""


class ResumeAnalysis(BaseModel):
    """多维度简历 Agent 评价结果。

    兼容旧字段 strengths/weaknesses/…，并扩展 dimension_scores 等。
    """
    score: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    predicted_questions: list[str] = Field(default_factory=list)
    # 扩展：多维度
    dimension_scores: dict[str, DimensionScore] = Field(default_factory=dict)
    ats_keywords: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    project_deep_dive: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    role_fit_summary: str = ""
    seniority_estimate: str = ""
    rewrite_examples: list[str] = Field(default_factory=list)
    interview_risk_areas: list[str] = Field(default_factory=list)
    overall_narrative: str = ""


# ── 面试配置 ──────────────────────────────────────────

class InterviewConfig(BaseModel):
    role: str
    level: str
    company: str
    workflow_type: Literal["technical", "hr", "management"] = "technical"
    personality: Literal["gentle", "professional", "pressure", "hr", "expert"] = DEFAULT_PERSONALITY
    strictness: int = Field(default=3, ge=1, le=10)
    interview_style: Literal["deep_dive", "concise"] = DEFAULT_INTERVIEW_STYLE
    resume_id: int | None = None
    avatar_id: str = "professional_male"
    scene_id: str = "meeting_room"


class InterviewSessionResponse(BaseModel):
    id: int
    role: str
    level: str
    company: str
    workflow_type: str
    personality: str
    strictness: int
    interview_style: str
    avatar_id: str = "professional_male"
    scene_id: str = "meeting_room"
    status: str
    current_phase: str
    overall_score: int | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: datetime | None = None


# ── 错误响应统一 envelope ────────────────────────────────────────


class ErrorBody(BaseModel):
    code: str
    message: str
    trace_id: str = ""


class APIError(BaseModel):
    """统一错误响应形状，与 ``app/main.py:_envelope`` 一一对齐。"""

    model_config = {"extra": "forbid"}

    detail: str | None = None
    error: ErrorBody | None = None


class InterviewMessageRequest(BaseModel):
    content: str
    face_analysis: dict[str, Any] | None = None
    # 当前视频帧 JPEG base64，供多模态 LLM 分析表情与状态
    # 上限约 200KB 原始数据（base64 编码后约 267KB），防止大图消耗过多 token
    image_base64: str | None = Field(default=None, max_length=300_000)


class InterviewMessageResponse(BaseModel):
    session_id: int
    message: ChatMessage
    current_phase: str
    is_complete: bool = False
    phases_remaining: list[str] = Field(default_factory=list)


# ── 报告 ──────────────────────────────────────────

class ScoreBreakdown(BaseModel):
    technical: int = 0
    communication: int = 0
    project_depth: int = 0
    problem_solving: int = 0
    presence: int = 0
    overall: int = 0


class InterviewReport(BaseModel):
    overall_score: int
    score_breakdown: ScoreBreakdown
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    resume_suggestions: list[str] = Field(default_factory=list)
    interview_suggestions: list[str] = Field(default_factory=list)
    training_plan: list[str] = Field(default_factory=list)
    phase_summary: dict[str, str] = Field(default_factory=dict)
    face_analysis_summary: str = ""
    presence_moments: list[str] = Field(default_factory=list)


class InterviewReportResponse(BaseModel):
    session_id: int
    report: InterviewReport
    messages_count: int
    duration_minutes: float | None = None


# ── 企业与岗位选项 ──────────────────────────────────────────

class CompanyInfo(BaseModel):
    id: str
    name: str
    style: str
    focus_areas: list[str]
    sample_questions: list[str]


class WorkflowTypeOption(BaseModel):
    id: str
    name: str
    phases: list[str] = Field(default_factory=list)


class OptionsResponse(BaseModel):
    roles: list[str]
    levels: list[str]
    experience_years: list[str]
    companies: list[CompanyInfo]
    personalities: list[dict[str, str]]
    interview_styles: list[dict[str, str]]
    workflow_types: list[WorkflowTypeOption]
    avatars: list[dict[str, str]] = Field(default_factory=list)
    scenes: list[dict[str, str]] = Field(default_factory=list)
    tts_voices: list[dict[str, str]] = Field(default_factory=list)
