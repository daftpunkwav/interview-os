# 文件

- [内置企业知识](company-knowledge.md) - app/services/company/knowledge.py 中 7 家内置企业的风格、关注点与样题数据。
- [上下文压缩管理器](context.md) - app/services/context/manager.py 中在 context window 30% 阈值时触发消息摘要与压缩。
- [GitHub 工具与 REST 客户端](github.md) - app/services/github/* 中 GitHub REST 客户端与 OpenAI function tools，语义对齐常见 GitHub MCP 工具。
- [成长与系统学习](growth.md) - app/services/growth/learning.py 中候选人成长记录与 system_learning.json 跨面试聚合。
- [BYOK LLM 客户端](llm-client.md) - app/services/llm/client.py 中面向 OpenAI Chat Completions 的 LLMClient，支持 chat、流式、JSON、embeddings、重试与 DNS 固定传输。
- [简历解析器](resume-parser.md) - app/services/resume/parser.py 中 PDF/DOCX/MD/TXT 解析与 CandidateProfile 提取。
- [Web 搜索服务](search.md) - app/services/search/web.py 中 DuckDuckGo 搜索封装，供 Prep Agent 与面试工具使用。
- [启动种子](seed.md) - app/services/seed.py 中 idempotent 的 LLMSettings 默认记录初始化。
- [语音识别（STT）适配层](stt.md) - app/services/stt/* 中多厂商 ASR 适配器、本地 Whisper 回退与 transcribe_utterance 统一入口。
- [语音合成（TTS）适配层](tts.md) - app/services/tts/* 中 Edge TTS 与 MiniMax Speech 适配器，synthesize_speech 统一入口与语音/语气选择。
- [三处理器 Voice 目录与测试](voice.md) - app/services/voice/* 中 ASR/LLM/TTS 能力标签、凭证装配与 recognize/reason/speak 阶段连通性测试。

# 目录

- [interview](interview/)
- [rag](rag/)
