"""简历上传与解析 API。

安全要点（已加固）：

- 上传大小上限 :data:`app.core.constants.RESUME_MAX_UPLOAD_BYTES`（默认 10 MB）；
- 文件名走 :func:`app.core.security.sanitize_filename` 清洗，落盘后
  :func:`app.core.security.assert_within_dir` 再做越界校验；
- 通过魔数嗅探真实 MIME，不依赖客户端 ``content_type``；
- LLM 返回的结构化 JSON 经 ``ResumeAnalysis`` 强校验（防御 Pydantic-v2
  ``extra="forbid"`` 之外的 Prompt 注入）。
"""

import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.constants import (
    RESUME_ALLOWED_EXTENSIONS,
    RESUME_MAX_UPLOAD_BYTES,
)
from app.core.security import (
    assert_within_dir,
    sanitize_filename,
)
from app.database import get_db
from app.models import Resume
from app.schemas import CandidateProfile, ResumeAnalysis, ResumeResponse
from app.services.llm.client import LLMClient
from app.services.resume.parser import extract_text_from_file, parse_resume_with_llm

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

ALLOWED_EXTENSIONS = RESUME_ALLOWED_EXTENSIONS  # 兼容旧引用

# 扩展名 ↔ 魔数（仅做基础嗅探）
_MAGIC_BYTES: dict[str, list[bytes]] = {
    "pdf": [b"%PDF-"],
    "docx": [b"PK\x03\x04"],  # zip 容器
    "doc": [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],  # OLE
}

_RESUME_ANALYZE_PROMPT = """你是资深简历顾问和面试官。分析以下简历，返回 JSON：
{
  "score": 85,
  "strengths": ["优势"],
  "weaknesses": ["不足"],
  "improvement_suggestions": ["简历改进建议"],
  "predicted_questions": ["面试官可能问的问题1", "问题2"]
}
只返回 JSON。"""


def _sniff_extension(head: bytes, ext: str) -> bool:
    """基于文件头校验扩展名真实性。"""
    sigs = _MAGIC_BYTES.get(ext)
    if not sigs:
        return True  # md / txt 等纯文本不强校验
    return any(head.startswith(sig) for sig in sigs)


@router.post("/upload", response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式，允许：{', '.join(ALLOWED_EXTENSIONS)}",
        )

    upload_dir = Path(settings.upload_dir).resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)

    # 流式读取并按上限截断，超过立即拒绝
    total = 0
    chunks: list[bytes] = []
    while chunk := await file.read(64 * 1024):
        total += len(chunk)
        if total > RESUME_MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"文件超过 {RESUME_MAX_UPLOAD_BYTES // (1024 * 1024)}MB 上限",
            )
        chunks.append(chunk)
    content = b"".join(chunks)

    if total == 0:
        raise HTTPException(status_code=400, detail="文件为空")

    # 校验扩展名真实（防止扩展名伪造）
    if not _sniff_extension(content[:8], ext):
        raise HTTPException(status_code=400, detail="文件内容与扩展名不匹配")

    # 安全文件名 + 路径穿越防护
    safe_name = f"{uuid.uuid4().hex[:8]}_{sanitize_filename(file.filename)}"
    file_path = assert_within_dir(Path(safe_name), upload_dir)
    file_path.write_bytes(content)

    try:
        raw_text = extract_text_from_file(file_path, ext)
    except Exception as e:
        logger.warning("简历解析失败: %s", e)
        raise HTTPException(status_code=400, detail="文件解析失败，请检查格式") from e

    llm = LLMClient.from_db(db)
    if llm.api_key:
        parsed = await parse_resume_with_llm(raw_text, llm)
    else:
        parsed = CandidateProfile(summary=raw_text[:500])

    resume = Resume(
        filename=file.filename,
        file_type=ext,
        raw_text=raw_text[:50000],
        parsed_profile=parsed.model_dump_json(),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)

    return ResumeResponse(
        id=resume.id,
        filename=resume.filename,
        file_type=resume.file_type,
        parsed_profile=parsed,
        is_active=resume.is_active,
        score=resume.score,
        analysis=json.loads(resume.analysis or "{}"),
        created_at=resume.created_at,
    )


@router.get("/list", response_model=list[ResumeResponse])
def list_resumes(db: Session = Depends(get_db)):
    resumes = db.query(Resume).order_by(Resume.created_at.desc()).all()
    result: list[ResumeResponse] = []
    for r in resumes:
        try:
            profile = CandidateProfile(**json.loads(r.parsed_profile))
        except Exception as e:
            # 单条简历解析 JSON 损坏时降级为空 profile 但要记录,便于后续人工修复
            logger.warning("简历解析 JSON 损坏: id=%s err=%s", r.id, e)
            profile = CandidateProfile()
        result.append(
            ResumeResponse(
                id=r.id,
                filename=r.filename,
                file_type=r.file_type,
                parsed_profile=profile,
                is_active=bool(r.is_active),
                score=r.score,
                analysis=json.loads(r.analysis or "{}"),
                created_at=r.created_at,
            )
        )
    return result


@router.get("/{resume_id}", response_model=ResumeResponse)
def get_resume(resume_id: int, db: Session = Depends(get_db)):
    r = db.query(Resume).filter(Resume.id == resume_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="简历不存在")
    profile = CandidateProfile(**json.loads(r.parsed_profile))
    return ResumeResponse(
        id=r.id,
        filename=r.filename,
        file_type=r.file_type,
        parsed_profile=profile,
        is_active=bool(r.is_active),
        score=r.score,
        analysis=json.loads(r.analysis or "{}"),
        created_at=r.created_at,
    )


@router.post("/{resume_id}/activate", response_model=ResumeResponse)
def activate_resume(resume_id: int, db: Session = Depends(get_db)):
    # 使用行锁防止并发竞态
    r = db.query(Resume).filter(Resume.id == resume_id).with_for_update().first()
    if not r:
        raise HTTPException(status_code=404, detail="简历不存在")
    # 先取消其他活跃简历
    db.query(Resume).filter(Resume.id != resume_id, Resume.is_active == True).update(
        {Resume.is_active: False}, synchronize_session=False
    )
    r.is_active = True
    db.commit()
    db.refresh(r)
    return ResumeResponse(
        id=r.id,
        filename=r.filename,
        file_type=r.file_type,
        parsed_profile=CandidateProfile(**json.loads(r.parsed_profile)),
        is_active=bool(r.is_active),
        score=r.score,
        analysis=json.loads(r.analysis or "{}"),
        created_at=r.created_at,
    )


@router.post("/{resume_id}/analyze")
async def analyze_resume(resume_id: int, db: Session = Depends(get_db)):
    r = db.query(Resume).filter(Resume.id == resume_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="简历不存在")
    llm = LLMClient.from_db(db)
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 API Key")
    messages = [
        {"role": "system", "content": _RESUME_ANALYZE_PROMPT},
        {"role": "user", "content": r.raw_text[:12000] or r.parsed_profile},
    ]
    data = await llm.chat_json(messages)
    # 强校验，防 LLM 注入污染数据库
    analysis = ResumeAnalysis.model_validate(data)
    r.score = analysis.score
    r.analysis = analysis.model_dump_json()
    db.commit()
    return analysis.model_dump()
