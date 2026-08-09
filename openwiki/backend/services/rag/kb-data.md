---
type: backend
title: RAG 知识库数据层
description: app/services/rag/_kb_data.py 中内置 7 家公司种子文档、Chroma collection 名与命中片段格式化。
tags: [rag, kb-data, seed-data, company]
---

# RAG 知识库数据层

`_kb_data.py` 是纯数据层，无业务依赖，可被 `local_backend.py`、`stepfun_backend.py`、`company_rag.py` 与测试自由 import，避免循环导入。

## 关键符号

- `COLLECTION_NAME`：Chroma collection 名称
- `_build_documents()` → 生成 7 家公司的文档列表（每个公司多篇或一篇）
- `format_context(docs)` → 将检索结果拼接为可注入 prompt 的字符串
- `_data_dir()` → 解析 Chroma 数据目录路径

## 内置公司

7 家内置企业：

- 字节跳动（ByteDance）
- 腾讯（Tencent）
- 阿里巴巴（Alibaba）
- 美团（Meituan）
- 米哈游（miHoYo）
- OpenAI
- Google

每家包含风格描述、面试特点、常见问题等文本片段。

## 设计约束

- 不 import `app.services.interview` 等业务模块。
- 不依赖 FastAPI 或 SQLAlchemy。
- 可被测试直接调用，避免复杂的后端启动。

## 扩展新公司

1. 在 `_build_documents()` 中新增公司条目。
2. 在 `app/services/company/knowledge.py` 同步添加公司元数据（如 style、focus_areas、sample_questions）。
3. 删除旧的 Chroma 索引或等待 `ensure_index` 重新构建（幂等逻辑需检测变更）。
4. 更新 `tests/test_rag_backends.py`。

## 相关页面

- [本地后端](./local-backend.md)
- [StepFun 后端](./stepfun-backend.md)
- [公司知识](../company-knowledge.md)
- [RAG 概览](./overview.md)
