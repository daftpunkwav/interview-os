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

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.config import Settings, get_settings
from app.core.logging import (
    configure_logging,
    get_trace_id,
    reset_trace_id,
    set_trace_id,
)
from app.core.error_handlers import (
    on_http_exception,
    on_request_validation,
    on_starlette_http_exception,
    on_unsafe_url,
    on_unhandled_exception,
)
from app.core.constants import TRACE_ID_HEADER
from app.core.migrate import run_migrations
from app.core.security import UnsafeURLError
from app.database import engine, init_db, SessionLocal
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
    # 企业知识库索引（异步，失败不阻断启动）
    rag_db = SessionLocal()
    try:
        await _ensure_rag_index(rag_db)
    finally:
        try:
            rag_db.close()
        except Exception:
            pass
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
                "请在环境变量 CORS_ORIGINS（或 INTERVIEWOS_CORS_ORIGINS）中显式列出可信来源。"
            )
        logger.warning("CORS 允许 * 通配，仅 dev 环境；生产环境已强制要求显式来源")


_check_cors_policy(settings)


# ── master key 生产门禁 ────────────────────────────────────────
# prod 部署必须显式提供 INTERVIEWOS_SECRET_KEY；否则密钥会静默落盘到
# data/.secret.key，数据库从其他机器迁移后全部 API Key 密文将无法解密。
def _check_secret_key_policy(s: Settings) -> None:
    if s.is_prod:
        from app.core.secrets import validate_master_key_env

        status = validate_master_key_env()
        if status != "ok":
            raise RuntimeError(
                "生产环境 (env=prod) 必须设置 INTERVIEWOS_SECRET_KEY（≥16 字节）；"
                "禁止依赖自动生成的 data/.secret.key，否则数据库迁移后密文不可解密。"
            )


_check_secret_key_policy(settings)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    # 显式列出方法，避免 `*` 在某些代理下被丢弃
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Request-Id",
        TRACE_ID_HEADER,
        "X-Interview-Token",
    ],
    expose_headers=[TRACE_ID_HEADER],
    max_age=600,
)

app.include_router(api_router)


# ── 统一错误响应形状 ────────────────────────────────────────
# {"error": {"code": str, "message": str, "trace_id": str}}
# 详情依然在顶层 ``detail`` 字段保留向前兼容（前端 ``ApiError.parse`` 兼容）。


# 异常 handler 统一收口在 app.core.error_handlers（含 envelope 构造 + trace_id/headers 透传）
# fastapi 0.139+ 对 add_exception_handler 回调类型收紧为 (Request, Exception)，
# handler 实参类型使用具体异常子类属合法的窄化实现，需忽略类型逆变告警
app.add_exception_handler(RequestValidationError, on_request_validation)  # type: ignore[arg-type]
app.add_exception_handler(HTTPException, on_http_exception)  # type: ignore[arg-type]
app.add_exception_handler(StarletteHTTPException, on_starlette_http_exception)  # type: ignore[arg-type]
app.add_exception_handler(UnsafeURLError, on_unsafe_url)  # type: ignore[arg-type]
app.add_exception_handler(Exception, on_unhandled_exception)


@app.get("/health")
def health():
    return {"status": "ok", "service": "interviewos-backend", "version": "1.0.0"}


if __name__ == "__main__":
    # 无参启动入口：`python -m app.main` 自动读取 .env 的 HOST / PORT（默认 127.0.0.1:8081）。
    # 直接传 app 对象而非 "app.main:app" 字符串，避免 importlib 对 app.main 的二次导入；
    # 开发热重载请改用 `uvicorn app.main:app --reload --port 8081`。
    uvicorn.run(app, host=settings.host, port=settings.port)
