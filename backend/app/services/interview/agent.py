"""面试 Agent 核心逻辑：动态问题生成、追问、阶段管理。

设计说明：
- 本模块是 *数据层*，负责消息历史、阶段索引、状态持久化。
- 回合执行（流式 LLM 调用、句子切分、TTS 调度、错误恢复）由 :class:`InterviewRunner` 负责。
- 上层（ws_handler、HTTP API）只应通过公共方法访问状态，禁止触碰 ``_*`` 字段。
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession, Resume, UserProfile
from app.schemas import CandidateProfile, InterviewConfig, InterviewReport, ScoreBreakdown
from app.services.company.knowledge import get_company_context
from app.services.interview.workflows import (
    PERSONALITY_PROMPTS,
    STRICTNESS_DESCRIPTIONS,
    STYLE_PROMPTS,
    InterviewPhase,
    Workflow,
    get_workflow,
)
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 系统 Prompt 构建
# ---------------------------------------------------------------------------


def build_system_prompt(
    config: InterviewConfig,
    candidate: CandidateProfile | None,
    company_context: str,
    workflow: Workflow,
    current_phase: InterviewPhase,
    profile: UserProfile | None = None,
    followup_probe: str | None = None,
) -> str:
    """组装面试官系统提示。

    Args:
        followup_probe: 可选的追问引导（由 followup 分析器注入）。
    """
    personality = PERSONALITY_PROMPTS.get(config.personality, PERSONALITY_PROMPTS["professional"])
    style = STYLE_PROMPTS.get(config.interview_style, STYLE_PROMPTS["deep_dive"])
    strictness = STRICTNESS_DESCRIPTIONS.get(config.strictness, STRICTNESS_DESCRIPTIONS[3])

    candidate_info = ""
    if profile and (profile.name or profile.school or profile.self_intro or getattr(profile, "github_username", "")):
        github_u = getattr(profile, "github_username", "") or ""
        portfolio = getattr(profile, "portfolio_url", "") or ""
        linkedin = getattr(profile, "linkedin_url", "") or ""
        city = getattr(profile, "city", "") or ""
        langs = getattr(profile, "preferred_languages", "") or ""
        highlights = getattr(profile, "career_highlights", "") or ""
        candidate_info += f"""
## 候选人个人档案
姓名：{profile.name}
性别/身份：{profile.gender or '—'} / {profile.identity or '—'}
学校/专业：{profile.school or '—'} / {profile.major or '—'}
毕业年份：{profile.graduation_year or '—'}
城市：{city or '—'}
求职方向：{profile.job_direction}
目标岗位：{profile.target_role}
工作年限：{profile.experience_years}
当前公司：{profile.current_company or '—'}
期望薪资：{profile.expected_salary or '—'}
技术领域：{', '.join(profile.tech_domains_list)}
GitHub：{github_u or '—'}
作品集/博客：{portfolio or '—'}
LinkedIn：{linkedin or '—'}
偏好语言：{langs or '—'}
职业亮点：{(highlights or '')[:500]}
自我介绍：{(profile.self_intro or '')[:800]}
"""
        if github_u:
            candidate_info += f"\n提示：候选人填写了 GitHub 用户名「{github_u}」，项目深挖阶段请使用 github_* 工具核实。\n"
    if candidate:
        candidate_info += f"""
## 简历解析
姓名：{candidate.name}
技能：{', '.join(candidate.skills)}
项目：{json.dumps(candidate.projects, ensure_ascii=False)[:2000]}
工作经历：{json.dumps(candidate.work_experience, ensure_ascii=False)[:1500]}
"""

    phase_list = " → ".join(p.name for p in workflow.phases)

    followup_section = ""
    if followup_probe:
        followup_section = f"""
## 追问引导（来自结构化分析）
{followup_probe}
请围绕上述方向深入追问至少一个问题，避免重复已经讨论过的角度。
"""

    return f"""你是 InterviewOS 的 AI 面试官，正在进行一场模拟面试。

{personality}
{style}
严厉程度：{config.strictness}/10 — {strictness}

## 面试配置
岗位：{config.role}
职级：{config.level}
面试类型：{workflow.name}

{company_context}

{candidate_info}

## 当前阶段
阶段：{current_phase.name}（{current_phase.id}）
目标：{current_phase.description}
本阶段需提问 {current_phase.min_questions}-{current_phase.max_questions} 个问题。

## 完整流程
{phase_list}
{followup_section}
## 可用工具（function calling）
你可以使用以下工具获取真实信息，再基于证据提问：
- github_*：核验候选人 GitHub 用户/仓库/README/commit/PR/文件/语言占比
- lookup_company_profile：查询目标公司面试风格
- lookup_resume_projects：提取当前绑定简历中的项目与技能
- web_search_interview_exp：补充公开面经（谨慎使用）

当候选人提到具体项目名、GitHub 链接或技术架构时，**优先调用工具核实**再追问细节
（例如：为何用 StateGraph 而非 MessageGraph、某 commit 的意图、README 与口头描述差异）。

## 行为准则
1. 根据候选人简历和回答动态生成问题，绝不使用固定题库
2. 发现模糊描述、数据缺失、技术漏洞时主动追问
3. 不要重复已问过的问题
4. 每次只问一个问题（或一组紧密相关的小问），保持简洁
5. 用中文交流（除非候选人用英文回答技术题）
6. 当前阶段问题数够了之后，在回复末尾单独一行写：[PHASE_COMPLETE]
7. 反问环节时，扮演公司代表回答候选人的问题
8. 总结阶段给出简要口头评价，然后写 [INTERVIEW_COMPLETE]
9. 工具结果仅供你内部使用，不要整段朗读 JSON；用自然口语引用关键事实
10. 可在回复中使用情绪标记：[emotion:smile] / [emotion:serious] / [emotion:neutral]

请开始当前阶段的面试。"""


# ---------------------------------------------------------------------------
# 状态推进辅助
# ---------------------------------------------------------------------------


PHASE_COMPLETE_MARKER = "[PHASE_COMPLETE]"
INTERVIEW_COMPLETE_MARKER = "[INTERVIEW_COMPLETE]"


def has_marker(content: str, marker: str) -> bool:
    """判断 LLM 输出是否包含指定标记。"""
    return marker in content


def strip_markers(content: str) -> str:
    """移除所有控制标记，返回纯文本回复。"""
    return (
        content.replace(INTERVIEW_COMPLETE_MARKER, "")
        .replace(PHASE_COMPLETE_MARKER, "")
        .replace("[emotion:neutral]", "")
        .replace("[emotion:smile]", "")
        .replace("[emotion:serious]", "")
        .strip()
    )


def detect_emotion(content: str) -> str:
    """从 LLM 输出中抽取情感标签，默认 neutral。"""
    for marker, emotion in (
        ("[emotion:smile]", "smile"),
        ("[emotion:serious]", "serious"),
        ("[emotion:neutral]", "neutral"),
    ):
        if marker in content:
            return emotion
    return "neutral"


# ---------------------------------------------------------------------------
# InterviewAgent：数据层
# ---------------------------------------------------------------------------


class InterviewAgent:
    """面试 Agent 数据层：消息历史、阶段索引、状态持久化。"""

    def __init__(self, session: InterviewSession, llm: LLMClient):
        self.session = session
        self.llm = llm
        self._load_state()

    # ---- 状态加载/保存 -----------------------------------------------------

    def _load_state(self) -> None:
        try:
            self.agent_state: dict[str, Any] = json.loads(self.session.agent_state or "{}")
        except json.JSONDecodeError:
            self.agent_state = {}

        try:
            self.messages: list[dict[str, Any]] = json.loads(self.session.messages or "[]")
        except json.JSONDecodeError:
            self.messages = []

        self.workflow = get_workflow(self.session.workflow_type)
        self.current_phase_idx: int = self.agent_state.get("phase_idx", 0)
        self.questions_in_phase: int = self.agent_state.get("questions_in_phase", 0)
        self.asked_topics: list[str] = self.agent_state.get("asked_topics", [])
        # 长上下文结构化记忆（40 分钟面试用）
        self.agent_state.setdefault("weak_points", [])
        self.agent_state.setdefault("followup_clues", [])
        self.agent_state.setdefault("github_findings", [])
        self.agent_state.setdefault("tool_trace", [])
        self.agent_state.setdefault("asked_questions", [])

    def save_state(self, db: Session) -> None:
        """将当前状态写回数据库。"""
        self.agent_state.update({
            "phase_idx": self.current_phase_idx,
            "questions_in_phase": self.questions_in_phase,
            "asked_topics": self.asked_topics,
        })
        self.session.agent_state = json.dumps(self.agent_state, ensure_ascii=False)
        self.session.messages = json.dumps(self.messages, ensure_ascii=False)
        self.session.current_phase = self.current_phase().id
        db.commit()

    def note_question(self, question_text: str) -> None:
        """记录已问问题（结构化，便于压缩后仍可去重）。"""
        q = (question_text or "").strip()
        if not q:
            return
        asked = self.agent_state.setdefault("asked_questions", [])
        # 只保留摘要前 120 字
        snippet = q[:120]
        if snippet not in asked:
            asked.append(snippet)
        if len(asked) > 80:
            del asked[:-80]

    def note_weak_point(self, point: str) -> None:
        """记录候选人薄弱点线索。"""
        p = (point or "").strip()
        if not p:
            return
        weak = self.agent_state.setdefault("weak_points", [])
        if p not in weak:
            weak.append(p[:200])
        if len(weak) > 30:
            del weak[:-30]

    # ---- 阶段查询 -----------------------------------------------------------

    def current_phase(self) -> InterviewPhase:
        if self.current_phase_idx < len(self.workflow.phases):
            return self.workflow.phases[self.current_phase_idx]
        return self.workflow.phases[-1]

    def phases_remaining(self) -> list[str]:
        return [p.name for p in self.workflow.phases[self.current_phase_idx:]]

    # ---- 配置/上下文查询（只读） --------------------------------------------

    def get_config(self) -> InterviewConfig:
        return InterviewConfig(
            role=self.session.role,
            level=self.session.level,
            company=self.session.company,
            workflow_type=self.session.workflow_type,
            personality=self.session.personality,
            strictness=self.session.strictness,
            interview_style=self.session.interview_style,
            resume_id=self.session.resume_id,
        )

    def get_user_profile(self, db: Session) -> UserProfile | None:
        return db.query(UserProfile).filter(UserProfile.id == self.session.profile_id).first()

    def get_candidate(self, db: Session) -> CandidateProfile | None:
        if not self.session.resume_id:
            return None
        resume = db.query(Resume).filter(Resume.id == self.session.resume_id).first()
        if not resume:
            return None
        try:
            return CandidateProfile(**json.loads(resume.parsed_profile))
        except (json.JSONDecodeError, Exception):
            return None

    def _memory_section(self) -> str:
        """结构化记忆摘要（压缩后仍可用）。"""
        parts: list[str] = []
        asked = self.agent_state.get("asked_questions") or []
        if asked:
            parts.append("已问问题摘要：\n- " + "\n- ".join(str(q)[:80] for q in asked[-12:]))
        weak = self.agent_state.get("weak_points") or []
        if weak:
            parts.append("已知薄弱点：\n- " + "\n- ".join(str(w)[:80] for w in weak[-8:]))
        findings = self.agent_state.get("github_findings") or []
        if findings:
            previews = []
            for f in findings[-5:]:
                if isinstance(f, dict):
                    previews.append(f"{f.get('tool')}: {str(f.get('preview', ''))[:120]}")
            if previews:
                parts.append("GitHub 核验摘要：\n- " + "\n- ".join(previews))
        if not parts:
            return ""
        return "\n\n## 会话结构化记忆（请勿重复已问问题）\n" + "\n".join(parts)

    def build_opening_prompt(self, db: Session) -> str:
        """构建首回合系统提示。"""
        config = self.get_config()
        candidate = self.get_candidate(db)
        profile = self.get_user_profile(db)
        company_ctx = get_company_context(config.company)
        phase = self.current_phase()
        return build_system_prompt(
            config, candidate, company_ctx, self.workflow, phase, profile
        ) + self._memory_section()

    def build_turn_prompt(
        self,
        db: Session,
        followup_probe: str | None = None,
    ) -> str:
        """构建常规回合系统提示（如果 messages 已有 system prompt 则复用，否则重建）。"""
        # 保留已有的 system prompt 头部；仅在缺失时重建
        existing_system = next(
            (m for m in self.messages if m.get("role") == "system"), None
        )
        if existing_system is None:
            config = self.get_config()
            candidate = self.get_candidate(db)
            profile = self.get_user_profile(db)
            company_ctx = get_company_context(config.company)
            return build_system_prompt(
                config,
                candidate,
                company_ctx,
                self.workflow,
                self.current_phase(),
                profile,
                followup_probe=followup_probe,
            )
        return existing_system["content"]

    # ---- 状态推进 ----------------------------------------------------------

    def mark_active(self) -> None:
        """标记会话为进行中。"""
        self.session.status = "active"
        self.session.started_at = datetime.now(timezone.utc)

    def mark_completed(self) -> None:
        """标记面试结束，并把阶段索引指向末尾。"""
        self.session.status = "completed"
        self.session.ended_at = datetime.now(timezone.utc)
        self.current_phase_idx = len(self.workflow.phases) - 1

    def record_user_text(self, content: str) -> None:
        """记录候选人发言到消息历史。"""
        self.messages.append({"role": "user", "content": content})

    def record_assistant_text(self, content: str) -> None:
        """记录面试官发言到消息历史，并写入结构化已问问题。"""
        self.messages.append({"role": "assistant", "content": content})
        # 控制标记剥离后记入 asked_questions
        clean = strip_markers(content)
        if clean:
            self.note_question(clean)

    def reset_messages(self) -> None:
        """重置消息历史（用于 start 时）。"""
        self.messages = []

    def set_questions_in_phase(self, value: int) -> None:
        self.questions_in_phase = value

    def advance_phase_if_needed(self, reply: str) -> bool:
        """根据 LLM 回复决定是否推进到下一阶段。

        Returns:
            bool: 是否发生阶段切换。
        """
        phase_complete = has_marker(reply, PHASE_COMPLETE_MARKER)
        max_reached = self.questions_in_phase >= self.current_phase().max_questions
        if phase_complete or max_reached:
            # 防御：避免越界走到 workflow 末尾之后
            if self.current_phase_idx >= len(self.workflow.phases) - 1:
                self.questions_in_phase += 1
                return False
            self._advance_phase()
            return True
        self.questions_in_phase += 1
        return False

    def _advance_phase(self) -> None:
        self.current_phase_idx += 1
        self.questions_in_phase = 0
        if self.current_phase_idx < len(self.workflow.phases):
            phase = self.current_phase()
            self.messages.append({
                "role": "system",
                "content": (
                    f"进入新阶段：{phase.name}（{phase.description}）。"
                    "请开始本阶段提问。"
                ),
            })


# ---------------------------------------------------------------------------
# 报告生成
# ---------------------------------------------------------------------------


REPORT_SYSTEM_PROMPT = """你是一位资深面试评估专家。根据面试对话记录，生成结构化评估报告。

返回 JSON 格式：
{
  "overall_score": 85,
  "score_breakdown": {
    "technical": 90,
    "communication": 75,
    "project_depth": 80,
    "problem_solving": 85,
    "presence": 78,
    "overall": 85
  },
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "improvement_suggestions": ["综合建议1"],
  "resume_suggestions": ["简历修改建议1"],
  "interview_suggestions": ["面试表现改进建议1"],
  "training_plan": ["训练计划1"],
  "phase_summary": {"自我介绍": "评价"},
  "face_analysis_summary": "临场状态评价",
  "presence_moments": ["紧张时刻描述"]
}
只返回 JSON。"""


def build_report_messages(
    session: InterviewSession,
    face_records: list[dict] | None = None,
) -> list[dict[str, str]]:
    """构造报告生成的 LLM 输入。"""
    messages = json.loads(session.messages or "[]")
    conversation_lines: list[str] = []
    for m in messages:
        if m["role"] not in ("user", "assistant"):
            continue
        content = m.get("content", "")
        if isinstance(content, list):
            # 多模态消息：仅取 text 部分
            text_parts = [
                p.get("text", "")
                for p in content
                if isinstance(p, dict) and p.get("type") == "text"
            ]
            content = "\n".join(text_parts)
        conversation_lines.append(f"{m['role']}: {content}")
    conversation = "\n".join(conversation_lines)

    face_ctx = ""
    if face_records:
        face_ctx = f"\n面部分析记录：{json.dumps(face_records, ensure_ascii=False)[:1000]}"

    # 截取尾部以避免超出上下文窗口；用切片而不是索引，永不越界
    tail = conversation[-12000:]

    return [
        {"role": "system", "content": REPORT_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"面试岗位：{session.role}（{session.level}）\n"
                f"公司：{session.company}\n\n对话记录：\n"
                f"{tail}{face_ctx}"
            ),
        },
    ]


def _fallback_report() -> InterviewReport:
    return InterviewReport(
        overall_score=70,
        score_breakdown=ScoreBreakdown(
            overall=70, technical=70, communication=70,
            project_depth=70, problem_solving=70, presence=70,
        ),
        weaknesses=["报告生成时遇到错误，请重试"],
        improvement_suggestions=["完成更多面试练习以获得准确评估"],
    )


async def generate_report(
    session: InterviewSession,
    llm: LLMClient,
    face_records: list[dict] | None = None,
) -> InterviewReport:
    """根据面试对话生成评估报告。

    失败时向上抛出，避免调用方把假分数 ``_fallback_report`` 当作正式结果落库。
    仅在明确需要降级展示且不落库的场景再调用 :func:`_fallback_report`。
    """
    try:
        data = await llm.chat_json(build_report_messages(session, face_records))
        return InterviewReport(**data)
    except Exception as e:
        logger.error("报告生成失败: %s", e)
        raise


async def generate_and_persist_report(
    session: InterviewSession,
    llm: LLMClient,
    db: Session,
    face_records: list[dict] | None = None,
) -> InterviewReport:
    """生成报告并写入 session / GrowthRecord（同一事务）。

    任意阶段失败整体回滚，避免「session 已 completed 但 GrowthRecord 缺失」。
    """
    from app.core.constants import SessionStatus
    from app.models import GrowthRecord

    report = await generate_report(session, llm, face_records)

    growth = GrowthRecord(
        profile_id=session.profile_id,
        session_id=session.id,
        weak_skills=json.dumps(report.weaknesses, ensure_ascii=False),
        common_mistakes=json.dumps(report.weaknesses[:3], ensure_ascii=False),
        training_plan=json.dumps(report.training_plan, ensure_ascii=False),
    )

    try:
        session.report = report.model_dump_json()
        session.overall_score = report.overall_score
        session.status = SessionStatus.COMPLETED.value
        session.ended_at = datetime.now(timezone.utc)
        db.add(growth)
        db.commit()
        try:
            from app.services.growth.learning import record_interview_learning

            record_interview_learning(session, report=report.model_dump())
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise
    return report


async def stream_report(
    session: InterviewSession,
    llm: LLMClient,
    face_records: list[dict] | None = None,
):
    """流式生成评估报告，每次 yield 一个 token 字符串。

    与同步版不同：流式版本不复用 ``chat_json``，而是直接 ``chat_stream`` 让前端可以
    增量渲染。返回的最终结构仍通过 SSE 的 ``done`` 事件承载（由调用方解析）。
    """
    report_messages = build_report_messages(session, face_records)
    async for token in llm.chat_stream(report_messages, temperature=0.3):
        yield token