"""从 LLMSettings 行构建三阶段运行时凭证。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.secrets import decrypt_secret
from app.models import LLMSettings
from app.services.stt.base import SttCredentials
from app.services.tts import TtsCredentials
from app.services.voice.catalog import find_provider


def _g(row: LLMSettings, name: str, default: str = "") -> str:
    return str(getattr(row, name, default) or default)


def _dec(row: LLMSettings, name: str) -> str:
    """解密字段；``enc:*`` 密文解密失败时抛错，不回退原文。"""
    raw = getattr(row, name, None) or ""
    if not raw:
        return ""
    text = str(raw)
    # 明文兼容旧数据：非加密前缀直接返回
    if not text.startswith("enc:"):
        return text
    try:
        return decrypt_secret(text) or ""
    except Exception as e:
        raise ValueError(
            f"语音凭证字段 {name} 解密失败，请到设置页重新保存密钥"
        ) from e


def load_settings_row(db: Session) -> LLMSettings | None:
    return db.query(LLMSettings).filter(LLMSettings.id == 1).first()


def build_stt_credentials(row: LLMSettings | None) -> SttCredentials:
    """独立识别凭证；无配置时默认 local，绝不回落思考 Key。"""
    if not row:
        return SttCredentials(provider="local", model="base")

    handler = _g(row, "speech_recognize_handler", "local") or "local"
    mode = _g(row, "speech_recognize_mode", "transcribe")
    meta = find_provider("recognize", handler)

    # native_audio 未接通时运行时按 transcribe + local/openai 处理由 router 负责
    if mode == "native_audio" and meta and meta.get("status") == "coming_soon":
        handler = "local"

    model = _g(row, "asr_model") or _g(row, "stt_model", "base")
    return SttCredentials(
        provider=handler,
        api_base=_g(row, "asr_api_base"),
        api_key=_dec(row, "asr_api_key"),
        model=model,
        app_id=_g(row, "asr_app_id"),
        api_secret=_dec(row, "asr_api_secret"),
        access_key=_dec(row, "asr_access_key"),
        resource_id=_g(row, "asr_resource_id"),
        app_key=_g(row, "asr_app_key"),
    )


def build_tts_credentials(row: LLMSettings | None) -> TtsCredentials:
    if not row:
        return TtsCredentials(handler="edge", voice="zh-CN-XiaoxiaoNeural")

    handler = _g(row, "speech_speak_handler", "edge") or "edge"
    mode = _g(row, "speech_speak_mode", "tts_from_text") or "tts_from_text"
    tts_key = _dec(row, "tts_api_key")
    # MiniMax Speech 可复用思考 Key（同一家），但 ASR 绝不复用
    if handler == "minimax_speech" and not tts_key:
        tts_key = _dec(row, "api_key")
    return TtsCredentials(
        handler=handler,
        mode=mode,
        api_base=_g(row, "tts_api_base") or "https://api.minimaxi.com/v1",
        api_key=tts_key,
        model=_g(row, "tts_model") or "speech-2.8-hd",
        voice=_g(row, "tts_voice", "zh-CN-XiaoxiaoNeural"),
    )
