---
type: backend
title: 简历解析器
description: app/services/resume/parser.py 中 PDF/DOCX/MD/TXT 解析与 CandidateProfile 提取。
tags: [resume, parser, pdf, docx, candidate-profile]
---

# 简历解析器

`app/services/resume/parser.py` 负责把上传的简历文件转换为结构化 `CandidateProfile`。

## 关键符号

- `parse_resume(file_bytes, file_type) -> CandidateProfile`
- 支持格式：`pdf`, `docx`, `doc`, `md`, `txt`

## 解析流程

1. 根据 `file_type` 选择解析器。
2. 提取原始文本。
3. 使用 LLM（或规则启发）从原始文本提取：
   - 姓名
   - 教育经历（学校、专业、时间）
   - 工作经历（公司、岗位、时间、职责）
   - 技能列表
   - 项目经历
   - 个人总结
4. 返回 `CandidateProfile` Pydantic 模型。

## 解析限制（安全与资源）

```python
_MAX_PDF_PAGES = 50
_MAX_DOCX_ZIP_ENTRIES = 200
_MAX_DOCX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024
_MAX_EXTRACTED_CHARS = 100_000
_MAX_PARAGRAPHS = 5_000
```

- PDF 超过 50 页拒绝。
- DOCX 作为 ZIP 校验条目数 ≤ 200、解压后体积 ≤ 30 MB，防止 zip bomb。
- 提取文本上限 100,000 字符。
- 段落上限 5,000 条。

## 文件解析流程

- `pdf`：使用 `pypdf.PdfReader` 逐页提取，`
` 拼接，截断到 100k。
- `docx/doc`：先调用 `_assert_docx_zip_safe` 校验 ZIP 安全，再用 `python-docx.Document` 读取段落，截断到 `_MAX_PARAGRAPHS`。
- `md/txt`：直接按 UTF-8 读取，忽略错误。

## LLM 解析

`parse_resume_with_llm(raw_text, llm)` 发送前 15,000 字符给 LLM，要求返回 `CandidateProfile` JSON。解析失败时回退为 `CandidateProfile(summary=raw_text[:500])`。
## 与简历评价的关系

`CandidateProfile` 被 `InterviewAgent.build_opening_prompt` 用于构建面试 prompt；`Resume` 表的 `parsed_profile` 字段保存其序列化结果。

## 相关页面

- [简历 API 端点](../api/resume.md)
- [面试 Agent](interview/agent.md)
- [Pydantic 契约](../schemas.md)
