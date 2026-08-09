---
type: security
title: 安全模型与缓解清单
description: InterviewOS 安全威胁模型、已实施缓解措施与未实现项的安全边界。
tags: [security, threat-model, byok, ssrf, encryption, cors, rate-limit]
---

# 安全模型与缓解清单

InterviewOS 是本地优先、BYOK 的 AI 面试系统。安全设计围绕“用户自带密钥、本地 SQLite、无注册登录”展开。

## 威胁模型假设

- 运行在同一台机器上的前后端被视为同一信任边界（默认 loopback）。
- 用户负责 API Key 的供应链安全（不泄漏给第三方）。
- 对外暴露时必须在反向代理（Nginx/ALB）终止 TLS，不能直接将 Uvicorn 暴露到公网。
- 多用户隔离、账号体系、等待叫号大厅等不在当前范围。

## 已实施缓解

| 风险 | 实现 | 文件 |
|---|---|---|
| API Key 明文入库 | AES-256-GCM 静态加密；`enc:v2` 格式；旧格式显式拒绝 | [core/secrets.md](./backend/core/secrets.md) |
| SSRF / DNS 重绑定 | 多 A 记录遍历、IP 网段黑名单、端口白名单、DNS pin 固定 | [core/security.md](./backend/core/security.md) |
| 文件上传路径穿越 | 文件名清洗、魔数嗅探、10 MB 上限、assert_within_dir | [core/security.md](./backend/core/security.md), [api/resume.md](./backend/api/resume.md) |
| 限流绕过 | 仅信任代理 CIDR 时采纳 X-Forwarded-For；滑动窗口 | [core/ratelimit.md](./backend/core/ratelimit.md) |
| CORS 滥用 | 生产启动拒绝 `*` + credentials | [backend/main.md](./backend/main.md) |
| WebSocket 拒绝服务 | 心跳 30s/3miss、音频缓冲 5MB 上限、单连接互斥 | [realtime/connection-lifecycle.md](./backend/realtime/connection-lifecycle.md) |
| 日志泄漏 API Key | RedactFilter 覆盖 msg/args/exc_text | [core/logging.md](./backend/core/logging.md) |
| 会话枚举劫持 | 能力令牌 Cookie/Header；生产禁用 query token | [core/session-auth.md](./backend/core/session-auth.md) |
| 错误信息不一致 | 统一 envelope `{error:{code,message,trace_id}}` | [backend/main.md](./backend/main.md) |
| 报告 SSE 双倍计费 | 单次 LLM 生成并持久化 | [services/interview/report.md](./backend/services/interview/report.md) |

## 生产部署检查清单

- [ ] 设置 `INTERVIEWOS_SECRET_KEY`（≥16 字节，base64 或明文）。
- [ ] 设置 `ENV=prod` 并显式配置 `CORS_ORIGINS`（禁用 `*`）。
- [ ] 不设置 `ALLOW_LOCAL_LLM=1` / `INTERVIEWOS_ALLOW_LOCAL_LLM=1`。
- [ ] 配置 `TRUSTED_PROXY_CIDRS` 指向反向代理真实 CIDR。
- [ ] 配置 `COOKIE_SECURE=true` 或确保反向代理转发 `X-Forwarded-Proto=https`。
- [ ] 将 Uvicorn 绑定到 `127.0.0.1`，由前置 Nginx/ALB 终止 HTTPS。
- [ ] 不将 `data/.secret.key` 或 `.env` 提交到版本控制。

## 未实现安全项

- KMS 托管 master key（当前依赖环境变量或文件）。
- 全文日志加密。
- 跨 worker 集中限流（Redis）。
- 多用户隔离与细粒度授权。

## 相关页面

- [核心安全](./backend/core/security.md)
- [核心加密](./backend/core/secrets.md)
- [限流](./backend/core/ratelimit.md)
- [会话认证](./backend/core/session-auth.md)
- [后端入口](./backend/main.md)
