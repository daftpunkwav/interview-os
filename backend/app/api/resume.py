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
from app.core.prompts import with_agent_output_rules
from app.core.constants import (
    DEFAULT_LLM_RATE_LIMIT_PER_MINUTE,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
    RESUME_ALLOWED_EXTENSIONS,
    RESUME_MAX_UPLOAD_BYTES,
)
from app.core.ratelimit import rate_limit_dep
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

_RESUME_ANALYZE_PROMPT = with_agent_output_rules("""你是资深技术招聘负责人 + 简历教练 + 面试官。请对候选人简历做**全面、准确、可执行**的评价。

必须返回 JSON（字段齐全，中文撰写，禁止 emoji）：
{
  "score": 0-100 综合分,
  "strengths": ["可量化的优势，3-6 条"],
  "weaknesses": ["具体不足，3-6 条"],
  "improvement_suggestions": ["可执行的简历修改建议，4-8 条"],
  "predicted_questions": ["面试官高概率追问，6-12 条，贴合简历项目"],
  "dimension_scores": {
    "structure_clarity": {"score": 0-100, "comment": "结构与排版清晰度"},
    "impact_quantification": {"score": 0-100, "comment": "成果量化与业务影响"},
    "tech_depth": {"score": 0-100, "comment": "技术深度与栈匹配"},
    "project_narrative": {"score": 0-100, "comment": "项目叙事完整性（背景-职责-难点-结果）"},
    "role_fit": {"score": 0-100, "comment": "与目标岗位匹配度"},
    "keyword_ats": {"score": 0-100, "comment": "关键词与 ATS 友好度"},
    "credibility": {"score": 0-100, "comment": "可信度与一致性（时间线/职责/技能）"},
    "seniority_signal": {"score": 0-100, "comment": "职级信号与领导力/ownership"}
  },
  "ats_keywords": ["简历已覆盖的关键关键词"],
  "missing_keywords": ["目标岗常见但缺失的关键词"],
  "project_deep_dive": ["针对每个重点项目的深挖问题或疑点"],
  "red_flags": ["风险点：空窗、夸大、技术名词堆砌、职责不清等；无则空数组"],
  "role_fit_summary": "一段话总结岗位匹配",
  "seniority_estimate": "如：初级/中级偏上/高级",
  "rewrite_examples": ["把某一条 bullet 改写为更强版本（给出改前→改后）"],
  "interview_risk_areas": ["面试中最容易被打穿的领域"],
  "overall_narrative": "给候选人的总体评价与下一步行动（150-300字）"
}
要求：
1. 评价必须基于简历事实，禁止空泛套话
2. predicted_questions 必须能从简历项目/技能推出
3. rewrite_examples 至少 2 条，给出可直接粘贴的改写
4. 只返回 JSON，不要 Markdown
""")


def _sniff_extension(head: bytes, ext: str) -> bool:
    """基于文件头校验扩展名真实性。"""
    sigs = _MAGIC_BYTES.get(ext)
    if not sigs:
        return True  # md / txt 等纯文本不强校验
    return any(head.startswith(sig) for sig in sigs)


@router.post(
    "/upload",
    response_model=ResumeResponse,
    dependencies=[
        Depends(
            rate_limit_dep(
                key="upload",
                limit=DEFAULT_RATE_LIMIT_PER_MINUTE,
            )
        )
    ],
)
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


def _normalize_resume_analysis_payload(data: dict) -> dict:
    """容错规范化 LLM 返回，保证能通过 ResumeAnalysis 校验。"""
    if not isinstance(data, dict):
        return {}
    out = dict(data)
    # score
    try:
        out["score"] = int(max(0, min(100, int(out.get("score", 0)))))
    except (TypeError, ValueError):
        out["score"] = 0
    # 列表字段
    for key in (
        "strengths", "weaknesses", "improvement_suggestions", "predicted_questions",
        "ats_keywords", "missing_keywords", "project_deep_dive", "red_flags",
        "rewrite_examples", "interview_risk_areas",
    ):
        val = out.get(key)
        if not isinstance(val, list):
            out[key] = []
        else:
            out[key] = [str(x) for x in val if x is not None][:20]
    # 维度分：允许 {k: 80} 或 {k: {score, comment}}
    dims = out.get("dimension_scores") or {}
    if not isinstance(dims, dict):
        dims = {}
    normalized_dims: dict = {}
    for k, v in dims.items():
        key = str(k)[:64]
        if isinstance(v, dict):
            try:
                sc = int(v.get("score", 0))
            except (TypeError, ValueError):
                sc = 0
            normalized_dims[key] = {
                "score": max(0, min(100, sc)),
                "comment": str(v.get("comment") or "")[:500],
            }
        elif isinstance(v, (int, float)):
            normalized_dims[key] = {"score": max(0, min(100, int(v))), "comment": ""}
    out["dimension_scores"] = normalized_dims
    for key in ("role_fit_summary", "seniority_estimate", "overall_narrative"):
        out[key] = str(out.get(key) or "")[:2000]
    return out


@router.delete("/{resume_id}")
def delete_resume(resume_id: int, db: Session = Depends(get_db)):
    """删除简历及本地文件（若存在）。"""
    r = db.query(Resume).filter(Resume.id == resume_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="简历不存在")
    # 尝试删除上传文件（文件名含 uuid 前缀，与落盘规则一致时）
    try:
        upload_dir = Path(settings.upload_dir).resolve()
        for p in upload_dir.glob(f"*_{sanitize_filename(r.filename)}"):
            try:
                assert_within_dir(p, upload_dir)
                p.unlink(missing_ok=True)
            except Exception:
                pass
    except Exception as e:
        logger.warning("删除简历文件时忽略错误: %s", e)
    db.delete(r)
    db.commit()
    return {"ok": True, "id": resume_id}


@router.post(
    "/{resume_id}/analyze",
    dependencies=[
        Depends(
            rate_limit_dep(
                key="llm",
                limit=DEFAULT_LLM_RATE_LIMIT_PER_MINUTE,
            )
        )
    ],
)
async def analyze_resume(resume_id: int, db: Session = Depends(get_db)):
    r = db.query(Resume).filter(Resume.id == resume_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="简历不存在")
    llm = LLMClient.from_db(db)
    if not llm.api_key:
        raise HTTPException(status_code=400, detail="请先配置 API Key")
    # 注入解析档案帮助 Agent 对齐项目
    user_blob = (r.raw_text or "")[:14000]
    if r.parsed_profile:
        user_blob += f"\n\n---\n已解析档案 JSON：\n{r.parsed_profile[:4000]}"
    messages = [
        {"role": "system", "content": _RESUME_ANALYZE_PROMPT},
        {"role": "user", "content": user_blob or "（空简历）"},
    ]
    try:
        data = await llm.chat_json(messages)
    except ValueError as e:
        logger.warning("简历评价 LLM JSON 失败: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"模型未返回有效评价结果：{e}",
        ) from e
    except Exception as e:
        logger.exception("简历评价调用失败")
        raise HTTPException(
            status_code=502,
            detail=f"评价请求失败：{type(e).__name__}",
        ) from e
    try:
        analysis = ResumeAnalysis.model_validate(_normalize_resume_analysis_payload(data))
    except Exception as e:
        logger.warning("简历评价结构校验失败: %s", e)
        raise HTTPException(
            status_code=502,
            detail="模型返回结构不符合评价 schema，请重试或更换模型",
        ) from e
    r.score = analysis.score
    r.analysis = analysis.model_dump_json()
    db.commit()
    return analysis.model_dump()
