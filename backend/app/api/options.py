"""岗位、企业等选项 API。"""

from fastapi import APIRouter

from app.core.options_data import build_options_payload
from app.schemas import OptionsResponse

router = APIRouter()


@router.get("", response_model=OptionsResponse)
def get_options():
    return OptionsResponse(**build_options_payload())
