# 文件

- [CompanyKnowledgeRAG 包装器](company-rag.md) - app/services/rag/company_rag.py 向后兼容的 RAG 包装器，委托工厂选出的后端。
- [RAG 知识库数据层](kb-data.md) - app/services/rag/_kb_data.py 中内置 7 家公司种子文档、Chroma collection 名与命中片段格式化。
- [本地 Chroma RAG 后端](local-backend.md) - app/services/rag/local_backend.py 使用 Chroma PersistentClient + LLM 的 /embeddings 构建企业知识库索引与检索。
- [RAG 服务概览](overview.md) - app/services/rag/* 中企业知识库 RAG 的协议、工厂、本地 Chroma 后端、StepFun 后端与 KB 数据层。
- [RAGBackend 协议与工厂](protocol.md) - app/services/rag/base.py 的 RAGBackend 协议与 factory.py 的后端选择逻辑。
- [StepFun 托管 RAG 后端](stepfun-backend.md) - app/services/rag/stepfun_backend.py 中 StepFun vector_store 上传与 chat tools retrieval 的 RAG 后端实现。
