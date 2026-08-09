---
type: backend
title: 简历端点
description: app/api/resume.py 中上传、激活、分析、删除简历的 API 与安全校验。
tags: [api, resume, upload, file-upload, parsing]
---

# 简历端点

## 路径

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/resume/upload` | 上传简历文件 |
| GET | `/api/v1/resume/list` | 列出简历 |
| GET | `/api/v1/resume/{id}` | 获取单份简历 |
| POST | `/api/v1/resume/{id}/activate` | 激活该简历（行锁互斥，仅一份激活） |
| DELETE | `/api/v1/resume/{id}` | 删除简历并尝试清理文件 |
| POST | `/api/v1/resume/{id}/analyze` | AI 多维度评价 |

## 上传安全细节

- 最大 10 MB（`RESUME_MAX_UPLOAD_BYTES`）。
- 允许扩展名：`pdf`, `docx`, `doc`, `md`, `txt`。
- 魔数嗅探 `_sniff_extension`：PDF `%PDF-`、DOCX `PK\x03\x04`、DOC OLE header。
- 文件名 `sanitize_filename` + `assert_within_dir` 双保险。
- 流式读取按 64 KB 分块，超过上限立即抛 413。
- 文件以 `uuid[:8]_safe_name` 命名落盘，避免原始文件名冲突。
- 413 返回 `{"error":{"message":"文件超过 10MB 上限"}}`。

## 解析与持久化

1. 保存文件到 `backend/uploads/`。
2. 调用 `extract_text_from_file` 提取纯文本（PDF 50 页、DOCX zip 炸弹防御等）。
3. 调用 `parse_resume_with_llm` 提取 `CandidateProfile`；LLM 未配置时仅保留 summary。
4. `raw_text` 最多存 50,000 字符，`parsed_profile` 以 JSON 字符串存入 `resumes` 表。

## 激活与行锁

`activate_resume` 通过数据库行锁保证同一 `profile_id` 下仅有一份简历处于 `is_active=True`。激活新简历会自动取消旧简历激活。

## 分析端点

`/analyze` 调用流程：

1. 检查 `LLMClient.api_key` 是否已配置。
2. 构造 `raw_text[:14000]` + `parsed_profile[:4000]` 的 user_blob。
3. 调用 `_gather_resume_market_context` 做 DuckDuckGo 联网检索（岗位市场信息、JD 关键词）。
4. 发送 `_RESUME_ANALYZE_PROMPT` 给 LLM，要求返回严格 JSON。
5. 通过 `_normalize_resume_analysis_payload` 容错规范化：
   - `score` 限制到 0–100 整数。
   - 列表字段统一为字符串列表，截断到 20 条。
   - `dimension_scores` 支持 `{k: 80}` 或 `{k: {score, comment}}` 两种形态，统一为后者。
   - 文本字段截断到 4000 字符。
   - `rewrite_examples` 通过 `_normalize_rewrite_examples` 兼容字符串/dict，统一为 `{before, after}` 列表。
   - 中文全角标点硬规范化。
6. 用 `ResumeAnalysis.model_validate` 强校验；失败时降级部分字段重试。
7. 写入 `r.score` 与 `r.analysis`。
## 相关页面

- [简历解析器](../services/resume-parser.md)
- [面试报告](../services/interview/report.md)
- [文件安全](../core/security.md)
