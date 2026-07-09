"""InterviewOS FastAPI 应用入口。

集中管理：

- CORS 严格策略：通配 origins 与 credentials=True 同时启用将启动失败；
- trace_id 注入 + 校验：合法 X-Request-Id 沿用，否则重新生成；
- lifespan：同步 IO 走 ``asyncio.to_thread`` 不阻塞事件循环；
- 统一错误响应信封。

.. note::

    修改 CORS / trace_id 校验请同步调整前端 ``src/lib/api.ts`` 的请求拦截器。
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.config import Settings, get_settings
from app.core.logging import (
    configure_logging,
    get_trace_id,
    reset_trace_id,
    set_trace_id,
)
from app.database import engine, init_db, reset_engine, SessionLocal
from app.core.migrate import run_migrations
from app.core.security import UnsafeURLError
from app.core.constants import TRACE_ID_HEADER
from app.services.seed import seed_llm_settings

configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()


# ── X-Request-Id 校验 ────────────────────────────────────────
# 仅允许 [A-Za-z0-9_-]{8,64}。其他字符 / 过短 / 过长一律重新生成，
# 防止日志注入（CRLF / 控制字符）。
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{8,64}$")


def _sanitize_request_id(raw: str | None) -> str | None:
    """校验通过返回原值，否则返回 None（由 set_trace_id 重新生成）。"""
    if raw and _REQUEST_ID_RE.match(raw):
        return raw
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭钩子。

    同步 IO（SQLite / 文件系统 / 本地 RAG 构建）统一丢到线程池执行，
    避免阻塞事件循环导致心跳/WS 抖动。
    """
    # 启动
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_bootstrap_db_and_seed)
    logger.info("InterviewOS 后端已启动 env=%s", settings.env)
    try:
        yield
    finally:
        # 关闭：释放引擎与外部资源
        # 注意：测试环境下 :memory: SQLite + StaticPool 必须保持单例，
        # 因此 lifespan 关闭时不 dispose；进程退出由 OS 回收。
        if not settings.is_prod and os.environ.get("INTERVIEWOS_TEST_MODE") == "1":
            logger.debug("测试模式：跳过 engine dispose")
        else:
            try:
                await asyncio.to_thread(_shutdown_engine)
            except Exception:
                logger.exception("关闭阶段释放引擎失败")
        logger.info("InterviewOS 后端已关闭")


def _bootstrap_db_and_seed() -> None:
    """同步初始化：建表 + 迁移 + 种子 + RAG 索引（可在测试中 patch）。"""
    init_db()
    run_migrations(engine)
    db = SessionLocal()
    try:
        seed_llm_settings(db)
    finally:
        db.close()
    # RAG 索引构建在调用方单独驱动（async），此处不阻塞线程池


def _shutdown_engine() -> None:
    """关闭阶段 dispose 当前引擎（下次 get_engine 会重新构造）。"""
    try:
        engine.dispose()
    except Exception:
        logger.exception("engine.dispose 失败")


async def _ensure_rag_index(db) -> None:
    """首次启动时构建企业知识库 RAG 索引。

    若未配置 LLM API Key，跳过（不影响启动）。
    """
    from app.services.llm.client import LLMClient
    from app.services.rag.company_rag import CompanyKnowledgeRAG

    try:
        llm = LLMClient.from_db(db)
    except Exception as e:
        logger.warning("跳过 RAG 初始化（LLM 配置不可用）: %s", e)
        return

    api_key = getattr(llm, "api_key", None)
    if not api_key:
        logger.info("未配置 LLM API Key，跳过 RAG 索引构建")
        return

    try:
        rag = CompanyKnowledgeRAG(llm)
        await rag.ensure_index()
    except Exception as e:
        logger.warning("RAG 索引构建失败（启动继续）: %s", e)


app = FastAPI(
    title="InterviewOS",
    description="AI 智能模拟面试 Agent 平台",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    """为每个 HTTP 请求注入 trace_id，便于日志串联。

    - X-Request-Id 通过白名单校验则沿用，否则重新生成；
    - ContextVar token 在 finally 中 reset，避免跨请求污染；
    - 异常路径也要保证响应头携带 X-Trace-Id。
    """
    raw = request.headers.get("x-request-id") or request.headers.get("X-Request-Id")
    token = set_trace_id(_sanitize_request_id(raw))
    # 在 reset 之前先取值，避免 finally 顺序导致响应头为空
    response_trace_id = get_trace_id()
    try:
        response = await call_next(request)
    except Exception:
        # 中间件异常时也要把 trace_id 写回响应（由异常处理器生成响应）
        logger.exception("HTTP 中间件异常 path=%s", request.url.path)
        raise
    finally:
        reset_trace_id(token)
    response.headers[TRACE_ID_HEADER] = response_trace_id or ""
    return response


# ── CORS 严格策略 ────────────────────────────────────────
# CORS 规范禁止 ``allow_origins=["*"]`` 与 ``allow_credentials=True`` 同时使用：
# 浏览器会拒绝响应 + 静默丢弃 cookie/Authorization。启动期直接失败避免无声错误。
_allow_origins = settings.cors_origin_list


def _check_cors_policy(s: Settings) -> None:
    """生产环境禁止通配 origins；开发环境允许但打 warning。"""
    if "*" in s.cors_origin_list:
        if s.is_prod:
            raise RuntimeError(
                "CORS 配置非法：生产环境 (env=prod) 不允许 allow_origins=['*']。"
                "请在环境变量 INTERVIEWOS_CORS_ORIGINS 中显式列出可信来源。"
            )
        logger.warning("CORS 允许 * 通配，仅 dev 环境；生产环境已强制要求显式来源")


_check_cors_policy(settings)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    # 显式列出方法，避免 `*` 在某些代理下被丢弃
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-Id", TRACE_ID_HEADER],
    expose_headers=[TRACE_ID_HEADER],
    max_age=600,
)

app.include_router(api_router)


# ── 统一错误响应形状 ────────────────────────────────────────
# {"error": {"code": str, "message": str, "trace_id": str}}
# 详情依然在顶层 ``detail`` 字段保留向前兼容（前端 ``ApiError.parse`` 兼容）。


def _envelope(*, code: str, message: str, status: int, request: Request) -> JSONResponse:
    payload = {
        "detail": message,  # legacy 兼容
        "error": {
            "code": code,
            "message": message,
            "trace_id": get_trace_id() or "",
        },
    }
    return JSONResponse(
        status_code=status,
        content=payload,
        headers={TRACE_ID_HEADER: get_trace_id() or ""},
    )


@app.exception_handler(RequestValidationError)
async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 校验错误统一包装。"""
    logger.info("请求校验失败: %s path=%s", exc.errors(), request.url.path)
    return _envelope(
        code="validation_error",
        message="请求参数校验失败",
        status=422,
        request=request,
    )


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """所有 ``raise HTTPException(...)`` 走这里统一封装，保持 envelope 一致。"""
    code = f"http_{exc.status_code}"
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return _envelope(
        code=code,
        message=detail,
        status=exc.status_code,
        request=request,
    )


@app.exception_handler(StarletteHTTPException)
async def _starlette_http_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Starlette 抛的 HTTPException（如 404/405）也走统一 envelope。"""
    code = f"http_{exc.status_code}"
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return _envelope(
        code=code,
        message=detail or "Not Found",
        status=exc.status_code,
        request=request,
    )


@app.exception_handler(UnsafeURLError)
async def _unsafe_url_handler(request: Request, exc: UnsafeURLError) -> JSONResponse:
    """统一处理 SSRF / URL 校验失败。"""
    logger.warning("URL 校验失败: %s path=%s", exc, request.url.path)
    return _envelope(
        code="unsafe_url",
        message=str(exc) or "URL 不合法",
        status=400,
        request=request,
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "interviewos-backend", "version": "1.0.0"}
