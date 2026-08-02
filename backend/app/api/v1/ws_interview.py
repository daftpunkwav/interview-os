"""面试 WebSocket API。"""

from fastapi import APIRouter, Query, WebSocket

from app.realtime.ws_handler import InterviewWSHandler

router = APIRouter()


@router.websocket("/ws/interview/{session_id}")
async def interview_websocket(
    websocket: WebSocket,
    session_id: int,
    token: str = Query(default="", description="会话能力令牌"),
):
    handler = InterviewWSHandler(websocket, session_id, access_token=token)
    await handler.handle()
