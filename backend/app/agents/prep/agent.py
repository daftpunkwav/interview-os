"""面试准备 ReAct Agent。"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.orm import Session

from app.core.prompts import with_agent_output_rules
from app.models import PrepSession, Resume
from app.services.company.knowledge import get_company_context
from app.services.context.manager import compress_messages, estimate_tokens
from app.services.llm.client import LLMClient
from app.services.search.web import web_search

logger = logging.getLogger(__name__)

# 最多工具轮次（每轮可并行多个 tool JSON）
_MAX_TOOL_ROUNDS = 3
# 单轮最多工具数（过多串行/并行搜索会拖死 SSE）
_MAX_TOOLS_PER_ROUND = 3
# 单次 web_search 超时（秒）；DDGS 在部分网络下会长时间挂起
_TOOL_TIMEOUT_SEC = 18.0
_WEB_SEARCH_MAX_RESULTS = 3

# 匹配一行/一段内的 tool JSON（非贪婪到配对的 }）
_TOOL_JSON_RE = re.compile(
    r"\{[^{}]*[\"']tool[\"']\s*:\s*[\"']\w+[\"'][^{}]*\}",
    re.IGNORECASE,
)

PREP_SYSTEM = with_agent_output_rules("""你是 InterviewOS 的面试准备教练。帮助用户针对目标岗位和**选定简历**进行面试前辅导。

工作模式：ReAct
- 结合简历项目与技能给出贴合的准备建议
- 分析用户问题，决定是否需要搜索面经、公司信息或 GitHub 仓库
- 主动反问用户薄弱点
- 可以出题让用户作答并点评
- 回答简洁实用、可执行

输出规范：
- 正式回答直接写给用户看的辅导内容（Markdown 可用），不要把内心推理与正式回答混在同一段
- 若需要输出内部推理，仅使用 <think>...</think> 包裹；正式正文放在标签外
- **禁止**把工具调用 JSON 写进给用户看的正文；工具 JSON 单独成行、仅用于系统执行
- 需要检索时，优先 1～2 个高质量 query；单轮最多 3 个工具 JSON（每个一行），系统会并行执行后再让你总结
- 未定具体公司时：用 1～2 个通用面经 query 即可，不要为每个平台各搜一次

可用工具（每行一个 JSON，不要夹杂在句子中间）：
{"tool": "web_search", "query": "搜索词"}
{"tool": "company_info", "company": "公司id"}
{"tool": "quiz", "question": "题目", "type": "choice|open"}
{"tool": "github_list_repos", "username": "github用户名"}
{"tool": "github_get_readme", "owner": "用户", "repo": "仓库"}

若不需要工具，直接回复用户。辅导时优先引用简历中的具体项目名与技术点。
拿到工具结果后：用中文归纳高频考点与建议，**不要再输出 tool JSON**（除非仍缺关键信息）。
若工具返回含「SEARCH_UNAVAILABLE / 搜索暂时不可用 / 未找到」：
- 禁止编造搜索结果列表、具体链接或引用编号
- 可基于通用知识继续辅导，并明确标注「基于通用知识整理，非实时检索」""")


def extract_tool_calls(text: str) -> list[dict[str, Any]]:
    """从模型输出中抽取全部 tool JSON。"""
    calls: list[dict[str, Any]] = []
    for m in _TOOL_JSON_RE.finditer(text or ""):
        raw = m.group(0)
        try:
            obj = json.loads(raw.replace("'", '"'))
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and obj.get("tool"):
            calls.append(obj)
    return calls


def strip_tool_calls(text: str) -> str:
    """去掉 tool JSON，留下用户可见正文。"""
    if not text:
        return ""
    cleaned = _TOOL_JSON_RE.sub("", text)
    # 压缩因删除 JSON 产生的多余空行
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


class _ToolJsonStreamFilter:
    """流式抑制 tool JSON，避免把调用协议吐给前端。"""

    def __init__(self) -> None:
        self._buf = ""

    def feed(self, token: str) -> str:
        if not token:
            return ""
        self._buf += token
        out: list[str] = []
        while True:
            start = self._buf.find("{")
            if start < 0:
                out.append(self._buf)
                self._buf = ""
                break
            # 花括号前的正文可放出
            if start > 0:
                out.append(self._buf[:start])
                self._buf = self._buf[start:]
            # 尝试在缓冲中找完整 {...}
            depth = 0
            end = -1
            for i, ch in enumerate(self._buf):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            if end < 0:
                # 未闭合：像 tool 则继续等；否则尽快放出，避免长时间卡住可见流
                looks_like_tool = '"tool"' in self._buf or "'tool'" in self._buf
                if not looks_like_tool and len(self._buf) > 80:
                    out.append(self._buf)
                    self._buf = ""
                elif looks_like_tool and len(self._buf) > 600:
                    # 异常超长未闭合：放弃抑制，避免永久吞流
                    out.append(self._buf)
                    self._buf = ""
                break
            block = self._buf[: end + 1]
            self._buf = self._buf[end + 1 :]
            if re.search(r"[\"']tool[\"']\s*:", block, re.I):
                # 抑制 tool JSON
                continue
            out.append(block)
        return "".join(out)

    def flush(self) -> str:
        rest = self._buf
        self._buf = ""
        if re.search(r"[\"']tool[\"']\s*:", rest, re.I):
            return ""
        return rest


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

    def _ensure_system(self, db: Session) -> None:
        if self.messages:
            return
        ctx = self._get_resume_context(db)
        company = get_company_context(self.session.target_company or "")
        self.messages = [
            {"role": "system", "content": f"{PREP_SYSTEM}\n\n{company}\n{ctx}"},
        ]

    async def _run_tool(self, tool_call: dict[str, Any], db: Session) -> str:
        """执行单个工具；同步 IO（如 DDGS）放到线程池，避免阻塞 SSE 事件循环。"""
        tool = tool_call.get("tool", "")
        if tool == "web_search":
            query = str(tool_call.get("query", "") or "")
            return await asyncio.to_thread(
                web_search, query, _WEB_SEARCH_MAX_RESULTS
            )
        if tool == "company_info":
            company = str(tool_call.get("company", "") or "")
            return await asyncio.to_thread(get_company_context, company)
        if tool == "quiz":
            return f"已出题：{tool_call.get('question', '')}（类型：{tool_call.get('type', 'open')}）"
        if tool in ("github_list_repos", "github_get_readme", "github_get_repo", "github_list_commits"):
            from app.services.github.tools import execute_github_tool

            name = tool if tool.startswith("github_") else f"github_{tool}"
            args = {k: v for k, v in tool_call.items() if k != "tool"}
            return await execute_github_tool(name, args)
        return f"未知工具：{tool}"

    async def _run_tool_safe(self, tool_call: dict[str, Any], db: Session) -> str:
        label = tool_call.get("tool", "?")
        query = tool_call.get("query") or tool_call.get("company") or tool_call.get("repo") or ""
        header = f"[{label}] {query}".strip()
        try:
            obs = await asyncio.wait_for(
                self._run_tool(tool_call, db),
                timeout=_TOOL_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            logger.warning("工具超时 %s (%.0fs)", tool_call, _TOOL_TIMEOUT_SEC)
            obs = (
                "SEARCH_UNAVAILABLE\n"
                f"搜索超时（>{_TOOL_TIMEOUT_SEC:.0f}s）。请勿编造结果；可基于通用知识继续。"
            )
        except Exception as e:
            logger.warning("工具执行失败 %s: %s", tool_call, e)
            obs = f"执行失败：{e}"
        return f"{header}\n{obs}"

    async def _run_tools(self, calls: list[dict[str, Any]], db: Session) -> str:
        limited = calls[:_MAX_TOOLS_PER_ROUND]
        # 并行执行，且每项有超时；避免串行 DDGS 把流式响应卡死数分钟
        chunks = await asyncio.gather(
            *[self._run_tool_safe(call, db) for call in limited]
        )
        body = "\n\n---\n\n".join(chunks)
        if "SEARCH_UNAVAILABLE" in body or "搜索暂时不可用" in body:
            body += (
                "\n\n【系统约束】检索未成功。禁止编造「搜索到的结果」清单、链接或 [1][2] 引用；"
                "请用通用知识继续辅导，并写明「基于通用知识整理，非实时搜索」。"
            )
        return body

    async def chat(self, user_text: str, db: Session) -> str:
        self._ensure_system(db)
        self.messages.append({"role": "user", "content": user_text})
        self.messages = compress_messages(self.messages, 128000)

        reply = await self.llm.chat(self.messages, temperature=0.7)
        for _ in range(_MAX_TOOL_ROUNDS):
            calls = extract_tool_calls(reply)
            if not calls:
                break
            observation = await self._run_tools(calls, db)
            self.messages.append({"role": "assistant", "content": reply})
            self.messages.append({
                "role": "user",
                "content": (
                    f"工具结果：\n{observation}\n\n"
                    "请基于以上结果继续辅导用户；给出可执行的高频考点归纳与建议，"
                    "不要再输出 tool JSON（除非仍缺关键检索）。"
                ),
            })
            reply = await self.llm.chat(self.messages, temperature=0.7)

        final = strip_tool_calls(reply) or reply
        self.messages.append({"role": "assistant", "content": final})
        self.session.token_usage = sum(
            estimate_tokens(str(m.get("content", ""))) for m in self.messages
        )
        self._save(db)
        return final

    async def chat_stream(self, user_text: str, db: Session) -> AsyncIterator[str]:
        """流式辅导：抑制 tool JSON；多工具执行后再流式输出最终回答。"""
        self._ensure_system(db)
        self.messages.append({"role": "user", "content": user_text})
        self.messages = compress_messages(self.messages, 128000)

        # 第一轮：流式输出，同时过滤 tool JSON
        filt = _ToolJsonStreamFilter()
        reply_parts: list[str] = []
        async for token in self.llm.chat_stream(self.messages, temperature=0.7):
            reply_parts.append(token)
            visible = filt.feed(token)
            if visible:
                yield visible
        tail = filt.flush()
        if tail:
            yield tail
        reply = "".join(reply_parts)

        for round_i in range(_MAX_TOOL_ROUNDS):
            calls = extract_tool_calls(reply)
            if not calls:
                break

            # 用户侧提示（不泄露原始 JSON）；先 sleep(0) 让 SSE 刷出，再跑工具
            labels = []
            for c in calls[:_MAX_TOOLS_PER_ROUND]:
                q = c.get("query") or c.get("company") or c.get("repo") or c.get("tool")
                labels.append(str(q))
            yield f"\n\n正在检索：{'；'.join(labels)}…\n\n"
            await asyncio.sleep(0)

            observation = await self._run_tools(calls, db)
            yield "检索完成，正在整理要点…\n\n"
            await asyncio.sleep(0)

            self.messages.append({"role": "assistant", "content": reply})
            self.messages.append({
                "role": "user",
                "content": (
                    f"工具结果：\n{observation}\n\n"
                    "请基于以上结果继续辅导用户；用中文归纳高频考点与建议，"
                    "不要再输出 tool JSON（除非仍缺关键检索）。"
                ),
            })

            filt = _ToolJsonStreamFilter()
            reply_parts = []
            async for token in self.llm.chat_stream(self.messages, temperature=0.7):
                reply_parts.append(token)
                visible = filt.feed(token)
                if visible:
                    yield visible
            tail = filt.flush()
            if tail:
                yield tail
            reply = "".join(reply_parts)

            # 若本轮仍几乎全是 tool JSON，继续；否则结束
            if not extract_tool_calls(reply):
                break
            if round_i == _MAX_TOOL_ROUNDS - 1 and extract_tool_calls(reply):
                # 最后一轮仍吐 JSON：只把剥离后正文补发给用户
                leftover = strip_tool_calls(reply)
                if leftover and leftover not in "".join(reply_parts):
                    yield leftover

        final = strip_tool_calls(reply) or strip_tool_calls("".join(reply_parts)) or reply
        # 会话里存用户可见正文，避免历史里堆满 tool JSON
        self.messages.append({"role": "assistant", "content": final})
        self.session.token_usage = sum(
            estimate_tokens(str(m.get("content", ""))) for m in self.messages
        )
        self._save(db)
