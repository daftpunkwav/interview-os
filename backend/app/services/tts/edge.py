"""Edge TTS 语音合成。

edge-tts 客户端会转义正文并自行包装 SSML，因此不支持注入 express-as；
情绪拟真通过 rate/pitch 实现，失败时降级为默认韵律纯文本。
"""

from __future__ import annotations

import base64
import logging
import re

logger = logging.getLogger(__name__)

# 预设中文音色
VOICE_PRESETS = {
    "xiaoxiao": "zh-CN-XiaoxiaoNeural",
    "yunxi": "zh-CN-YunxiNeural",
    "yunyang": "zh-CN-YunyangNeural",
    "xiaoyi": "zh-CN-XiaoyiNeural",
    "yunjian": "zh-CN-YunjianNeural",
}

DEFAULT_VOICE = VOICE_PRESETS["xiaoxiao"]

# 句末硬切分点（与流式入队策略对齐）
_HARD_END = frozenset("。！？!?；;…\n")
# 长句软切分（字数达标后）
_SOFT_BREAK = frozenset("，、,")
_SOFT_MIN_CHARS = 24


def split_sentences(text: str) -> list[str]:
    """按中英文句号切分，用于流式 TTS。"""
    clean = re.sub(r"\[(PHASE_COMPLETE|INTERVIEW_COMPLETE|emotion:\w+)\]", "", text)
    parts = re.split(r"(?<=[。！？!?；;…\.\n])", clean)
    return [p.strip() for p in parts if p.strip()]


def should_flush_sentence_buffer(buf: str) -> bool:
    """流式缓冲是否应立刻入队合成。

    - 遇硬句末标点 → 切
    - 长度 ≥ 24 且遇逗号/顿号 → 软切，降低首包延迟
    """
    if not buf:
        return False
    last = buf[-1]
    if last in _HARD_END:
        return True
    if len(buf) >= _SOFT_MIN_CHARS and last in _SOFT_BREAK:
        return True
    return False


def extract_emotion(text: str) -> str:
    m = re.search(r"\[emotion:(\w+)\]", text)
    return m.group(1) if m else "neutral"


def _plain_text_for_tts(text: str) -> str:
    """去掉控制标记，保留可朗读正文。"""
    clean = re.sub(r"\[(PHASE_COMPLETE|INTERVIEW_COMPLETE|emotion:\w+)\]", "", text)
    return clean.strip()


async def _stream_communicate(communicate) -> bytes:
    audio_bytes = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes += chunk["data"]
    return audio_bytes


async def synthesize_to_base64(
    text: str,
    voice: str | None = None,
    *,
    rate: str = "+0%",
    pitch: str = "+0Hz",
    style: str | None = None,  # noqa: ARG001 — 保留签名；edge-tts 不支持 express-as
) -> str:
    """合成语音并返回 base64 MP3。

    优先 ``Communicate(text, voice, rate=, pitch=)``；失败降级为默认韵律；
    再失败抛错。``style`` 参数保留兼容，实际由调用方映射进 rate/pitch。
    """
    del style  # edge-tts 无法注入 express-as，情绪已体现在 rate/pitch
    plain = _plain_text_for_tts(text)
    if not plain:
        return ""
    import edge_tts

    voice_id = voice or DEFAULT_VOICE
    attempts: list[tuple[str, object]] = [
        ("prosody", edge_tts.Communicate(plain, voice_id, rate=rate, pitch=pitch)),
        ("plain", edge_tts.Communicate(plain, voice_id)),
    ]

    last_err: Exception | None = None
    for label, communicate in attempts:
        try:
            audio_bytes = await _stream_communicate(communicate)
            if audio_bytes:
                if label != "prosody":
                    logger.debug(
                        "Edge TTS 降级为纯文本 voice=%s rate=%s", voice_id, rate
                    )
                return base64.b64encode(audio_bytes).decode("ascii")
        except Exception as e:
            last_err = e
            logger.info("Edge TTS 路径失败 label=%s: %s", label, e)
            continue

    if last_err:
        raise RuntimeError(f"Edge TTS 合成失败: {last_err}") from last_err
    raise RuntimeError("Edge TTS 返回空音频")


async def synthesize_to_base64_safe(
    text: str,
    voice: str | None = None,
    *,
    rate: str = "+0%",
    pitch: str = "+0Hz",
    style: str | None = None,
) -> str:
    """合成语音；失败记日志并返回空串（兼容旧调用）。"""
    try:
        return await synthesize_to_base64(
            text, voice, rate=rate, pitch=pitch, style=style
        )
    except Exception as e:
        logger.error("Edge TTS 失败: %s", e)
        return ""
