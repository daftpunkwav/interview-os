# 文件

- [应用配置 Settings](config.md) - app/config.py 中全局环境变量、交叉验证、计算属性与 env 别名设计。
- [全局协议常量](constants.md) - app/core/constants.py 中前后端共享的枚举、阶段 ID、事件类型、阈值与速率限制。
- [数据库与会话管理](database.md) - app/database.py 的 SQLAlchemy 引擎懒加载、双检锁、SessionLocal 工厂与 get_db 依赖。
- [集成/会话测试（根 test 目录）](integration-tests.md) - /test/ 目录中以端到端会话为中心的回归测试：认证、音频缓冲、HTTP 面试、限流、报告流、TTS flush、WS 互斥。
- [FastAPI 应用入口](main.md) - app/main.py  lifespan、CORS 严格策略、trace_id 中间件、统一错误响应信封与生产门禁。
- [SQLAlchemy 数据模型](models.md) - app/models/__init__.py 中 UserProfile、LLMSettings、Resume、InterviewSession、PrepSession、GrowthRecord 的字段与不变式。
- [Pydantic 请求/响应契约](schemas.md) - app/schemas/__init__.py 中前后端共享的 DTO、字面量枚举、错误信封与长度限制。
- [后端测试体系](testing.md) - backend/tests/ 目录中的 pytest 测试布局、fixtures、fakes 与 FakeLLMClient 使用模式。

# 目录

- [agents](agents/)
- [api](api/)
- [core](core/)
- [interview](interview/)
- [rag](rag/)
- [realtime](realtime/)
- [services](services/)
