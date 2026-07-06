"""岗位、企业等选项 API。"""

from fastapi import APIRouter

from app.schemas import OptionsResponse
from app.services.company.knowledge import get_all_companies
from app.services.interview.workflows import WORKFLOWS

router = APIRouter()

ROLES = [
    "后端工程师", "前端工程师", "全栈工程师", "AI 工程师",
    "算法工程师", "游戏客户端工程师", "游戏服务端工程师",
    "移动端工程师", "DevOps 工程师", "产品经理", "技术经理",
]

LEVELS = ["实习生", "初级工程师", "中级工程师", "高级工程师", "专家", "架构师"]

EXPERIENCE_YEARS = ["0-1 年", "1-3 年", "3-5 年", "5-10 年", "10 年以上"]

PERSONALITIES = [
    {"id": "gentle", "name": "温和型", "description": "亲切友善，适当引导"},
    {"id": "professional", "name": "专业型", "description": "严谨精准，注重深度"},
    {"id": "pressure", "name": "压迫型", "description": "高压追问，模拟压力面"},
    {"id": "hr", "name": "HR 型", "description": "关注软技能与文化匹配"},
    {"id": "expert", "name": "技术专家型", "description": "极致深度，追求原理"},
]

INTERVIEW_STYLES = [
    {"id": "guided", "name": "引导型", "description": "适当提示，帮助展开"},
    {"id": "deep_dive", "name": "深挖型", "description": "层层追问至本质"},
    {"id": "continuous", "name": "连续追问型", "description": "单点深入不切换"},
    {"id": "challenging", "name": "挑战型", "description": "质疑方案，要求论证"},
]

WORKFLOW_TYPES = [
    {"id": wf.id, "name": wf.name, "phases": [p.name for p in wf.phases]}
    for wf in WORKFLOWS.values()
]


@router.get("", response_model=OptionsResponse)
def get_options():
    return OptionsResponse(
        roles=ROLES,
        levels=LEVELS,
        experience_years=EXPERIENCE_YEARS,
        companies=get_all_companies(),
        personalities=PERSONALITIES,
        interview_styles=INTERVIEW_STYLES,
        workflow_types=WORKFLOW_TYPES,
    )
