---
type: backend
title: FastAPI 应用入口
description: app/main.py  lifespan、CORS 严格策略、trace_id 中间件、统一错误响应信封与生产门禁。
tags: [fastapi, entrypoint, cors, trace, error-handling]
---

# FastAPI 应用入口

`app/main.py` 是 InterviewOS 后端的单一 FastAPI 入口，集中处理跨切面关注点：启动生命周期、CORS 严格策略、请求 trace_id 注入、统一错误响应。

## 关键符号

- `app = FastAPI(title="InterviewOS", version="1.0.0", lifespan=lifespan)`
- `lifespan(app)` — 启动时建表、迁移、种子、RAG 索引；关闭时释放引擎。
- `trace_middleware` — 注入/校验 `X-Request-Id` / `X-Trace-Id`。
- 异常处理器：`RequestValidationError`, `HTTPException`, `StarletteHTTPException`, `UnsafeURLError`, 兜底 `Exception`。
- `/health` 健康探针。

## 启动生命周期 (`lifespan`)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_bootstrap_db_and_seed)   # SQLite/迁移/种子走线程池
    await _ensure_rag_index(db)                       # 异步构建企业 KB 索引，失败不阻断
    yield
    if not (测试模式 and 内存 SQLite):
        await asyncio.to_thread(_shutdown_engine)   # dispose 引擎
```

所有同步 IO（SQLite、文件系统、本地 RAG 索引）统一通过 `asyncio.to_thread` 执行，避免阻塞事件循环导致 WebSocket 心跳抖动。详见 [database.md](./database.md) 与 [migrate.md](./core/migrate.md)。

## CORS 严格策略

```python
if "*" in s.cors_origin_list and s.is_prod:
    raise RuntimeError("生产环境不允许 allow_origins=['*']")
```

- 同时启用 `allow_origins=["*"]` 与 `allow_credentials=True` 会导致浏览器静默丢弃 cookie/Authorization，因此生产启动直接失败。
- 显式允许 `PATCH/HEAD`；暴露 `X-Trace-Id`。
- 与前端请求拦截器 `src/lib/api.ts` 需要同步修改。

## Trace_id 中间件

- 白名单校验 `X-Request-Id`：`^[A-Za-z0-9_\-]{8,64}$`；不合法则服务端重新生成，防止日志注入（CRLF/控制字符）。
- `ContextVar` token 在 `finally` 中 `reset_trace_id`，避免跨请求污染。
- 异常路径也会通过响应头返回 `X-Trace-Id`。

## 统一错误响应信封

所有错误返回统一形状：

```json
{
  "detail": "...",
  "error": {
    "code": "validation_error",
    "message": "...",
    "trace_id": "..."
  }
}
```

- `detail` 保留旧兼容字段。
- `StarletteHTTPException`（404/405）也走同一 handler，不再暴露 FastAPI 原生 HTML 错误页。
- 未捕获异常对外仅返回通用文案，细节写入日志。

## 生产门禁

- 必须显式设置 `INTERVIEWOS_SECRET_KEY`（≥16 字节），否则启动失败。防止数据库迁移后自动生成的 `data/.secret.key` 无法解密旧 API Key 密文。
- 验证入口：`app.core.secrets.validate_master_key_env`。

## 相关页面

- [配置](./config.md)
- [数据库](./database.md)
- [核心安全](./core/security.md)
- [核心加密](./core/secrets.md)
- [日志](./core/logging.md)
