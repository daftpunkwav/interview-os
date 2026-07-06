"""面试 Agent 核心逻辑：动态问题生成、追问、阶段管理。"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import InterviewSession, Resume
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


def _build_system_prompt(
    config: InterviewConfig,
    candidate: CandidateProfile | None,
    company_context: str,
    workflow: Workflow,
    current_phase: InterviewPhase,
) -> str:
    personality = PERSONALITY_PROMPTS.get(config.personality, PERSONALITY_PROMPTS["professional"])
    style = STYLE_PROMPTS.get(config.interview_style, STYLE_PROMPTS["deep_dive"])
    strictness = STRICTNESS_DESCRIPTIONS.get(config.strictness, STRICTNESS_DESCRIPTIONS[3])

    candidate_info = ""
    if candidate:
        candidate_info = f"""
## 候选人档案
姓名：{candidate.name}
技能：{', '.join(candidate.skills)}
项目：{json.dumps(candidate.projects, ensure_ascii=False)[:2000]}
工作经历：{json.dumps(candidate.work_experience, ensure_ascii=False)[:1500]}
"""

    phase_list = " → ".join(p.name for p in workflow.phases)

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

## 行为准则
1. 根据候选人简历和回答动态生成问题，绝不使用固定题库
2. 发现模糊描述、数据缺失、技术漏洞时主动追问
3. 不要重复已问过的问题
4. 每次只问一个问题（或一组紧密相关的小问），保持简洁
5. 用中文交流（除非候选人用英文回答技术题）
6. 当前阶段问题数够了之后，在回复末尾单独一行写：[PHASE_COMPLETE]
7. 反问环节时，扮演公司代表回答候选人的问题
8. 总结阶段给出简要口头评价，然后写 [INTERVIEW_COMPLETE]

请开始当前阶段的面试。"""


class InterviewAgent:
    """面试 Agent：管理状态、生成问题、处理追问。"""

    def __init__(self, session: InterviewSession, llm: LLMClient):
        self.session = session
        self.llm = llm
        self._load_state()

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
        self.current_phase_idx = self.agent_state.get("phase_idx", 0)
        self.questions_in_phase = self.agent_state.get("questions_in_phase", 0)
        self.asked_topics: list[str] = self.agent_state.get("asked_topics", [])

    def _save_state(self, db: Session) -> None:
        self.agent_state.update({
            "phase_idx": self.current_phase_idx,
            "questions_in_phase": self.questions_in_phase,
            "asked_topics": self.asked_topics,
        })
        self.session.agent_state = json.dumps(self.agent_state, ensure_ascii=False)
        self.session.messages = json.dumps(self.messages, ensure_ascii=False)
        self.session.current_phase = self._current_phase().id
        db.commit()

    def _current_phase(self) -> InterviewPhase:
        if self.current_phase_idx < len(self.workflow.phases):
            return self.workflow.phases[self.current_phase_idx]
        return self.workflow.phases[-1]

    def _get_config(self) -> InterviewConfig:
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

    def _get_candidate(self, db: Session) -> CandidateProfile | None:
        if not self.session.resume_id:
            return None
        resume = db.query(Resume).filter(Resume.id == self.session.resume_id).first()
        if not resume:
            return None
        try:
            return CandidateProfile(**json.loads(resume.parsed_profile))
        except (json.JSONDecodeError, Exception):
            return None

    async def start(self, db: Session) -> str:
        """启动面试，返回面试官开场白。"""
        config = self._get_config()
        candidate = self._get_candidate(db)
        company_ctx = get_company_context(config.company)
        phase = self._current_phase()

        system_prompt = _build_system_prompt(config, candidate, company_ctx, self.workflow, phase)
        self.messages = [{"role": "system", "content": system_prompt}]

        # 请求 AI 开场
        opening_messages = self.messages + [
            {"role": "user", "content": "面试开始，请按照当前阶段开始提问。"},
        ]
        reply = await self.llm.chat(opening_messages, temperature=0.8)

        self.messages.append({"role": "assistant", "content": reply})
        self.questions_in_phase = 1
        self.session.status = "active"
        self.session.started_at = datetime.now(timezone.utc)
        self._save_state(db)
        return reply

    async def respond(
        self,
        user_content: str,
        db: Session,
        face_analysis: dict[str, Any] | None = None,
    ) -> tuple[str, bool]:
        """处理候选人回答，返回 (面试官回复, 是否结束)。"""
        # 附加面部分析上下文
        content = user_content
        if face_analysis:
            hints = []
            if face_analysis.get("looking_away"):
                hints.append("候选人似乎没有看镜头")
            if face_analysis.get("nervousness", 0) > 0.7:
                hints.append("候选人看起来比较紧张")
            if hints:
                content += f"\n[面部分析提示：{'; '.join(hints)}]"

        self.messages.append({"role": "user", "content": content})

        reply = await self.llm.chat(self.messages, temperature=0.75)
        self.messages.append({"role": "assistant", "content": reply})

        is_complete = "[INTERVIEW_COMPLETE]" in reply
        clean_reply = reply.replace("[INTERVIEW_COMPLETE]", "").replace("[PHASE_COMPLETE]", "").strip()

        # 阶段推进
        if "[PHASE_COMPLETE]" in reply or self.questions_in_phase >= self._current_phase().max_questions:
            self._advance_phase()
        else:
            self.questions_in_phase += 1

        if is_complete:
            self.session.status = "completed"
            self.session.ended_at = datetime.now(timezone.utc)
            self.current_phase_idx = len(self.workflow.phases) - 1

        self._save_state(db)
        return clean_reply, is_complete

    def _advance_phase(self) -> None:
        self.current_phase_idx += 1
        self.questions_in_phase = 0

        if self.current_phase_idx < len(self.workflow.phases):
            phase = self._current_phase()
            # 注入新阶段系统提示
            self.messages.append({
                "role": "system",
                "content": f"进入新阶段：{phase.name}（{phase.description}）。请开始本阶段提问。",
            })

    def get_phases_remaining(self) -> list[str]:
        return [p.name for p in self.workflow.phases[self.current_phase_idx:]]


REPORT_SYSTEM_PROMPT = """你是一位资深面试评估专家。根据面试对话记录，生成结构化评估报告。

返回 JSON 格式：
{
  "overall_score": 85,
  "score_breakdown": {
    "technical": 90,
    "communication": 75,
    "project_depth": 80,
    "problem_solving": 85,
    "overall": 85
  },
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "improvement_suggestions": ["建议1", "建议2"],
  "training_plan": ["训练计划1", "训练计划2"],
  "phase_summary": {"自我介绍": "评价", "项目深挖": "评价"},
  "face_analysis_summary": "面部表情与状态综合评价"
}

评分标准：90+优秀，80-89良好，70-79中等，60-69需改进，<60不足。
只返回 JSON。"""


async def generate_report(
    session: InterviewSession,
    llm: LLMClient,
    face_records: list[dict] | None = None,
) -> InterviewReport:
    """根据面试对话生成评估报告。"""
    messages = json.loads(session.messages or "[]")
    conversation = "\n".join(
        f"{m['role']}: {m['content']}"
        for m in messages
        if m["role"] in ("user", "assistant")
    )

    face_ctx = ""
    if face_records:
        face_ctx = f"\n面部分析记录：{json.dumps(face_records, ensure_ascii=False)[:1000]}"

    report_messages = [
        {"role": "system", "content": REPORT_SYSTEM_PROMPT},
        {"role": "user", "content": f"面试岗位：{session.role}（{session.level}）\n公司：{session.company}\n\n对话记录：\n{conversation[-12000]}{face_ctx}"},
    ]

    try:
        data = await llm.chat_json(report_messages)
        return InterviewReport(**data)
    except Exception as e:
        logger.error("报告生成失败: %s", e)
        return InterviewReport(
            overall_score=70,
            score_breakdown=ScoreBreakdown(overall=70, technical=70, communication=70, project_depth=70, problem_solving=70),
            weaknesses=["报告生成时遇到错误，请重试"],
            improvement_suggestions=["完成更多面试练习以获得准确评估"],
        )
