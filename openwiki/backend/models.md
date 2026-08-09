---
type: backend
title: SQLAlchemy 数据模型
description: app/models/__init__.py 中 UserProfile、LLMSettings、Resume、InterviewSession、PrepSession、GrowthRecord 的字段与不变式。
tags: [models, sqlalchemy, orm, schema]
---

# 数据模型

`app/models/__init__.py` 定义全部 SQLite 表结构。JSON 语义字段以字符串形式存储，由调用方序列化/反序列化。

## 模型清单

| 模型 | 表名 | 核心职责 |
|---|---|---|
| `UserProfile` | `user_profiles` | 本地单用户档案（`id=1`） |
| `LLMSettings` | `llm_settings` | BYOK 三处理器配置（`id=1`） |
| `Resume` | `resumes` | 上传简历、解析结果、AI 评分 |
| `InterviewSession` | `interview_sessions` | 面试会话状态、消息、能力令牌 |
| `PrepSession` | `prep_sessions` | 准备辅导会话 |
| `GrowthRecord` | `growth_records` | 每场面试的成长记录 |

## 重要字段与约束

- `UserProfile.id` / `LLMSettings.id` / 默认 `profile_id` 均为 1，体现本地单机单用户定位。
- `InterviewSession.access_token` 与 `PrepSession.access_token` 仅存在于数据库，schema 响应中不返回。
- `InterviewSession.agent_state` 与 `messages` 是 JSON 文本，由 [InterviewAgent](services/interview/agent.md) 负责加载/保存。
- `Resume.parsed_profile` 存储 `CandidateProfile` 序列化结果；`analysis` 存储 `ResumeAnalysis` 结果。

## 扩展字段示例

`UserProfile` 包含基础信息、教育/求职、GitHub 用户名、作品集、LinkedIn、城市、语言、职业亮点、远程偏好、到岗周期等。新增字段后需在 `app/core/migrate.py` 的 `MIGRATIONS` 中补 `ALTER TABLE`。

## JSON 辅助方法

```python
@property
def tech_domains_list(self) -> list[str]:
    try:
        return json.loads(self.tech_domains)
    except json.JSONDecodeError:
        return []
```

## 相关页面

- [数据库](./database.md)
- [Pydantic 契约](./schemas.md)
- [迁移](./core/migrate.md)
- [面试 Agent](services/interview/agent.md)
