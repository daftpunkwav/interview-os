---
type: frontend
title: 简历页面
description: src/app/resume/page.tsx 中上传简历、列表、激活、删除、AI 多维度分析与展示。
tags: [frontend, page, resume, upload, analysis]
---

# 简历页面

`src/app/resume/page.tsx` 是简历管理核心页面，支持上传、激活、删除、AI 分析，并展示深度分析结果。

## 关键符号

- `ResumePage`
- `AnalysisPanel`：分析结果面板
- `EvalRichText` / `EvalRichPart`：富文本评价展示
- `EvalNumberedStack`：带编号评价栈
- `RewriteGallery`：改写示例画廊
- `EvalList`：列表式评价

## 功能

### 上传

- 支持 PDF、DOCX、DOC、MD、TXT。
- 10 MB 上限。
- 调用 `api.uploadResume(file)`。
- 后端做魔数嗅探与路径校验。

### 列表

- 显示所有上传简历，含文件名、类型、上传时间、是否激活。
- 激活按钮：仅一份简历可激活，用于面试上下文。
- 删除按钮：删除数据库记录并尝试清理上传文件。

### 分析

- 点击「分析」调用 `api.analyzeResume(id)`。
- 展示 `ResumeAnalysis` 多维度结果：
  - 综合评分与维度评分（结构、量化、技术深度、ATS、风险）
  - 优势、劣势、改进建议
  - 预测问题
  - 改写示例（before/after）
  - ATS 关键词、缺失关键词
  - 项目深挖方向
  - 风险区域、职级估算、市场洞察
- 使用 `cnText.ts` 中的 `normalizeCnPunctuation`、`parseRewriteExample`、`tokenizeEvalText` 处理中文排版。

## 数据流

1. 页面加载 `api.listResumes()`。
2. 上传/激活/删除后刷新列表。
3. 分析完成后本地更新该 resume 的 `analysis` 字段并展示。

## 相关页面

- [后端 API resume 端点](../../backend/api/resume.md)
- [后端简历解析器](../../backend/services/resume-parser.md)
- [后端面试报告服务](../../backend/services/interview/report.md)
