"""面试流程 Workflow 定义。"""

from dataclasses import dataclass, field


@dataclass
class InterviewPhase:
    id: str
    name: str
    description: str
    min_questions: int = 1
    max_questions: int = 3


@dataclass
class Workflow:
    id: str
    name: str
    phases: list[InterviewPhase] = field(default_factory=list)


TECHNICAL_WORKFLOW = Workflow(
    id="technical",
    name="技术面",
    phases=[
        InterviewPhase("identity_check", "身份确认", "确认候选人身份，简短寒暄", 1, 1),
        InterviewPhase("self_intro", "自我介绍", "请候选人做自我介绍", 1, 1),
        InterviewPhase("basic_knowledge", "基础知识", "考察岗位相关基础知识", 2, 4),
        InterviewPhase("project_deep_dive", "项目深挖", "深入追问简历中的项目经历", 3, 6),
        InterviewPhase("technical_deep", "技术深挖", "针对技术栈进行深度考察", 2, 4),
        InterviewPhase("system_design", "系统设计", "设计类问题或架构讨论", 1, 2),
        InterviewPhase("scenario", "情景问题", "模拟真实工作场景的问题", 1, 2),
        InterviewPhase("reverse_qa", "反问环节", "候选人向面试官提问", 1, 3),
        InterviewPhase("summary", "总结评价", "面试官做简要总结", 1, 1),
    ],
)

HR_WORKFLOW = Workflow(
    id="hr",
    name="HR 面",
    phases=[
        InterviewPhase("identity_check", "身份确认", "确认身份", 1, 1),
        InterviewPhase("self_intro", "自我介绍", "自我介绍", 1, 1),
        InterviewPhase("career_plan", "职业规划", "了解职业发展方向", 2, 3),
        InterviewPhase("teamwork", "团队合作", "团队协作经历", 2, 3),
        InterviewPhase("pressure", "压力问题", "压力与冲突处理", 1, 2),
        InterviewPhase("salary", "薪资沟通", "薪资期望（模拟）", 1, 1),
        InterviewPhase("reverse_qa", "反问环节", "候选人提问", 1, 3),
        InterviewPhase("summary", "总结评价", "总结", 1, 1),
    ],
)

MANAGEMENT_WORKFLOW = Workflow(
    id="management",
    name="管理岗面",
    phases=[
        InterviewPhase("identity_check", "身份确认", "确认身份", 1, 1),
        InterviewPhase("self_intro", "自我介绍", "自我介绍", 1, 1),
        InterviewPhase("leadership", "领导经验", "团队管理经验", 2, 4),
        InterviewPhase("decision_making", "决策能力", "关键决策案例", 2, 3),
        InterviewPhase("conflict", "冲突处理", "团队冲突解决", 1, 2),
        InterviewPhase("business", "业务理解", "业务战略理解", 2, 3),
        InterviewPhase("reverse_qa", "反问环节", "候选人提问", 1, 3),
        InterviewPhase("summary", "总结评价", "总结", 1, 1),
    ],
)

WORKFLOWS: dict[str, Workflow] = {
    "technical": TECHNICAL_WORKFLOW,
    "hr": HR_WORKFLOW,
    "management": MANAGEMENT_WORKFLOW,
}


PERSONALITY_PROMPTS = {
    "gentle": "你是一位温和友善的面试官，语气亲切，会适当鼓励和引导候选人。",
    "professional": "你是一位专业严谨的面试官，问题精准，注重逻辑和深度。",
    "pressure": "你是一位高压型面试官，追问犀利，不给候选人喘息机会，模拟压力面试。",
    "hr": "你是一位 HR 面试官，关注软技能、文化匹配和职业规划。",
    "expert": "你是一位技术专家型面试官，问题极具深度，追求技术细节和原理理解。",
}

STYLE_PROMPTS = {
    "guided": "采用引导型风格，当候选人回答不完整时给予适当提示。",
    "deep_dive": "采用深挖型风格，对每个回答追问 3-5 层，直到触及技术本质。",
    "continuous": "采用连续追问型，不切换话题，在一个技术点上连续深入。",
    "challenging": "采用挑战型风格，质疑候选人的方案，要求论证和反驳。",
}

STRICTNESS_DESCRIPTIONS = {
    1: "非常友好，像聊天一样轻松",
    2: "较为宽松，偶尔追问",
    3: "正常企业面试强度",
    4: "偏严格，频繁追问细节",
    5: "严格，对模糊回答不接受",
    6: "高压，连续追问不给思考时间",
    7: "很高压，质疑每个论点",
    8: "极度高压，模拟大厂终面",
    9: "压力测试级别",
    10: "极限压力测试，挑战候选人心理极限",
}


def get_workflow(workflow_id: str) -> Workflow:
    return WORKFLOWS.get(workflow_id, TECHNICAL_WORKFLOW)
