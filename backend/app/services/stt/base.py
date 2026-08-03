"""STT 适配器公共类型。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class SttCredentials:
    """独立于「面试思考」的识别凭证；禁止静默回落 MiniMax Chat Key。"""

    provider: str = "local"
    api_base: str = ""
    api_key: str = ""
    model: str = ""
    app_id: str = ""
    api_secret: str = ""
    access_key: str = ""
    resource_id: str = ""
    app_key: str = ""
    extra: dict = field(default_factory=dict)


class SttProvider(Protocol):
    async def transcribe(
        self, pcm_b64: str, *, sample_rate: int, creds: SttCredentials
    ) -> str: ...
