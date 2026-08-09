---
type: frontend
title: 档案页面
description: src/app/profile/page.tsx 中用户档案表单、必填校验、完成度与预览卡片。
tags: [frontend, page, profile, form]
---

# 档案页面

`src/app/profile/page.tsx` 提供多字段用户档案编辑表单，用于面试前构建候选人画像。

## 关键符号

- `ProfilePage`
- `REQUIRED_KEYS`：必填字段集合
- `OPTIONAL_COMPLETION_KEYS`：参与完成度计算的选填字段
- `Section`：表单分组
- `Field`：输入字段封装
- `PreviewRow`：预览行

## 字段分组

- 基础信息：姓名、性别、身份、学校、专业、毕业年份
- 求职信息：岗位方向、工作年限、当前公司、期望薪资、目标岗位
- 扩展信息：GitHub 用户名、作品集、LinkedIn、城市、语言、职业亮点、远程偏好、到岗周期
- 面试常用：教育水平、期望城市、邮箱、电话、证书、英语水平、代表项目、优势、劣势
- 技术领域：多选标签 `tech_domains`

## 完成度

根据 `REQUIRED_KEYS` 和 `OPTIONAL_COMPLETION_KEYS` 的填写情况计算百分比，帮助用户了解档案完整度。

## 预览卡片

表单右侧（桌面端）或底部（移动端）实时显示当前档案的摘要预览。

## 数据流

1. 加载 `api.getProfile()`，后端自动创建 id=1 的默认档案。
2. 用户编辑表单。
3. 点击保存调用 `api.updateProfile(profile)`。
4. 成功后显示 toast 提示。

## 相关页面

- [后端 API profile 端点](../../backend/api/profile.md)
- [后端数据模型](../../backend/models.md)
