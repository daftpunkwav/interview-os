"""三阶段连通性测试。"""

from __future__ import annotations

import base64
import json
import logging
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.services.llm.client import LLMClient
from app.services.stt import transcribe_utterance
from app.services.tts import synthesize_speech
from app.services.voice.catalog import find_provider
from app.services.voice.credentials import (
    build_stt_credentials,
    build_tts_credentials,
    load_settings_row,
)

logger = logging.getLogger(__name__)

_FIXTURE_DIR = Path(__file__).resolve().parents[2] / "data" / "stt_fixtures"
_EXPECTED_PATH = _FIXTURE_DIR / "expected.json"
_AUDIO_PATH = _FIXTURE_DIR / "audio_zh_growth.wav"


def _normalize_zh(text: str) -> str:
    t = (text or "").strip().lower()
    t = re.sub(r"[\s\W_]+", "", t, flags=re.UNICODE)
    return t


def load_fixture() -> tuple[bytes, str]:
    expected = "同比前年增长五成"
    if _EXPECTED_PATH.is_file():
        try:
            data = json.loads(_EXPECTED_PATH.read_text(encoding="utf-8"))
            expected = str(data.get("expected_zh") or expected)
        except Exception:
            pass
    if not _AUDIO_PATH.is_file():
        raise FileNotFoundError(f"缺少标准测试音频: {_AUDIO_PATH}")
    return _AUDIO_PATH.read_bytes(), expected


async def test_recognize(db: Session) -> dict:
    row = load_settings_row(db)
    creds = build_stt_credentials(row)
    meta = find_provider("recognize", creds.provider)
    if meta and meta.get("status") == "coming_soon":
        return {
            "success": False,
            "message": (
                f"识别处理者 {creds.provider} 运行时尚未接通，"
                "请改用转写类 ASR 或本地 Whisper"
            ),
            "fallback": "local",
        }

    try:
        wav_bytes, expected = load_fixture()
    except FileNotFoundError as e:
        return {"success": False, "message": str(e)}

    pcm_b64 = base64.b64encode(wav_bytes).decode("ascii")
    # fixture 是完整 wav；whisper 路径期望 pcm。对 cloud adapters 多数接受 wav via pcm_base64_to_wav_bytes
    # 更稳妥：把 wav 当文件交给适配器——当前适配器用 pcm→wav。对 wav 输入再包一层会坏。
    # 因此：提取 pcm 或直接让 openai 路径吃 wav bytes as "pcm" wrongly.
    # Fix: 若是 RIFF wav，转 pcm16。
    pcm_b64 = _wav_to_pcm_b64(wav_bytes)

    text = await transcribe_utterance(
        pcm_b64, sample_rate=16000, creds=creds, prefer_cloud=True
    )
    norm_got = _normalize_zh(text)
    norm_exp = _normalize_zh(expected)
    ok = bool(text) and (norm_exp in norm_got or norm_got in norm_exp)
    return {
        "success": ok,
        "message": (
            f"转写匹配成功：{text}"
            if ok
            else f"转写未匹配期望「{expected}」，实际：「{text or '(空)'}」"
        ),
        "transcript": text or None,
        "model": creds.model or creds.provider,
    }


def _wav_to_pcm_b64(wav_bytes: bytes) -> str:
    if len(wav_bytes) > 44 and wav_bytes[:4] == b"RIFF":
        # 简易：跳过 44 字节标准头（fixture 为 PCM wav）
        return base64.b64encode(wav_bytes[44:]).decode("ascii")
    return base64.b64encode(wav_bytes).decode("ascii")


async def test_reason(db: Session) -> dict:
    row = load_settings_row(db)
    provider = (getattr(row, "provider", None) or "minimax") if row else "minimax"
    meta = find_provider("reasoning", provider)
    if meta and meta.get("status") == "coming_soon":
        return {
            "success": False,
            "message": (
                f"思考处理者 {provider} 标记为尚未接通，请改用 MiniMax 等文本 LLM"
            ),
            "fallback": "minimax",
        }

    llm = LLMClient.from_db(db)
    if not llm.api_key:
        return {"success": False, "message": "请先配置面试思考处理器的 API Key"}
    try:
        success, message = await llm.test_connection()
        if success:
            # 额外发一句面试官自报
            reply = await llm.chat(
                [
                    {"role": "system", "content": "你是面试官。"},
                    {"role": "user", "content": "用一句话自我介绍你是面试官"},
                ]
            )
            text = (reply or "").strip() if isinstance(reply, str) else str(reply or "").strip()
            if not text:
                # test_connection 已成功即可
                return {"success": True, "message": message or "连接成功", "model": llm.model}
            return {
                "success": True,
                "message": f"思考正常：{text[:120]}",
                "model": llm.model,
                "transcript": text[:500],
            }
        return {"success": False, "message": message, "model": llm.model}
    except Exception as e:
        return {"success": False, "message": f"思考测试失败: {e}"}


async def test_speak(db: Session) -> dict:
    row = load_settings_row(db)
    creds = build_tts_credentials(row)
    meta = find_provider("speak", creds.handler)
    if meta and meta.get("status") == "coming_soon":
        return {
            "success": False,
            "message": (
                f"播报处理者 {creds.handler} 运行时尚未接通，将回退 Edge TTS"
            ),
            "fallback": "edge",
        }
    if creds.mode == "text_only" or creds.handler == "none":
        return {"success": True, "message": "已配置为仅字幕，无需合成音频"}

    audio = await synthesize_speech("你好，我是面试官", creds=creds)
    if audio:
        return {
            "success": True,
            "message": f"播报合成成功（handler={creds.handler}）",
            "audio_base64": audio,
            "model": creds.model or creds.handler,
        }
    return {
        "success": False,
        "message": f"播报合成失败（handler={creds.handler}），请检查网络或凭证",
    }
