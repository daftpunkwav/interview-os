---
type: backend
title: 用户档案端点
description: app/api/profile.py 中 UserProfile 的自动创建、读取与更新。
tags: [api, profile, user]
---

# 用户档案端点

## 路径

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/profile` | 读取当前档案，不存在时自动创建 id=1 |
| PUT | `/api/v1/profile` | 更新档案 |

## 自动创建

`_get_or_create_profile` 在首次 GET 时创建默认档案，姓名为 `求职者`，ID 为 1。这是本地单机单用户设计的一部分，未实现多用户隔离。

## 字段范围

`UserProfileUpdate` 包含约 30 个字段，覆盖：

- 基础信息：姓名、性别、身份、学校、专业、毕业年份
- 求职信息：岗位方向、工作年限、当前公司、期望薪资、目标岗位
- 扩展信息：GitHub 用户名、作品集、LinkedIn、城市、语言、职业亮点、远程偏好、到岗周期
- 面试常用：教育水平、期望城市、邮箱、电话、证书、英语水平、代表项目、优势、劣势

## 技术领域列表

`tech_domains` 在前端以 list 形式展示，在模型中序列化为 JSON 字符串。模型提供 `tech_domains_list` / `set_tech_domains` 辅助方法。

## 相关页面

- [数据模型](../models.md)
- [Pydantic 契约](../schemas.md)
- [前端 profile 页](../../frontend/pages/profile.md)
