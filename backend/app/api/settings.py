"""BYOK LLM 设置 API。"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LLMSettings
from app.schemas import LLMSettingsResponse, LLMSettingsUpdate, LLMTestResponse
from app.services.llm.client import LLMClient

router = APIRouter()


def _get_or_create_settings(db: Session) -> LLMSettings:
    row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
    if not row:
        row = LLMSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/llm", response_model=LLMSettingsResponse)
def get_llm_settings(db: Session = Depends(get_db)):
    row = _get_or_create_settings(db)
    return LLMSettingsResponse(
        api_base=row.api_base,
        model=row.model,
        max_tokens=row.max_tokens,
        context_window=row.context_window,
        provider=row.provider,
        has_api_key=bool(row.api_key),
        updated_at=row.updated_at,
    )


@router.put("/llm", response_model=LLMSettingsResponse)
def update_llm_settings(body: LLMSettingsUpdate, db: Session = Depends(get_db)):
    row = _get_or_create_settings(db)
    row.api_base = body.api_base
    if body.api_key and body.api_key != "keep":
        row.api_key = body.api_key
    row.model = body.model
    row.max_tokens = body.max_tokens
    row.context_window = body.context_window
    row.provider = body.provider
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return LLMSettingsResponse(
        api_base=row.api_base,
        model=row.model,
        max_tokens=row.max_tokens,
        context_window=row.context_window,
        provider=row.provider,
        has_api_key=bool(row.api_key),
        updated_at=row.updated_at,
    )


@router.post("/llm/test", response_model=LLMTestResponse)
async def test_llm_connection(db: Session = Depends(get_db)):
    llm = LLMClient.from_db(db)
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 API Key")
    success, message = await llm.test_connection()
    return LLMTestResponse(success=success, message=message, model=llm.model if success else None)
