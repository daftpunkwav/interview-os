"""面试报告 API。"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import GrowthRecord, InterviewSession
from app.schemas import InterviewReport, InterviewReportResponse
from app.services.interview.agent import generate_report, stream_report
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)
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


@router.get("/{session_id}/stream")
async def get_report_stream(session_id: int, db: Session = Depends(get_db)):
    """流式返回报告。前端可增量渲染，JSON 解析由前端负责。"""
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    if session.status != "completed":
        raise HTTPException(status_code=400, detail="面试尚未结束")

    llm = LLMClient.from_db(db)

    async def event_stream():
        try:
            async for token in stream_report(session, llm):
                yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
            # 流式结束后再生成一次结构化报告并保存（与同步 finish 路径一致）
            report = await generate_report(session, llm)
            session.report = report.model_dump_json()
            session.overall_score = report.overall_score
            db.commit()
            report_payload = json.loads(report.model_dump_json())
            yield f"data: {json.dumps({'type': 'done', 'report': report_payload}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("流式报告失败: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
