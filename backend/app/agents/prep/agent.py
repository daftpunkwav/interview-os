"""面试准备 ReAct Agent。"""

import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.orm import Session

from app.models import PrepSession, Resume
from app.services.company.knowledge import get_company_context
from app.services.context.manager import compress_messages, estimate_tokens
from app.services.llm.client import LLMClient
from app.services.search.web import web_search

logger = logging.getLogger(__name__)

PREP_SYSTEM = """你是 InterviewOS 的面试准备教练。帮助用户针对目标岗位和简历进行面试辅导。

工作模式：ReAct
- 分析用户问题，决定是否需要搜索面经或公司信息
- 主动反问用户薄弱点
- 可以出题让用户作答并点评
- 回答简洁实用

可用工具（在回复中用 JSON 标记调用，一次一个）：
{"tool": "web_search", "query": "搜索词"}
{"tool": "company_info", "company": "公司id"}
{"tool": "quiz", "question": "题目", "type": "choice|open"}

若不需要工具，直接回复用户。"""


class PrepAgent:
    def __init__(self, session: PrepSession, llm: LLMClient):
        self.session = session
        self.llm = llm
        self._load_messages()

    def _load_messages(self) -> None:
        try:
            self.messages: list[dict[str, Any]] = json.loads(self.session.messages or "[]")
        except json.JSONDecodeError:
            self.messages = []

    def _save(self, db: Session) -> None:
        self.session.messages = json.dumps(self.messages, ensure_ascii=False)
        db.commit()

    def _get_resume_context(self, db: Session) -> str:
        if not self.session.resume_id:
            return ""
        r = db.query(Resume).filter(Resume.id == self.session.resume_id).first()
        if not r:
            return ""
        return f"简历：{r.filename}\n{r.parsed_profile[:3000]}"

    async def chat(self, user_text: str, db: Session) -> str:
        if not self.messages:
            ctx = self._get_resume_context(db)
            company = get_company_context(self.session.target_company or "")
            self.messages = [
                {"role": "system", "content": f"{PREP_SYSTEM}\n\n{company}\n{ctx}"},
            ]

        self.messages.append({"role": "user", "content": user_text})
        self.messages = compress_messages(self.messages, 128000)

        reply = await self.llm.chat(self.messages, temperature=0.7)

        # ReAct 工具执行
        tool_match = re.search(r'\{["\']tool["\']:\s*["\'](\w+)["\'].*\}', reply, re.DOTALL)
        if tool_match:
            try:
                tool_call = json.loads(tool_match.group(0).replace("'", '"'))
                observation = await self._run_tool(tool_call, db)
                self.messages.append({"role": "assistant", "content": reply})
                self.messages.append({"role": "user", "content": f"工具结果：{observation}\n请基于结果继续辅导用户。"})
                reply = await self.llm.chat(self.messages, temperature=0.7)
            except Exception as e:
                logger.warning("工具执行失败: %s", e)

        self.messages.append({"role": "assistant", "content": reply})
        self.session.token_usage = sum(estimate_tokens(str(m.get("content", ""))) for m in self.messages)
        self._save(db)
        return reply

    async def chat_stream(self, user_text: str, db: Session) -> AsyncIterator[str]:
        """流式返回辅导回复，工具调用后会继续流式输出第二轮结果。"""
        if not self.messages:
            ctx = self._get_resume_context(db)
            company = get_company_context(self.session.target_company or "")
            self.messages = [
                {"role": "system", "content": f"{PREP_SYSTEM}\n\n{company}\n{ctx}"},
            ]

        self.messages.append({"role": "user", "content": user_text})
        self.messages = compress_messages(self.messages, 128000)

        reply_parts: list[str] = []
        async for token in self.llm.chat_stream(self.messages, temperature=0.7):
            reply_parts.append(token)
            yield token
        reply = "".join(reply_parts)

        tool_match = re.search(r'\{["\']tool["\']:\s*["\'](\w+)["\'].*\}', reply, re.DOTALL)
        if tool_match:
            try:
                tool_call = json.loads(tool_match.group(0).replace("'", '"'))
                observation = await self._run_tool(tool_call, db)
                self.messages.append({"role": "assistant", "content": reply})
                self.messages.append({
                    "role": "user",
                    "content": f"工具结果：{observation}\n请基于结果继续辅导用户。",
                })
                final_parts: list[str] = []
                yield "\n\n"
                async for token in self.llm.chat_stream(self.messages, temperature=0.7):
                    final_parts.append(token)
                    yield token
                reply = "".join(final_parts)
            except Exception as e:
                logger.warning("工具执行失败: %s", e)

        self.messages.append({"role": "assistant", "content": reply})
        self.session.token_usage = sum(estimate_tokens(str(m.get("content", ""))) for m in self.messages)
        self._save(db)

    async def _run_tool(self, tool_call: dict[str, Any], db: Session) -> str:
        tool = tool_call.get("tool", "")
        if tool == "web_search":
            return web_search(tool_call.get("query", ""))
        if tool == "company_info":
            return get_company_context(tool_call.get("company", ""))
        if tool == "quiz":
            return f"已出题：{tool_call.get('question', '')}（类型：{tool_call.get('type', 'open')}）"
        return "未知工具"
