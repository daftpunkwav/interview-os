"""面试会话 API。"""

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.constants import SessionStatus
from app.database import get_db
from app.models import GrowthRecord, InterviewSession
from app.schemas import (
    ChatMessage,
    InterviewConfig,
    InterviewMessageRequest,
    InterviewMessageResponse,
    InterviewSessionResponse,
)
from app.services.interview.agent import InterviewAgent, generate_report
from app.services.llm.client import LLMClient

router = APIRouter()


async def _generate_and_persist_report(
    session: InterviewSession,
    llm: LLMClient,
    db: Session,
) -> None:
    """生成报告并写入 session / GrowthRecord。

    集中 ``send_message`` 与 ``finish_interview`` 两处重复的报告生成+成长记录逻辑。
    """
    report = await generate_report(session, llm)
    session.report = report.model_dump_json()
    session.overall_score = report.overall_score
    session.status = SessionStatus.COMPLETED.value
    session.ended_at = datetime.now(timezone.utc)
    db.commit()

    growth = GrowthRecord(
        profile_id=session.profile_id,
        session_id=session.id,
        weak_skills=json.dumps(report.weaknesses, ensure_ascii=False),
        common_mistakes=json.dumps(report.weaknesses[:3], ensure_ascii=False),
        training_plan=json.dumps(report.training_plan, ensure_ascii=False),
    )
    db.add(growth)
    db.commit()


@router.post("/sessions", response_model=InterviewSessionResponse)
def create_session(config: InterviewConfig, db: Session = Depends(get_db)):
    session = InterviewSession(
        role=config.role,
        level=config.level,
        company=config.company,
        workflow_type=config.workflow_type,
        personality=config.personality,
        strictness=config.strictness,
        interview_style=config.interview_style,
        resume_id=config.resume_id,
        avatar_id=config.avatar_id,
        scene_id=config.scene_id,
        status=SessionStatus.PENDING.value,
        current_phase="identity_check",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.get("/sessions", response_model=list[InterviewSessionResponse])
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(InterviewSession).order_by(InterviewSession.created_at.desc()).all()
    return [_to_response(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=InterviewSessionResponse)
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    return _to_response(session)


@router.post("/sessions/{session_id}/start")
async def start_interview(session_id: int, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    if session.status not in (SessionStatus.PENDING.value, SessionStatus.ACTIVE.value):
        raise HTTPException(status_code=400, detail="面试已结束")

    llm = LLMClient.from_db(db)
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 LLM API Key")

    agent = InterviewAgent(session, llm)
    opening = await agent.start(db)

    return {
        "session_id": session_id,
        "message": ChatMessage(role="assistant", content=opening, timestamp=datetime.now(timezone.utc)),
        "current_phase": session.current_phase,
    }


@router.post("/sessions/{session_id}/message", response_model=InterviewMessageResponse)
async def send_message(
    session_id: int,
    body: InterviewMessageRequest,
    db: Session = Depends(get_db),
):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    if session.status == SessionStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="面试已结束")

    llm = LLMClient.from_db(db)
    agent = InterviewAgent(session, llm)
    reply, is_complete = await agent.respond(
        body.content, db, body.face_analysis, body.image_base64
    )

    if is_complete:
        await _generate_and_persist_report(session, llm, db)

    return InterviewMessageResponse(
        session_id=session_id,
        message=ChatMessage(role="assistant", content=reply, timestamp=datetime.now(timezone.utc)),
        current_phase=session.current_phase,
        is_complete=is_complete,
        phases_remaining=agent.get_phases_remaining() if not is_complete else [],
    )


@router.post("/sessions/{session_id}/finish")
async def finish_interview(session_id: int, db: Session = Depends(get_db)):
    """提前结束面试并生成报告。"""
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    if (
        session.status == SessionStatus.COMPLETED.value
        and session.report
        and session.report != "{}"
    ):
        return {"session_id": session_id, "status": "already_completed"}

    llm = LLMClient.from_db(db)
    await _generate_and_persist_report(session, llm, db)
    return {
        "session_id": session_id,
        "status": SessionStatus.COMPLETED.value,
        "overall_score": session.overall_score,
    }


@router.get("/sessions/{session_id}/messages")
def get_messages(session_id: int, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    raw = json.loads(session.messages or "[]")
    # 类型守卫:仅保留 dict 且 role 为合法字符串的 user/assistant 消息
    out: list[dict[str, Any]] = []
    for m in raw:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        if not isinstance(role, str) or role not in ("user", "assistant"):
            continue
        out.append(m)
    return out


def _to_response(session: InterviewSession) -> InterviewSessionResponse:
    return InterviewSessionResponse(
        id=session.id,
        role=session.role,
        level=session.level,
        company=session.company,
        workflow_type=session.workflow_type,
        personality=session.personality,
        strictness=session.strictness,
        interview_style=session.interview_style,
        avatar_id=getattr(session, "avatar_id", None) or "professional_male",
        scene_id=getattr(session, "scene_id", None) or "meeting_room",
        status=session.status,
        current_phase=session.current_phase,
        overall_score=session.overall_score,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
    )
