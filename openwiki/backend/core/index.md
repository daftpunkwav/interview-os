# 文件

- [结构化日志与 Trace 追踪](logging.md) - app/core/logging.py 中 JSON 结构化日志、API Key 脱敏、trace_id ContextVar 与请求串联。
- [数据库列迁移与 Alembic 版本戳](migrate.md) - app/core/migrate.py 中幂等列补全迁移、MIGRATIONS 表与 Alembic head 版本戳。
- [其他核心工具](other.md) - app/core 中 file_lock、local_only、options_data、prompts 等辅助模块的职责。
- [进程内限流](ratelimit.md) - app/core/ratelimit.py 中基于滑动窗口的内存限流、可信代理 CIDR 与按 client_id 限流。
- [API Key 静态加密](secrets.md) - app/core/secrets.py 中 AES-256-GCM 加密、enc:v2 格式、主密钥派生与旧版格式拒绝。
- [应用层安全辅助](security.md) - app/core/security.py 中 SSRF 防御、URL DNS 固定、文件名清洗、路径穿越校验与 API Key 脱敏。
- [会话能力令牌认证](session-auth.md) - app/core/session_auth.py 中 InterviewSession / PrepSession 的能力令牌、Cookie/Header/query 提取与 CSRF 缓解。
