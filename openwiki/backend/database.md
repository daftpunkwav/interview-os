---
type: backend
title: 数据库与会话管理
description: app/database.py 的 SQLAlchemy 引擎懒加载、双检锁、SessionLocal 工厂与 get_db 依赖。
tags: [database, sqlalchemy, sqlite, session]
---

# 数据库与会话管理

`app/database.py` 负责 SQLAlchemy 引擎与 `SessionLocal` 的惰性创建，并暴露 FastAPI 依赖 `get_db()`。

## 关键符号

- `Base = DeclarativeBase()`
- `get_engine()` — 双检锁惰性创建 `Engine`
- `get_session_factory()` — 双检锁惰性创建 `sessionmaker`
- `reset_engine()` — 测试用清空缓存
- `get_db()` — FastAPI `Depends` 生成器
- `init_db()` — 创建所有表，确保 SQLite 目录存在

## 引擎创建策略

```python
if url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    if url.endswith(":memory:") or url == "sqlite://":
        pool_kwargs["poolclass"] = StaticPool
```

- 文件 SQLite 使用默认连接池；`check_same_thread=False` 配合单进程 + 线程安全访问。
- `:memory:` SQLite 使用 `StaticPool`，确保同一进程内多个连接共享同一份内存库，测试必需。

## 双检锁设计

避免测试在 `setenv` 之前意外触发首次实例化，也避免多线程同时 `reset_engine` 把仍在使用的引擎 dispose 掉。

## 测试影响

- 测试中通过环境变量切换 `database_url` 后，需调用 `reset_engine()` 使新配置生效。
- `app/main.py` 的 `lifespan` 在测试模式 + 内存 SQLite 下跳过 `engine.dispose()`，防止 StaticPool 在进程退出前被回收导致测试失败。

## 迁移到 PostgreSQL/MySQL

切换时需要在 `get_engine()` 中补充 `pool_recycle` / `pool_pre_ping` 等连接池参数。当前 SQLite 不需要。

## 相关页面

- [模型](./models.md)
- [迁移](./core/migrate.md)
- [后端入口](./main.md)
