---
type: backend
title: 数据库列迁移与 Alembic 版本戳
description: app/core/migrate.py 中幂等列补全迁移、MIGRATIONS 表与 Alembic head 版本戳。
tags: [migration, sqlite, alembic, schema]
---

# 数据库列迁移与 Alembic 版本戳

`app/core/migrate.py` 负责 SQLite 的列级幂等迁移与 `alembic_version` 表版本戳管理。`backend/alembic/` 目录保留 Alembic revision 链，但当前启动迁移走 `MIGRATIONS` 字典。

## 关键符号

- `MIGRATIONS: dict[str, list[str]]` — table → ALTER TABLE 语句列表
- `apply_column_migrations(engine)` — 幂等补齐缺失列
- `stamp_alembic_head(engine, revision)` — 确保 `alembic_version` 指向当前 head
- `run_migrations(engine)` — 启动入口：列补全 + 版本戳
- `ALEMBIC_HEAD_REVISION = "20260803_0001"`

## 幂等列迁移

```python
for table, statements in MIGRATIONS.items():
    existing_cols = {c["name"] for c in inspector.get_columns(table)}
    to_apply = [s for s in statements if col not in existing_cols]
    with engine.begin() as conn:
        for stmt in to_apply:
            conn.execute(text(stmt))
```

- 仅对已有表补列；新表由 `Base.metadata.create_all()` 在 `init_db()` 中创建。
- 事务包裹，失败自动回滚。

## 新增字段流程

1. 在 `app/models/__init__.py` 添加列定义。
2. 在 `app/core/migrate.py` 的 `MIGRATIONS[table]` 增加对应 `ALTER TABLE ... ADD COLUMN ...`。
3. 在 `app/schemas/__init__.py` 同步请求/响应模型。
4. 在相关 API 路由中处理新字段。
5. 补充测试（如 `tests/test_migrate.py`）。

## Alembic 集成

`run_migrations()` 在列补全后调用 `stamp_alembic_head`，将 `alembic_version` 表设置为当前 head，便于后续完全切换为 Alembic revision 链。

## 聚焦测试

- `tests/test_migrate.py`：迁移应用、幂等、Alembic 版本戳。

## 相关页面

- [数据库](../database.md)
- [模型](../models.md)
- [后端入口](../main.md)
