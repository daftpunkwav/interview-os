"""统一 STT 入口：优先第三方云端 transcriptions，失败再回退本地 faster-whisper。"""

from __future__ import annotations

import logging

from app.services.stt.cloud import (
    LOCAL_WHISPER_SIZES,
    is_local_stt_model,
    resolve_cloud_stt_model,
    transcribe_pcm_cloud,
)
from app.services.stt.whisper import (
    transcribe_pcm_base64_async as transcribe_local_async,
    warmup_whisper,
)

logger = logging.getLogger(__name__)

__all__ = [
    "LOCAL_WHISPER_SIZES",
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
) -> str:
    """转写一整段用户发言。

    - ``prefer_cloud=True``（默认）：先打云端成品 ASR，失败再本地 Whisper。
    - 模型名为 tiny/base/small/... 且无可用 Key 时走本地。
    """
    if not pcm_b64:
        return ""

    use_cloud = prefer_cloud and bool((api_key or "").strip()) and bool((api_base or "").strip())
    # 显式本地尺寸且未强制云端时，可直接本地；有 Key 时仍优先云端（准确率）
    if use_cloud:
        text = await transcribe_pcm_cloud(
            pcm_b64,
            sample_rate=sample_rate,
            model=model,
            api_base=api_base,
            api_key=api_key,
        )
        if text:
            return text
        logger.info("云端 STT 无结果，回退本地 Whisper model=%s", model)

    local_model = model if is_local_stt_model(model) else "base"
    return await transcribe_local_async(
        pcm_b64, sample_rate=sample_rate, model_size=local_model
    )
