"""Edge TTS 语音合成。"""

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


def split_sentences(text: str) -> list[str]:
    """按中英文句号切分，用于流式 TTS。"""
    clean = re.sub(r"\[(PHASE_COMPLETE|INTERVIEW_COMPLETE|emotion:\w+)\]", "", text)
    # 中英文句末标点 + 换行 + 省略号尾部视为切分点。
    # 与 frontend ``@/lib/sentenceSplit.ts`` 保持一致(若有)。
    parts = re.split(r"(?<=[。！？!?；;…\.\n])", clean)
    return [p.strip() for p in parts if p.strip()]


async def synthesize_to_base64(text: str, voice: str | None = None) -> str:
    """合成语音并返回 base64 MP3。"""
    if not text.strip():
        return ""
    try:
        import edge_tts
        voice_id = voice or DEFAULT_VOICE
        communicate = edge_tts.Communicate(text, voice_id)
        audio_bytes = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes += chunk["data"]
        return base64.b64encode(audio_bytes).decode("ascii")
    except Exception as e:
        logger.error("Edge TTS 失败: %s", e)
        return ""


def extract_emotion(text: str) -> str:
    m = re.search(r"\[emotion:(\w+)\]", text)
    return m.group(1) if m else "neutral"
