"""面试准备 API。

SSE 流式错误仅返回脱敏后的提示文案，原始异常走 logger.exception。
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.prep.agent import PrepAgent
from app.core.constants import SessionStatus
from app.core.security import redact_api_key
from app.database import get_db
from app.models import PrepSession
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)
router = APIRouter()

# SSE 错误事件统一文案（防止上游异常文本泄露 API Key / 内部细节）
_SSE_ERR_GENERIC = "辅导生成失败，请稍后重试"


class PrepCreateRequest(BaseModel):
    resume_id: int | None = None
    target_role: str = ""
    target_company: str = ""


class PrepMessageRequest(BaseModel):
    content: str


@router.post("/sessions")
async def create_prep_session(body: PrepCreateRequest, db: Session = Depends(get_db)):
    session = PrepSession(
        resume_id=body.resume_id,
        target_role=body.target_role,
        target_company=body.target_company,
        status=SessionStatus.ACTIVE.value,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id}


@router.post("/sessions/{session_id}/message")
async def prep_message(session_id: int, body: PrepMessageRequest, db: Session = Depends(get_db)):
    session = db.query(PrepSession).filter(PrepSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.status == SessionStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="会话已结束")
    llm = LLMClient.from_db(db)
    agent = PrepAgent(session, llm)
    reply = await agent.chat(body.content, db)
    return {"reply": reply, "token_usage": session.token_usage}


@router.post("/sessions/{session_id}/message/stream")
async def prep_message_stream(session_id: int, body: PrepMessageRequest, db: Session = Depends(get_db)):
    session = db.query(PrepSession).filter(PrepSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.status == SessionStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="会话已结束")
    llm = LLMClient.from_db(db)
    agent = PrepAgent(session, llm)

    async def event_stream():
        try:
            async for token in agent.chat_stream(body.content, db):
                yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'token_usage': session.token_usage})}\n\n"
        except Exception as e:
            # 脱敏：仅写日志原文，对外只返通用文案
            safe_detail = redact_api_key(str(e)) or _SSE_ERR_GENERIC
            logger.exception("Prep 流式生成失败 sid=%s: %s", session_id, safe_detail)
            yield f"data: {json.dumps({'type': 'error', 'message': _SSE_ERR_GENERIC}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/sessions/{session_id}/messages")
def get_prep_messages(session_id: int, db: Session = Depends(get_db)):
    session = db.query(PrepSession).filter(PrepSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return json.loads(session.messages or "[]")
