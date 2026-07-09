"""BYOK LLM 设置 API。

安全要点：

- 更新 ``api_base`` 时校验 URL 协议 + 是否命中私网/loopback（防 SSRF）；
- 仅在本地开发模式下允许非 https 主机，便于调试；
- ``api_key`` 入库前用 AES-256-GCM 加密（at-rest）；
- 错误信息脱敏返回，避免泄露上游服务细节。
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import UnsafeURLError, is_safe_http_url
from app.core.secrets import encrypt_secret
from app.database import get_db
from app.models import LLMSettings
from app.schemas import LLMSettingsResponse, LLMSettingsUpdate, LLMTestResponse
from app.services.llm.client import LLMClient

router = APIRouter()

# 本地回环白名单：127.0.0.1 / localhost 仅在 debug / dev 下放行
import os as _os
_IS_DEV = _os.environ.get("INTERVIEWOS_ENV", "dev") != "prod"


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
        protocol=getattr(row, "protocol", "openai_chat") or "openai_chat",
        reasoning_effort=getattr(row, "reasoning_effort", "medium") or "medium",
        supports_vision=bool(getattr(row, "supports_vision", True)),
        supports_audio=bool(getattr(row, "supports_audio", False)),
        stt_model=getattr(row, "stt_model", "base") or "base",
        tts_voice=getattr(row, "tts_voice", "zh-CN-XiaoxiaoNeural") or "zh-CN-XiaoxiaoNeural",
        has_api_key=bool(row.api_key),
        updated_at=row.updated_at,
    )


@router.put("/llm", response_model=LLMSettingsResponse)
def update_llm_settings(body: LLMSettingsUpdate, db: Session = Depends(get_db)):
    # SSRF 防御：拒绝指向私网 / loopback 的 api_base（Dev 模式除外）
    if not is_safe_http_url(body.api_base, allow_local=_IS_DEV):
        raise HTTPException(status_code=400, detail="LLM API 地址不安全，仅允许 https 公网地址")

    row = _get_or_create_settings(db)
    row.api_base = body.api_base
    if body.api_key and body.api_key != "keep":
        # 入库前加密，避免明文落盘
        row.api_key = encrypt_secret(body.api_key) or ""
    row.model = body.model
    row.max_tokens = body.max_tokens
    row.context_window = body.context_window
    row.provider = body.provider
    row.protocol = body.protocol
    row.reasoning_effort = body.reasoning_effort
    row.supports_vision = body.supports_vision
    row.supports_audio = body.supports_audio
    row.stt_model = body.stt_model
    row.tts_voice = body.tts_voice
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return LLMSettingsResponse(
        api_base=row.api_base,
        model=row.model,
        max_tokens=row.max_tokens,
        context_window=row.context_window,
        provider=row.provider,
        protocol=getattr(row, "protocol", "openai_chat") or "openai_chat",
        reasoning_effort=getattr(row, "reasoning_effort", "medium") or "medium",
        supports_vision=bool(getattr(row, "supports_vision", True)),
        supports_audio=bool(getattr(row, "supports_audio", False)),
        stt_model=getattr(row, "stt_model", "base") or "base",
        tts_voice=getattr(row, "tts_voice", "zh-CN-XiaoxiaoNeural") or "zh-CN-XiaoxiaoNeural",
        has_api_key=bool(row.api_key),
        updated_at=row.updated_at,
    )


@router.post("/llm/test", response_model=LLMTestResponse)
async def test_llm_connection(db: Session = Depends(get_db)):
    llm = LLMClient.from_db(db)
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 API Key")
    # 同样对 LLM URL 做一次 SSRF 校验
    if not is_safe_http_url(llm.api_base, allow_local=_IS_DEV):
        raise HTTPException(status_code=400, detail="LLM API 地址不安全")
    try:
        success, message = await llm.test_connection()
    except UnsafeURLError as e:
        raise HTTPException(status_code=400, detail=f"URL 校验失败: {e}") from e
    return LLMTestResponse(success=success, message=message, model=llm.model if success else None)
