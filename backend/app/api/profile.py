"""用户档案 API（本地单用户，无需注册）。"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserProfile
from app.schemas import UserProfileResponse, UserProfileUpdate

router = APIRouter()


def _get_or_create_profile(db: Session) -> UserProfile:
    profile = db.query(UserProfile).first()
    if not profile:
        profile = UserProfile(name="求职者")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("", response_model=UserProfileResponse)
def get_profile(db: Session = Depends(get_db)):
    p = _get_or_create_profile(db)
    return UserProfileResponse(
        id=p.id,
        name=p.name,
        job_direction=p.job_direction,
        experience_years=p.experience_years,
        tech_domains=p.tech_domains_list,
        target_role=p.target_role,
        updated_at=p.updated_at,
    )


@router.put("", response_model=UserProfileResponse)
def update_profile(body: UserProfileUpdate, db: Session = Depends(get_db)):
    p = _get_or_create_profile(db)
    p.name = body.name
    p.job_direction = body.job_direction
    p.experience_years = body.experience_years
    p.set_tech_domains(body.tech_domains)
    p.target_role = body.target_role
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return UserProfileResponse(
        id=p.id,
        name=p.name,
        job_direction=p.job_direction,
        experience_years=p.experience_years,
        tech_domains=p.tech_domains_list,
        target_role=p.target_role,
        updated_at=p.updated_at,
    )
