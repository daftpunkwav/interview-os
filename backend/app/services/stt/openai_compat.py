"""OpenAI 兼容 /audio/transcriptions 适配器。"""

from __future__ import annotations

from app.services.stt.base import SttCredentials
from app.services.stt.cloud import transcribe_pcm_cloud


class OpenAICompatProvider:
    async def transcribe(
        self, pcm_b64: str, *, sample_rate: int, creds: SttCredentials
    ) -> str:
        return await transcribe_pcm_cloud(
            pcm_b64,
            sample_rate=sample_rate,
            model=creds.model or "FunAudioLLM/SenseVoiceSmall",
            api_base=creds.api_base,
            api_key=creds.api_key,
        )
