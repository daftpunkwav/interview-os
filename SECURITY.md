# Security Policy

## 已支持的版本

| 版本 | 是否支持 |
|---|---|
| `main` 分支 | ✅ |
| 最近 6 个月内的 `feat/*` 分支 | ✅（按 PR 合入） |
| 其他分支 | ❌ 请先 rebase / cherry-pick |

## 报告漏洞

- 邮箱：`daftpunk.wav@outlook.com`（PGP 不强制，邮件即可）；
- 标题请以 `[SECURITY]` 开头；
- 我们承诺 72 小时内首次响应，并在 30 天内给出修复计划（高危 7 天内）。
- 请**勿**在公开 issue 描述具体利用细节。

## 已知安全声明

### 1. 没有内建多用户登录

当前定位为「本地优先、单用户」工具。`profile_id = 1` 是固定常量，
**没有**用户级 JWT。**请勿在公网直接暴露端口**。

默认绑定 `127.0.0.1`；若需局域网访问请显式设置 `HOST=0.0.0.0`，并自行做好网络隔离。

面试 / 辅导会话使用 **capability token**：

- 默认经 **HttpOnly Cookie** 下发（`interviewos_iv_{id}` / `interviewos_prep_{id}`，
  `SameSite=Lax`；HTTPS 时加 `Secure`）；
- 兼容 Header `X-Interview-Token`（测试与迁移）；
- WS 优先读 Cookie，其次子协议 / query。

仅 Cookie 鉴权的可变请求会校验 `Origin`/`Referer` 落在 `CORS_ORIGINS`
（缓解 CSRF）。档案 / 简历 / 设置 / 成长洞察等管理 API 另加 **local-only**
（仅 loopback；测试模式放行）。

如需多用户鉴权，请参考 `CONTRIBUTING.md` 第 6 节，并阅读 `docs/ARCHITECTURE.md §5`。

### 2. .env 中的 API Key

- `backend/.env` / `frontend/.env.local` 已 `.gitignore`，**不要**主动 `git add`；
- `backend/.env.example` 仅放占位符 `sk-your-key-here`；
- 思考 / ASR / TTS 密钥在设置页分列存储并 at-rest 加密；思考 LLM 的 Key **不得**当作 ASR Key；
- 历史记录中如发现真 Key，请：
  1. **立刻**在 LLM 服务商控制台轮换 Key；
  2. 用 `git filter-repo` 或 `bfg` 从历史中清除；
  3. 在 PR 中附带「清理由我完成」备注。

### 3. WebSocket 能力令牌

WS 端点 `ws://.../api/v1/ws/interview/{id}` **必须**携带会话 `access_token`：

- 推荐：浏览器自动携带 HttpOnly Cookie（前端直连后端 host，与 REST 一致）；
- 兼容：`Sec-WebSocket-Protocol: interviewos.<token>`；query `?token=`。

鉴权失败不会占用会话连接租约（先鉴权再 claim），防止未授权踢人。

### 4. 限流策略

按 IP 滑窗（默认 60 req/min，无用户认证时按 IP）。
仅当 `request.client.host` 落入可信代理 CIDR
（`TRUSTED_PROXY_CIDRS` / `INTERVIEWOS_TRUSTED_PROXY_CIDRS`；**默认仅 loopback**）
时才读取 `X-Forwarded-For`，避免任意客户端伪造 IP 绕过限流。
多 worker 部署需切 Redis（当前为进程内）。
见 `backend/app/core/ratelimit.py`。

### 5. ENV / ALLOW_LOCAL_LLM 决定 SSRF 与本机模式

环境变量同时接受无前缀与 `INTERVIEWOS_` 前缀：

| 含义 | 无前缀 | 带前缀 |
|---|---|---|
| 运行环境 | `ENV` | `INTERVIEWOS_ENV` |
| 允许本地 LLM | `ALLOW_LOCAL_LLM` | `INTERVIEWOS_ALLOW_LOCAL_LLM` |
| CORS 来源 | `CORS_ORIGINS` | `INTERVIEWOS_CORS_ORIGINS` |
| 可信代理 | `TRUSTED_PROXY_CIDRS` | `INTERVIEWOS_TRUSTED_PROXY_CIDRS` |

- `ENV=dev`（默认）在 `ALLOW_LOCAL_LLM=true` 时可指向 loopback LLM；私网 / metadata 仍拒。
- `ENV=prod` 强制 **https** 出站（`require_https`）；loopback / 私网一律拒绝，且禁止 `allow_local_llm`。

## 缓解清单（已实现的）

| 攻击面 | 缓解 |
|---|---|
| 任意文件上传 | 10 MB 上限 + 魔数嗅探 + 路径越界校验 + 解析页数/ZIP 上限 |
| SSRF（api_base / StepFun） | `is_safe_http_url` + DNS pin 出站；PROD 强制 https |
| 会话劫持（整数 ID） | HttpOnly Cookie + Header 兼容；cookie-only 可变请求校验 Origin |
| 管理 API 暴露 | settings/profile/resume/growth：`require_local_peer` |
| 任意 SQL 注入 | SQLAlchemy ORM 全部参数化；无原生字符串拼接 |
| 任意代码注入 / 反序列化 | 未引入 `pickle`/`yaml.load`；Pydantic 强校验 |
| PII / Key 泄漏到日志与 500 响应 | `RedactFilter`；未处理异常对外通用文案 |
| API Key at-rest 明文 | AES-256-GCM `enc:v2:`；生产须设 `INTERVIEWOS_SECRET_KEY` |
| Trace 串联 | `X-Trace-Id` 中间件 + 结构化 JSON 日志 |
| WebSocket DoS / 僵尸连接 | 心跳 ping/pong；audio_buffer 上限 5 MB；先鉴权再租约；后台任务独立 Session |
| CORS 滥用 | 显式 methods/headers；prod 禁 `*`；credentials 开启 |
| 上下文窗口 token 溢出 | 30% 触发启发式压缩 |
| LLM 4xx/5xx 不当重试 | 4xx 直接 raise；5xx/429 指数退避最多 3 次 |

## 已知可改进项

- 引入用户级 `JWT` + Refresh Token，绑定 session ↔ user；
- 生产依赖 lockfile / hash pin（当前 `requirements.txt` 仅下限）；
- 服务端 Sentry；
- 上传文件走对象存储 + 病毒扫描（ClamAV）；
- CSP 进一步去掉 `unsafe-eval`（受 TalkingHead/Three 约束）。

## License 下的责任边界

MIT 许可下，作者对任何因不当部署造成的损失不承担责任。
**生产部署者**应自行完成：HTTPS 终止、密钥管理、备份、监控、限流加固。
