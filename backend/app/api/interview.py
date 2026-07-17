"""面试会话 API。"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from app.core.constants import DEFAULT_LLM_RATE_LIMIT_PER_MINUTE, SessionStatus
from app.core.ratelimit import rate_limit_dep
from app.database import get_db
from app.models import InterviewSession
from app.schemas import (
    ChatMessage,
    InterviewConfig,
    InterviewMessageRequest,
    InterviewMessageResponse,
    InterviewSessionResponse,
)
from app.services.interview.agent import InterviewAgent, generate_and_persist_report
from app.services.interview.events import EventKind
from app.services.interview.runner import InterviewRunner
from app.services.llm.client import LLMClient

router = APIRouter()
logger = logging.getLogger(__name__)

# 强类型 ChatMessage 列表校验（防御存储层历史脏数据）
_CHAT_MSG_ADAPTER: TypeAdapter[list[ChatMessage]] = TypeAdapter(list[ChatMessage])


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


async def _collect_turn_result(stream) -> tuple[str, bool]:
    """消费 Runner 事件流，返回 (最终文案, is_complete)。"""
    content = ""
    is_complete = False
    error: str | None = None
    async for event in stream:
        if event.kind == EventKind.TOKEN:
            content += event.token
        elif event.kind == EventKind.TURN_COMPLETE:
            content = event.content
            is_complete = bool(event.is_complete)
        elif event.kind == EventKind.ERROR:
            error = event.error or "面试执行失败"
    if error:
        raise HTTPException(status_code=502, detail=error)
    return content, is_complete


@router.post(
    "/sessions/{session_id}/start",
    dependencies=[
        Depends(
            rate_limit_dep(
                key="llm",
                limit=DEFAULT_LLM_RATE_LIMIT_PER_MINUTE,
            )
        )
    ],
)
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
    runner = InterviewRunner(session, llm, agent)
    opening, _ = await _collect_turn_result(runner.stream_opening(db))

    return {
        "session_id": session_id,
        "message": ChatMessage(role="assistant", content=opening, timestamp=datetime.now(timezone.utc)),
        "current_phase": session.current_phase,
    }


@router.post(
    "/sessions/{session_id}/message",
    response_model=InterviewMessageResponse,
    dependencies=[
        Depends(
            rate_limit_dep(
                key="llm",
                limit=DEFAULT_LLM_RATE_LIMIT_PER_MINUTE,
            )
        )
    ],
)
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
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 LLM API Key")

    agent = InterviewAgent(session, llm)
    runner = InterviewRunner(session, llm, agent)
    reply, is_complete = await _collect_turn_result(
        runner.stream_turn(
            body.content,
            db,
            face=body.face_analysis,
            image_b64=body.image_base64,
        )
    )

    if is_complete:
        try:
            await generate_and_persist_report(session, llm, db)
        except Exception as e:
            # 对外通用文案，细节仅日志（防上游异常泄漏）
            logger.exception("报告生成失败 sid=%s", session_id)
            raise HTTPException(
                status_code=502, detail="报告生成失败，请稍后重试"
            ) from e

    return InterviewMessageResponse(
        session_id=session_id,
        message=ChatMessage(role="assistant", content=reply, timestamp=datetime.now(timezone.utc)),
        current_phase=session.current_phase,
        is_complete=is_complete,
        # phases_remaining 是方法，必须调用
        phases_remaining=list(agent.phases_remaining()) if not is_complete else [],
    )


@router.post(
    "/sessions/{session_id}/finish",
    dependencies=[
        Depends(
            rate_limit_dep(
                key="llm",
                limit=DEFAULT_LLM_RATE_LIMIT_PER_MINUTE,
            )
        )
    ],
)
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
    try:
        await generate_and_persist_report(session, llm, db)
    except Exception as e:
        logger.exception("报告生成失败 sid=%s", session_id)
        raise HTTPException(
            status_code=502, detail="报告生成失败，请稍后重试"
        ) from e
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
    # 强校验：仅保留符合 ChatMessage 结构的合法项；坏数据降级为空列表
    try:
        validated = _CHAT_MSG_ADAPTER.validate_python(raw)
        return [m.model_dump(mode="json") for m in validated]
    except Exception:
        # 历史脏数据：返回空，避免对外暴露内部异常
        return []


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
