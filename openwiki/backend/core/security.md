---
type: backend
title: 应用层安全辅助
description: app/core/security.py 中 SSRF 防御、URL DNS 固定、文件名清洗、路径穿越校验与 API Key 脱敏。
tags: [security, ssrf, dns-pinning, path-traversal, redaction]
---

# 应用层安全辅助

`app/core/security.py` 集中所有安全相关工具函数，供路由、LLM 客户端、文件上传等复用。

## 关键符号

- `UnsafeURLError`
- `sanitize_filename(name)` / `assert_within_dir(path, root)`
- `is_safe_http_url(...)` / `assert_safe_http_url(...)` / `pin_safe_http_url(...)`
- `PinnedHttpTarget` / `PinnedHostTransport` / `make_pinned_async_client(...)`
- `is_localhost_family(host)` / `redact_api_key(value)`

## 文件名与路径安全

- `sanitize_filename`：仅保留 `[A-Za-z0-9._-]`，长度上限 120，防路径穿越与文件名注入。
- `assert_within_dir`：解析后必须落在 `root` 之下，否则抛 `ValueError`。

## SSRF 防御 (`is_safe_http_url`)

- 仅允许 `http/https` 协议；生产 `require_https=True` 拒绝 http。
- 解析域名全部 A/AAAA 记录，**任一** 命中禁止网段即拒绝。
- 默认禁止网段：loopback、私网、链路本地、CGNAT、metadata、multicast、reserved、IPv4-mapped IPv6。
- 非 dev 环境仅允许端口 80/443。
- dev 环境 `allow_local=True` 仅额外放行 loopback，私网仍拒绝。

## DNS 固定 (`pin_safe_http_url` + `PinnedHostTransport`)

```python
target = pin_safe_http_url(url)  # 单次解析 + 校验 + pin 首个安全 IP
transport = PinnedHostTransport(target.hostname, target.pinned_ip)
client = httpx.AsyncClient(transport=transport, follow_redirects=False)
```

- 禁止先 `is_safe_http_url` 再二次解析（TOCTOU 风险：校验公网、连接时变内网）。
- `PinnedHostTransport` 在出站时把 host 改写为 pin IP，但保留 `Host` 头与 SNI 为原始域名，实现证书校验。
- `follow_redirects=False`：跳转目标可能脱离 pin 主机。

## API Key 脱敏

`redact_api_key` 覆盖：

- OpenAI/Anthropic/Google/StepFun 等前缀 Key
- `Authorization: Bearer xxx` / `authorization=xxx`
- PEM 私钥块
- 启发式长度≥20、字母数字混合、无空格的 token

普通中文短语不会被误伤。

## 聚焦测试

- `tests/test_security.py`：SSRF 基础、端口、IPv6、URL 固定。
- `tests/test_security_extra.py`：DNS rebinding、multi-A 记录、metadata 网段。
- `tests/test_session_ssrf_pin.py`：LLM 客户端 SSRF pin 端到端。
- `tests/test_main.py::TestCORSStrictness`：CORS 生产门禁。

## 相关页面

- [核心加密](./secrets.md)
- [限流](./ratelimit.md)
- [会话认证](./session-auth.md)
- [安全总览](../../security.md)
