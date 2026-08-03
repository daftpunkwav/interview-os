"""STT 供应商路由：按 handler id 分发，失败可回退本地 Whisper。"""

from __future__ import annotations

import logging
from dataclasses import dataclass

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


@dataclass(frozen=True)
class SttResult:
    """转写结果；``fallback=True`` 表示未使用用户配置的主 provider。"""

    text: str
    provider: str
    fallback: bool = False
    requested_provider: str | None = None


async def transcribe_with_handler(
    pcm_b64: str,
    *,
    sample_rate: int,
    creds: SttCredentials,
    fallback_local: bool = True,
) -> SttResult:
    """按 ``creds.provider`` 转写；coming_soon / 未知供应商回退本地。"""
    if not pcm_b64:
        return SttResult(text="", provider="local")

    requested = (creds.provider or "local").strip()
    provider_id = requested
    meta = find_provider("recognize", provider_id)
    forced_fallback = False
    if meta and meta.get("status") == "coming_soon":
        logger.info("识别处理者 %s 尚未接通，回退本地 Whisper", provider_id)
        provider_id = "local"
        forced_fallback = True

    if meta and meta.get("recognize_via") == "native_audio" and meta.get("status") != "ready":
        logger.info("native_audio 识别未接通，回退 local")
        provider_id = "local"
        forced_fallback = True

    impl = _PROVIDERS.get(provider_id)
    if impl is None:
        logger.warning("未知识别处理者 %s，回退 local", provider_id)
        impl = _PROVIDERS["local"]
        provider_id = "local"
        forced_fallback = True

    text = ""
    try:
        text = await impl.transcribe(pcm_b64, sample_rate=sample_rate, creds=creds)
    except Exception as e:
        logger.error("ASR provider=%s 异常: %s", provider_id, e)

    if text:
        return SttResult(
            text=text,
            provider=provider_id,
            fallback=forced_fallback or provider_id != requested,
            requested_provider=requested,
        )

    if fallback_local and provider_id != "local":
        logger.info("ASR provider=%s 无结果，回退本地 Whisper", provider_id)
        local_text = await _PROVIDERS["local"].transcribe(
            pcm_b64,
            sample_rate=sample_rate,
            creds=SttCredentials(provider="local", model="base"),
        )
        return SttResult(
            text=local_text,
            provider="local",
            fallback=True,
            requested_provider=requested,
        )
    return SttResult(
        text="",
        provider=provider_id,
        fallback=forced_fallback,
        requested_provider=requested,
    )
