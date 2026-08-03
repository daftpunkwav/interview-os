"""统一 STT 入口：按独立识别凭证路由，禁止静默使用思考 LLM Key。"""

from __future__ import annotations

import logging

from app.services.stt.base import SttCredentials
from app.services.stt.cloud import (
    LOCAL_WHISPER_SIZES,
    is_local_stt_model,
    resolve_cloud_stt_model,
    transcribe_pcm_cloud,
)
from app.services.stt.router import transcribe_with_handler
from app.services.stt.whisper import (
    transcribe_pcm_base64_async as transcribe_local_async,
    warmup_whisper,
)

logger = logging.getLogger(__name__)

__all__ = [
    "LOCAL_WHISPER_SIZES",
    "SttCredentials",
    "is_local_stt_model",
    "resolve_cloud_stt_model",
    "transcribe_utterance",
    "warmup_whisper",
]


async def transcribe_utterance(
    pcm_b64: str,
    *,
    sample_rate: int = 16000,
    model: str = "whisper-1",
    api_base: str = "",
    api_key: str = "",
    prefer_cloud: bool = True,
    creds: SttCredentials | None = None,
) -> str:
    """转写一整段用户发言。

    优先使用 ``creds``（独立识别处理器）。若仅传入旧参数且无 Key，走本地 Whisper。
    **不会**把面试思考 LLM 的 Key 当作默认 ASR Key。
    """
    if not pcm_b64:
        return ""

    if creds is not None:
        return await transcribe_with_handler(
            pcm_b64,
            sample_rate=sample_rate,
            creds=creds,
            fallback_local=True,
        )

    # 兼容旧调用：仅当显式传入 api_key/api_base 时走 openai_compat
    use_cloud = prefer_cloud and bool((api_key or "").strip()) and bool((api_base or "").strip())
    if use_cloud:
        return await transcribe_with_handler(
            pcm_b64,
            sample_rate=sample_rate,
            creds=SttCredentials(
                provider="openai_compat",
                api_base=api_base,
                api_key=api_key,
                model=model,
            ),
            fallback_local=True,
        )

    local_model = model if is_local_stt_model(model) else "base"
    return await transcribe_local_async(
        pcm_b64, sample_rate=sample_rate, model_size=local_model
    )
