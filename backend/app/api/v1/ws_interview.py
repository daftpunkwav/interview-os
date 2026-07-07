"""面试 WebSocket API。"""

from fastapi import APIRouter, WebSocket

from app.realtime.ws_handler import InterviewWSHandler

router = APIRouter()


@router.websocket("/ws/interview/{session_id}")
async def interview_websocket(websocket: WebSocket, session_id: int):
    handler = InterviewWSHandler(websocket, session_id)
    await handler.handle()
