---
type: backend
title: 内置企业知识
description: app/services/company/knowledge.py 中 7 家内置企业的风格、关注点与样题数据。
tags: [company, knowledge, interview-style, seed-data]
---

# 内置企业知识

`app/services/company/knowledge.py` 维护 7 家内置企业的元数据、风格描述与样题，用于：

- `build_system_prompt` 注入公司上下文
- RAG 知识库 seed 数据
- `/api/v1/options` 返回公司选项

## 7 家内置企业

- 字节跳动（ByteDance）
- 腾讯（Tencent）
- 阿里巴巴（Alibaba）
- 美团（Meituan）
- 米哈游（miHoYo）
- OpenAI
- Google

## 数据内容

每家公司通常包含：

- 风格描述（面试节奏、考察重点、文化偏好）
- 关注领域（如算法、工程、产品、系统架构）
- 样题示例（若干代表性问题）

## 使用方式

### 直接注入 prompt

`get_company_context(company)` 返回字符串，由 `agent_prompts.build_system_prompt` 直接拼入 system prompt。

### RAG seed

`_kb_data._build_documents()` 从 `knowledge.py` 读取公司数据，生成用于向量索引的文档。

### 选项 API

`app/api/options.py` 将公司与样题包装为 `CompanyInfo` 返回给前端选择。

## 扩展新公司

1. 在 `knowledge.py` 添加公司元数据与样题。
2. 在 `app/services/rag/_kb_data.py` 同步添加 seed 文档。
3. 删除或重建 Chroma 索引（`CompanyKnowledgeRAG.ensure_index` 会检测并重新索引）。
4. 更新 `tests/test_rag.py` 与 `tests/test_rag_backends.py` 的公司列表断言。

## 相关页面

- [RAG 数据层](./rag/kb-data.md)
- [RAG 本地后端](./rag/local-backend.md)
- [Prompt 构建](./interview/prompts.md)
- [API 选项端点](../api/options.md)
