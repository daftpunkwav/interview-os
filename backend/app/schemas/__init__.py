"""Pydantic 请求/响应模型。"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── LLM 设置 ──────────────────────────────────────────

class LLMSettingsUpdate(BaseModel):
    api_base: str
    api_key: str
    model: str
    max_tokens: int = 4096
    context_window: int = 128000
    provider: str = "openai"


class LLMSettingsResponse(BaseModel):
    api_base: str
    model: str
    max_tokens: int
    context_window: int
    provider: str
    has_api_key: bool
    updated_at: datetime | None = None


class LLMTestResponse(BaseModel):
    success: bool
    message: str
    model: str | None = None


# ── 用户档案 ──────────────────────────────────────────

class UserProfileUpdate(BaseModel):
    name: str = "求职者"
    job_direction: str = ""
    experience_years: str = ""
    tech_domains: list[str] = Field(default_factory=list)
    target_role: str = ""


class UserProfileResponse(BaseModel):
    id: int
    name: str
    job_direction: str
    experience_years: str
    tech_domains: list[str]
    target_role: str
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
    created_at: datetime


# ── 面试配置 ──────────────────────────────────────────

class InterviewConfig(BaseModel):
    role: str
    level: str
    company: str
    workflow_type: str = "technical"  # technical | hr | management
    personality: str = "professional"  # gentle | professional | pressure | hr | expert
    strictness: int = Field(default=3, ge=1, le=10)
    interview_style: str = "deep_dive"  # guided | deep_dive | continuous | challenging
    resume_id: int | None = None


class InterviewSessionResponse(BaseModel):
    id: int
    role: str
    level: str
    company: str
    workflow_type: str
    personality: str
    strictness: int
    interview_style: str
    status: str
    current_phase: str
    overall_score: int | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime


class ChatMessage(BaseModel):
    role: str  # user | assistant | system
    content: str
    timestamp: datetime | None = None


class InterviewMessageRequest(BaseModel):
    content: str
    # 可选：面部表情/视频分析摘要
    face_analysis: dict[str, Any] | None = None


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
    overall: int = 0


class InterviewReport(BaseModel):
    overall_score: int
    score_breakdown: ScoreBreakdown
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    training_plan: list[str] = Field(default_factory=list)
    phase_summary: dict[str, str] = Field(default_factory=dict)
    face_analysis_summary: str = ""


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


class OptionsResponse(BaseModel):
    roles: list[str]
    levels: list[str]
    experience_years: list[str]
    companies: list[CompanyInfo]
    personalities: list[dict[str, str]]
    interview_styles: list[dict[str, str]]
    workflow_types: list[dict[str, str]]
