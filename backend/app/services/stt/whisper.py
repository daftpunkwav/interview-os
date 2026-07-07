"""Whisper STT 服务（faster-whisper）。"""

import base64
import io
import logging
import struct
import wave
from functools import lru_cache

logger = logging.getLogger(__name__)

_whisper_model = None
_model_name = "base"


def set_whisper_model(name: str) -> None:
    global _model_name, _whisper_model
    if name != _model_name:
        _model_name = name
        _whisper_model = None


@lru_cache(maxsize=1)
def _get_model(model_size: str):
    try:
        from faster_whisper import WhisperModel
        return WhisperModel(model_size, device="cpu", compute_type="int8")
    except Exception as e:
        logger.warning("faster-whisper 不可用: %s", e)
        return None


def pcm_base64_to_wav_bytes(pcm_b64: str, sample_rate: int = 16000) -> bytes:
    """将 base64 PCM Int16 转为 WAV bytes。"""
    pcm = base64.b64decode(pcm_b64)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def transcribe_pcm_base64(pcm_b64: str, sample_rate: int = 16000, model_size: str = "base") -> str:
    """转写 PCM 音频，失败返回空字符串。"""
    model = _get_model(model_size)
    if model is None:
        return ""

    try:
        wav_bytes = pcm_base64_to_wav_bytes(pcm_b64, sample_rate)
        segments, _ = model.transcribe(io.BytesIO(wav_bytes), language="zh", beam_size=1)
        text = "".join(seg.text for seg in segments).strip()
        return text
    except Exception as e:
        logger.error("Whisper 转写失败: %s", e)
        return ""


async def transcribe_pcm_base64_async(
    pcm_b64: str, sample_rate: int = 16000, model_size: str = "base"
) -> str:
    import asyncio
    return await asyncio.to_thread(transcribe_pcm_base64, pcm_b64, sample_rate, model_size)
