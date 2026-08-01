"""面试统筹 Agent：合并多源快照、静默追问。"""

from app.realtime.events import SessionSnapshot


class InterviewOrchestrator:
    """读取各子 Agent 快照，生成增强上下文与静默追问。"""

    def __init__(self) -> None:
        self.snapshot = SessionSnapshot()

    def build_context_prefix(self) -> str:
        parts: list[str] = []
        if self.snapshot.vision_summary:
            parts.append(f"[视觉状态：{self.snapshot.vision_summary}]")
        return " ".join(parts)

    def build_silence_nudge(self, personality: str, strictness: int) -> str:
        is_strict = strictness >= 6 or personality in ("pressure", "expert")
        if is_strict:
            templates = [
                "你已经思考了一会儿了。请直接回答，不要回避问题。",
                "时间有限，请尽快给出你的看法。",
                "我需要你更具体一些，请现在回答。",
            ]
        else:
            templates = [
                "没关系，可以先说说你的想法，哪怕不完整也没关系。",
                "你可以从印象最深的一点开始说起。",
                "需要我换个角度提问吗？或者你先讲讲相关背景？",
            ]
        # 把 1-10 的严格度均匀映射到模板索引：
        # 1-4 -> 0（最温和/最克制），5-8 -> 1，9-10 -> 2（最直接/最施压）
        idx = max(0, min((strictness - 1) // 4, len(templates) - 1))
        return templates[idx]
