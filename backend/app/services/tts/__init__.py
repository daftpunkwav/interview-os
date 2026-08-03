"""TTS 统一入口：按播报处理者选择 Edge / MiniMax / 仅字幕。"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.services.tts.edge import synthesize_to_base64 as edge_synthesize
from app.services.tts.minimax import (
    DEFAULT_BASE as MINIMAX_DEFAULT_BASE,
    DEFAULT_MODEL as MINIMAX_DEFAULT_MODEL,
    DEFAULT_VOICE as MINIMAX_DEFAULT_VOICE,
    synthesize_minimax_to_base64,
)
from app.services.voice.catalog import find_provider

logger = logging.getLogger(__name__)


@dataclass
class TtsCredentials:
    handler: str = "edge"
    mode: str = "tts_from_text"  # tts_from_text | native_audio | text_only
    api_base: str = ""
    api_key: str = ""
    model: str = ""
    voice: str = "zh-CN-XiaoxiaoNeural"


async def synthesize_speech(
    text: str,
    *,
    creds: TtsCredentials,
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> str:
    """合成语音 base64；text_only / coming_soon / 失败时返回空串（上层继续字幕）。"""
    handler = (creds.handler or "edge").strip()
    mode = (creds.mode or "tts_from_text").strip()

    if mode == "text_only" or handler == "none":
        return ""

    meta = find_provider("speak", handler)
    if meta and meta.get("status") == "coming_soon":
        logger.info("播报处理者 %s 尚未接通，回退 Edge TTS", handler)
        handler = "edge"
        mode = "tts_from_text"

    if mode == "native_audio":
        logger.info("native_audio 播报未接通，回退 Edge TTS")
        handler = "edge"

    if handler == "minimax_speech":
        audio = await synthesize_minimax_to_base64(
            text,
            api_key=creds.api_key,
            api_base=creds.api_base or MINIMAX_DEFAULT_BASE,
            model=creds.model or MINIMAX_DEFAULT_MODEL,
            voice=creds.voice or MINIMAX_DEFAULT_VOICE,
        )
        if audio:
            return audio
        logger.info("MiniMax Speech 失败，降级 Edge TTS")
        handler = "edge"

    # 默认 Edge
    try:
        return await edge_synthesize(text, creds.voice or "zh-CN-XiaoxiaoNeural", rate=rate, pitch=pitch)
    except Exception as e:
        logger.error("Edge TTS 失败: %s", e)
        return ""
