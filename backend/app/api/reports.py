"""面试报告 API。"""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import GrowthRecord, InterviewSession
from app.schemas import InterviewReport, InterviewReportResponse

router = APIRouter()


@router.get("/growth/history")
def get_growth_history(db: Session = Depends(get_db)):
    records = db.query(GrowthRecord).order_by(GrowthRecord.created_at.desc()).limit(20).all()
    return [
        {
            "id": r.id,
            "session_id": r.session_id,
            "weak_skills": json.loads(r.weak_skills),
            "training_plan": json.loads(r.training_plan),
            "created_at": r.created_at,
        }
        for r in records
    ]


@router.get("/{session_id}", response_model=InterviewReportResponse)
def get_report(session_id: int, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")

    if not session.report or session.report == "{}":
        raise HTTPException(status_code=404, detail="报告尚未生成")

    report = InterviewReport(**json.loads(session.report))
    messages = json.loads(session.messages or "[]")

    duration = None
    if session.started_at and session.ended_at:
        delta = session.ended_at - session.started_at
        duration = round(delta.total_seconds() / 60, 1)

    return InterviewReportResponse(
        session_id=session_id,
        report=report,
        messages_count=len([m for m in messages if m["role"] in ("user", "assistant")]),
        duration_minutes=duration,
    )
