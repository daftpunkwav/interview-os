---
type: backend
title: BYOK LLM 客户端
description: app/services/llm/client.py 中面向 OpenAI Chat Completions 的 LLMClient，支持 chat、流式、JSON、embeddings、重试与 DNS 固定传输。
tags: [llm, byok, openai, retry, dns-pinning, embeddings]
---

# BYOK LLM 客户端

`LLMClient` 是后端统一的 LLM 调用入口，封装 OpenAI 兼容协议的 chat、stream、JSON 提取、embeddings 与重试逻辑。所有出站请求都经过 SSRF 校验与 DNS 固定。

## 关键符号

- `class LLMClient`
- `from_db(db)`：从 `LLMSettings` id=1 读取并解密 API Key，回退到环境变量
- `chat(...)` → `str`
- `chat_message(...)` → 完整 message dict（含 `tool_calls`）
- `chat_stream(...)` → `AsyncIterator[str]`，支持 reasoning 内容包装为 `<think>`
- `chat_json(...)` → `dict[str, Any]`，容错剥离 Markdown 围栏与思考块
- `embed(texts, model=None)` → `list[list[float]]`
- `test_connection()` → `(bool, str)`
- `_retry_request(coro_factory, max_retries=3, backoff=0.5)`：指数退避，4xx 不重试，5xx/429/网络错误最多 3 次

## 配置来源

`from_db`：

1. 读取 `LLMSettings` id=1 的字段。
2. 使用 `decrypt_secret` 解密 `api_key`；失败则置空串。
3. 若数据库无记录或字段为空，回退到 `app.config.get_settings()` 的环境变量（如 `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`）。

## 出站安全

每次请求都调用：

```python
is_safe_http_url(self.api_base, allow_local=_is_local_allowed(), require_https=_require_https())
```

生产环境强制 HTTPS；dev 可允许 loopback（若 `allow_local_llm=True`）。然后使用 `make_pinned_async_client` 创建固定 IP 的 `httpx.AsyncClient`：

- `chat` / `chat_json` 超时 180s（深度评价/JSON 可能较慢）。
- `chat_message`（工具调用）超时 90s。
- `chat_stream` 超时 120s。
- `embed` 超时 60s。

`make_pinned_async_client` 内部使用 `PinnedHostTransport`：解析一次域名后固定 IP 传输，配合 `is_safe_http_url` 的端口/协议校验，防 DNS rebinding。

## 重试策略

`_retry_request`：

- 4xx 直接抛出（配置/权限错误）。
- 429 / 5xx / 网络错误（`ConnectError`, `ReadTimeout`, `WriteError`, `RemoteProtocolError`）指数退避，最多 3 次，间隔 `0.5 * (2 ** attempt)`。
- 流式响应在重试前 `aclose()`，防止连接泄漏。
- `chat_stream` 一旦已开始 yield token，则不再重试，避免 TTS 收到重复片段。

## 响应提取

`_extract_message_text` 处理：

- `content` 字符串（剥离 emoji）
- `content` 为列表（多段 text）
- `reasoning_content` / `reasoning` / `output_text` 字段
- 返回非空字符串，否则空串

## 流式处理

`chat_stream`：

- 解析 SSE `data:` 行。
- 提取 `delta.content` 和 `delta.reasoning_content/reasoning`。
- reasoning 内容包装为 `<think>...</think>` 标签，前端可折叠展示。
- 所有 token 剥离 emoji。

## JSON 提取

`chat_json`：

1. 使用 `response_format={"type": "json_object"}` 请求。
2. 若返回空，回退到无 `response_format` 并追加 user message 要求纯 JSON。
3. 剥离 `<think>`、`<thinking>`、Markdown ```json 围栏。
4. 截取首个 `{...}` 对象后 `json.loads`。
5. 失败时抛出带上下文的 `ValueError`。

## Embeddings

`embed` 调用 `POST /embeddings`：

- 优先使用 `LLM_EMBEDDINGS_BASE/KEY/MODEL`；任一缺失则回退到 chat 配置。
- 对 embeddings 的 key 同样做 `decrypt_secret`；解密失败 fail-closed，不回退明文。
- 用于本地 Chroma RAG 向量索引与检索。

## 聚焦测试

- `tests/test_llm_client_retry.py`：重试路径、4xx 不重试、429 退避。
- `tests/test_runner.py`：FakeLLMClient 注入与完整流程。
- `tests/test_session_ssrf_pin.py`：SSRF 与 DNS pin 端到端。

## 相关页面

- [安全辅助](../core/security.md)
- [核心加密](../core/secrets.md)
- [应用配置](../config.md)
- [RAG 本地后端](rag/local-backend.md)
- [面试 Runner](interview/runner.md)
