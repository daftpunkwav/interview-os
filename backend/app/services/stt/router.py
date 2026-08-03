"""STT 供应商路由：按 handler id 分发，失败可回退本地 Whisper。"""

from __future__ import annotations

import logging

from app.services.stt.aliyun import AliyunProvider
from app.services.stt.baidu import BaiduProvider
from app.services.stt.base import SttCredentials
from app.services.stt.local import LocalWhisperProvider
from app.services.stt.openai_compat import OpenAICompatProvider
from app.services.stt.tencent import TencentProvider
from app.services.stt.volcengine import VolcengineProvider
from app.services.stt.xfyun import XfyunProvider
from app.services.voice.catalog import find_provider

logger = logging.getLogger(__name__)

_PROVIDERS = {
    "openai_compat": OpenAICompatProvider(),
    "local": LocalWhisperProvider(),
    "xfyun": XfyunProvider(),
    "volcengine": VolcengineProvider(),
    "aliyun": AliyunProvider(),
    "tencent": TencentProvider(),
    "baidu": BaiduProvider(),
}


async def transcribe_with_handler(
    pcm_b64: str,
    *,
    sample_rate: int,
    creds: SttCredentials,
    fallback_local: bool = True,
) -> str:
    """按 ``creds.provider`` 转写；coming_soon / 未知供应商回退本地。"""
    if not pcm_b64:
        return ""

    provider_id = (creds.provider or "local").strip()
    meta = find_provider("recognize", provider_id)
    if meta and meta.get("status") == "coming_soon":
        logger.info("识别处理者 %s 尚未接通，回退本地 Whisper", provider_id)
        provider_id = "local"

    if meta and meta.get("recognize_via") == "native_audio" and meta.get("status") != "ready":
        logger.info("native_audio 识别未接通，回退 local")
        provider_id = "local"

    impl = _PROVIDERS.get(provider_id)
    if impl is None:
        logger.warning("未知识别处理者 %s，回退 local", provider_id)
        impl = _PROVIDERS["local"]
        provider_id = "local"

    text = ""
    try:
        text = await impl.transcribe(pcm_b64, sample_rate=sample_rate, creds=creds)
    except Exception as e:
        logger.error("ASR provider=%s 异常: %s", provider_id, e)

    if text:
        return text

    if fallback_local and provider_id != "local":
        logger.info("ASR provider=%s 无结果，回退本地 Whisper", provider_id)
        return await _PROVIDERS["local"].transcribe(
            pcm_b64, sample_rate=sample_rate, creds=SttCredentials(provider="local", model="base")
        )
    return ""
