"""BYOK 三处理器设置 API。

安全要点：

- 更新 ``api_base`` / ``asr_api_base`` / ``tts_api_base`` 时校验 URL（防 SSRF）；
- 密钥入库前 AES-256-GCM 加密；
- 识别凭证与思考 Key 分离，禁止静默混用。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.constants import DEFAULT_LLM_PROTOCOL, DEFAULT_LLM_RATE_LIMIT_PER_MINUTE
from app.core.local_only import require_local_peer
from app.core.ratelimit import rate_limit_dep
from app.core.security import is_safe_http_url
from app.core.secrets import encrypt_secret
from app.database import get_db
from app.models import LLMSettings
from app.schemas import LLMSettingsResponse, LLMSettingsUpdate, LLMTestResponse
from app.services.voice.catalog import catalog_payload, find_provider
from app.services.voice.stage_tests import test_recognize, test_reason, test_speak

router = APIRouter(dependencies=[Depends(require_local_peer)])

_SECRET_KEEP = "keep"


def _get_or_create_settings(db: Session) -> LLMSettings:
    row = db.query(LLMSettings).filter(LLMSettings.id == 1).first()
    if not row:
        row = LLMSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _maybe_encrypt(value: str | None, current: str) -> str:
    if value is None or value == "" or value == _SECRET_KEEP:
        return current
    return encrypt_secret(value) or ""


def _safe_base(url: str, *, label: str) -> None:
    if not (url or "").strip():
        return
    settings = get_settings()
    allow_local = bool(settings.allow_local_llm)
    require_https = bool(settings.is_prod)
    if not is_safe_http_url(
        url, allow_local=allow_local, require_https=require_https
    ):
        raise ApiBusinessError(
            get_spec("A0007"),
            message=(
                f"{label} 地址不安全，"
                + (
                    "生产环境仅允许 https 公网地址。"
                    if require_https
                    else "仅允许 http(s) 公网地址。"
                )
                + "若需本地服务，请设置 ALLOW_LOCAL_LLM=true（仅非 prod）"
            ),
        )


def _row_to_response(row: LLMSettings) -> LLMSettingsResponse:
    return LLMSettingsResponse(
        api_base=row.api_base or "",
        model=row.model or "",
        max_tokens=row.max_tokens,
        context_window=row.context_window,
        provider=row.provider or "openai",
        protocol=getattr(row, "protocol", DEFAULT_LLM_PROTOCOL) or DEFAULT_LLM_PROTOCOL,
        reasoning_effort=getattr(row, "reasoning_effort", "medium") or "medium",
        supports_vision=bool(getattr(row, "supports_vision", True)),
        supports_audio=bool(getattr(row, "supports_audio", False)),
        stt_model=getattr(row, "stt_model", "whisper-1") or "whisper-1",
        tts_voice=getattr(row, "tts_voice", "zh-CN-XiaoxiaoNeural") or "zh-CN-XiaoxiaoNeural",
        has_api_key=bool(row.api_key),
        speech_recognize_handler=getattr(row, "speech_recognize_handler", "local") or "local",
        speech_recognize_mode=getattr(row, "speech_recognize_mode", "transcribe") or "transcribe",
        asr_api_base=getattr(row, "asr_api_base", "") or "",
        asr_model=getattr(row, "asr_model", "") or "",
        asr_app_id=getattr(row, "asr_app_id", "") or "",
        asr_resource_id=getattr(row, "asr_resource_id", "") or "",
        asr_app_key=getattr(row, "asr_app_key", "") or "",
        has_asr_api_key=bool(getattr(row, "asr_api_key", "") or ""),
        has_asr_api_secret=bool(getattr(row, "asr_api_secret", "") or ""),
        has_asr_access_key=bool(getattr(row, "asr_access_key", "") or ""),
        speech_speak_handler=getattr(row, "speech_speak_handler", "edge") or "edge",
        speech_speak_mode=getattr(row, "speech_speak_mode", "tts_from_text") or "tts_from_text",
        tts_api_base=getattr(row, "tts_api_base", "") or "",
        tts_model=getattr(row, "tts_model", "") or "",
        has_tts_api_key=bool(getattr(row, "tts_api_key", "") or ""),
        updated_at=row.updated_at,
    )


def _validate_assignments(body: LLMSettingsUpdate) -> None:
    reason = find_provider("reasoning", body.provider) or find_provider(
        "reasoning", "custom"
    )
    # custom / 未知文本 LLM 允许；仅 ASR/TTS 纯供应商禁止作思考者
    if body.provider in ("openai_compat", "xfyun", "volcengine", "aliyun", "tencent", "baidu", "local", "edge", "minimax_speech", "none"):
        raise ApiBusinessError(
            get_spec("A4001"),
            message="面试思考处理者必须是文本 LLM，不能选择仅 ASR/仅 TTS 供应商",
        )
    if reason and not reason.get("can_interview_reason") and reason.get("status") != "coming_soon":
        raise_error("A4001")

    rec = find_provider("recognize", body.speech_recognize_handler)
    if rec:
        if body.speech_recognize_mode == "native_audio" and rec.get("recognize_via") != "native_audio":
            raise ApiBusinessError(
                get_spec("A4003"),
                message="识别方式为原生听音频时，处理者必须支持 native_audio",
            )
        if body.speech_recognize_mode == "transcribe" and rec.get("recognize_via") == "none":
            raise_error("A4002")

    speak = find_provider("speak", body.speech_speak_handler)
    if speak:
        if body.speech_speak_mode == "native_audio" and speak.get("speak_via") != "native_audio":
            raise ApiBusinessError(
                get_spec("A4003"),
                message="播报方式为原生出声时，处理者必须支持 native_audio",
            )
        if body.speech_speak_mode == "tts_from_text" and speak.get("speak_via") not in (
            "tts_from_text",
            "none",
        ):
            if body.speech_speak_handler not in ("edge", "minimax_speech", "none"):
                raise ApiBusinessError(
                    get_spec("A4003"),
                    message="播报方式为 TTS 时请选择 Edge / MiniMax Speech / 仅字幕",
                )


@router.get("/catalog")
def get_voice_catalog() -> dict[str, Any]:
    """三阶段供应商能力目录。"""
    return catalog_payload()


@router.get("/llm", response_model=LLMSettingsResponse)
def get_llm_settings(db: Session = Depends(get_db)):
    row = _get_or_create_settings(db)
    return _row_to_response(row)


@router.put("/llm", response_model=LLMSettingsResponse)
def update_llm_settings(body: LLMSettingsUpdate, db: Session = Depends(get_db)):
    _safe_base(body.api_base, label="LLM API")
    _safe_base(body.asr_api_base, label="ASR API")
    _safe_base(body.tts_api_base, label="TTS API")
    _validate_assignments(body)

    row = _get_or_create_settings(db)
    row.api_base = body.api_base
    row.api_key = _maybe_encrypt(body.api_key, row.api_key or "")
    row.model = body.model
    row.max_tokens = body.max_tokens
    row.context_window = body.context_window
    row.provider = body.provider
    row.protocol = body.protocol
    row.reasoning_effort = body.reasoning_effort
    row.supports_vision = body.supports_vision
    row.supports_audio = body.supports_audio

    row.speech_recognize_handler = body.speech_recognize_handler
    row.speech_recognize_mode = body.speech_recognize_mode
    row.asr_api_base = body.asr_api_base
    row.asr_api_key = _maybe_encrypt(body.asr_api_key, getattr(row, "asr_api_key", "") or "")
    row.asr_model = body.asr_model
    row.asr_app_id = body.asr_app_id
    row.asr_api_secret = _maybe_encrypt(
        body.asr_api_secret, getattr(row, "asr_api_secret", "") or ""
    )
    row.asr_access_key = _maybe_encrypt(
        body.asr_access_key, getattr(row, "asr_access_key", "") or ""
    )
    row.asr_resource_id = body.asr_resource_id
    row.asr_app_key = body.asr_app_key
    # 同步旧字段：便于兼容读 stt_model 的代码
    row.stt_model = body.asr_model or body.stt_model or "base"

    row.speech_speak_handler = body.speech_speak_handler
    row.speech_speak_mode = body.speech_speak_mode
    row.tts_api_base = body.tts_api_base
    row.tts_api_key = _maybe_encrypt(body.tts_api_key, getattr(row, "tts_api_key", "") or "")
    row.tts_model = body.tts_model
    row.tts_voice = body.tts_voice

    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _row_to_response(row)


@router.post(
    "/llm/test",
    response_model=LLMTestResponse,
    dependencies=[
        Depends(
            rate_limit_dep(
                key="llm",
                limit=DEFAULT_LLM_RATE_LIMIT_PER_MINUTE,
            )
        )
    ],
)
async def test_llm_connection(db: Session = Depends(get_db)):
    """兼容旧入口：等同于测试「面试思考」阶段。"""
    result = await test_reason(db)
    return LLMTestResponse(
        success=bool(result.get("success")),
        message=str(result.get("message") or ""),
        model=result.get("model"),
        transcript=result.get("transcript"),
        fallback=result.get("fallback"),
    )


@router.post(
    "/test/{stage}",
    response_model=LLMTestResponse,
    dependencies=[
        Depends(
            rate_limit_dep(
                key="llm",
                limit=DEFAULT_LLM_RATE_LIMIT_PER_MINUTE,
            )
        )
    ],
)
async def test_pipeline_stage(stage: str, db: Session = Depends(get_db)):
    """三阶段连通性测试：recognize | reason | speak。"""
    stage = (stage or "").strip().lower()
    if stage == "recognize":
        result = await test_recognize(db)
    elif stage in ("reason", "reasoning", "llm"):
        result = await test_reason(db)
    elif stage in ("speak", "tts"):
        result = await test_speak(db)
    else:
        raise_error("A4004")

    return LLMTestResponse(
        success=bool(result.get("success")),
        message=str(result.get("message") or ""),
        model=result.get("model"),
        transcript=result.get("transcript"),
        audio_base64=result.get("audio_base64"),
        fallback=result.get("fallback"),
    )
