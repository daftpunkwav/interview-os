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

### 1. 没有内建认证 / 多用户隔离

当前定位为"本地优先、单用户"工具。`profile_id = 1` 是固定常量，所有 `/api/*` 与
`/api/v1/ws/interview/*` 都没有用户鉴权。**请勿在公网直接暴露端口**。

如需开启鉴权，请参考 `CONTRIBUTING.md` 第 6 节，并在引入前后同步阅读 `docs/ARCHITECTURE.md §5`。

### 2. .env 中的 API Key

- `backend/.env` 已 `.gitignore`，**不要**主动 `git add`；
- `backend/.env.example` 仅放占位符 `sk-your-key-here`；
- 历史记录中如发现真 Key，请：
  1. **立刻**在 LLM 服务商控制台轮换 Key；
  2. 用 `git filter-repo` 或 `bfg` 从历史中清除；
  3. 在 PR 中附带"清理由我完成"备注。

### 3. WebSocket 端点默认无 token

WS 端点 `ws://.../api/v1/ws/interview/{id}` 当前按惯例"任意客户端连到任意 session 视为合法"。
对应防御见 `docs/ARCHITECTURE.md §5`。

### 4. 限流策略

按 IP 滑窗（默认 60 req/min，无认证时按 IP）。
见 `backend/app/core/ratelimit.py`；如需把窗口/上限做成环境变量控制，可作为下一步工作。

## 缓解清单（已实现的）

| 攻击面 | 缓解 |
|---|---|
| 任意文件上传 | 10 MB 上限 + 魔数嗅探 + 路径越界校验 + `secure_filename` 等价清洗 |
| SSRF（api_base） | `is_safe_http_url` 拒绝 loopback/私网；PROD 强制 https 公网 |
| 任意 SQL 注入 | SQLAlchemy 2.0 ORM 全部参数化；无原生字符串拼接 |
| 任意代码注入 / 反序列化 | 未引入 `pickle`/`yaml.load`；Pydantic 强校验所有 LLM 返回 |
| PII 泄漏到日志 | `RedactFilter` 自动遮蔽；`runner.py` 追问信号日志仅记长度 |
| API Key at-rest 明文 | `app/core/secrets.py` HMAC+XOR 流加密；首推生产环境设置 `INTERVIEWOS_SECRET_KEY` |
| Trace 串联 | `X-Trace-Id` 中间件 + 结构化 JSON 日志 |
| CORS 滥用 | 仅 `GET/POST/PUT/DELETE/OPTIONS`；`*` 配置会启动 warn |
| DoS 大量会话 | SQLite 单机 + 无鉴权下，OS 层做速率限制即可；多人部署需切 Postgres |

## 已知可改进项

- 引入 `JWT` + Refresh Token，绑定 session ↔ user；
- WS 协议加上 `Sec-WebSocket-Protocol: bearer.<jwt>`；
- 服务端 Sentry；
- 同源 / CSRF 防御（cookie 时）；
- 上传文件走对象存储 + 病毒扫描（ClamAV）。

## License 下的责任边界

MIT 许可下，作者对任何因不当部署造成的损失不承担责任。
**生产部署者**应自行完成：HTTPS 终止、密钥管理、备份、监控、限流加固。
