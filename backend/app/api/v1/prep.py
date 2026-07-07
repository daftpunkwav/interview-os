"""面试准备 API。"""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.prep.agent import PrepAgent
from app.database import get_db
from app.models import PrepSession
from app.services.llm.client import LLMClient

router = APIRouter()


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
    llm = LLMClient.from_db(db)
    agent = PrepAgent(session, llm)
    reply = await agent.chat(body.content, db)
    return {"reply": reply, "token_usage": session.token_usage}


@router.post("/sessions/{session_id}/message/stream")
async def prep_message_stream(session_id: int, body: PrepMessageRequest, db: Session = Depends(get_db)):
    session = db.query(PrepSession).filter(PrepSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    llm = LLMClient.from_db(db)
    agent = PrepAgent(session, llm)

    async def event_stream():
        try:
            async for token in agent.chat_stream(body.content, db):
                yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'token_usage': session.token_usage})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

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
