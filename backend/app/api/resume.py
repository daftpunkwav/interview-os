"""简历上传与解析 API。"""

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Resume
from app.schemas import CandidateProfile, ResumeResponse
from app.services.llm.client import LLMClient
from app.services.resume.parser import extract_text_from_file, parse_resume_with_llm

router = APIRouter()
settings = get_settings()

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "md", "txt"}


@router.post("/upload", response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式，允许：{', '.join(ALLOWED_EXTENSIONS)}")

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    file_path = upload_dir / safe_name

    content = await file.read()
    file_path.write_bytes(content)

    try:
        raw_text = extract_text_from_file(file_path, ext)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件解析失败: {e}")

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
        created_at=resume.created_at,
    )


@router.get("/list", response_model=list[ResumeResponse])
def list_resumes(db: Session = Depends(get_db)):
    resumes = db.query(Resume).order_by(Resume.created_at.desc()).all()
    result = []
    for r in resumes:
        try:
            profile = CandidateProfile(**json.loads(r.parsed_profile))
        except Exception:
            profile = CandidateProfile()
        result.append(ResumeResponse(
            id=r.id,
            filename=r.filename,
            file_type=r.file_type,
            parsed_profile=profile,
            created_at=r.created_at,
        ))
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
        created_at=r.created_at,
    )
