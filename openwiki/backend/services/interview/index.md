# 文件

- [面试 Agent 状态机](agent.md) - app/services/interview/agent.py 中 InterviewAgent 负责消息历史、结构化记忆、阶段推进与持久化。
- [追问信号分析](followup.md) - app/services/interview/followup.py 中根据候选人回答与上一个问题生成追问信号分类和追问 probe。
- [面试领域服务概览](overview.md) - app/services/interview 中 InterviewAgent、InterviewRunner、StreamingConsumer、ToolRoundRunner、PromptAssembler 等模块的职责边界与协作。
- [Prompt 构建与文本清理](prompts.md) - app/services/interview/agent_prompts.py、prompt_assembler.py、agent_text.py 中 system prompt、用户消息、标记剥离、思考块过滤与情绪检测。
- [面试报告生成](report.md) - app/services/interview/report.py 中生成、持久化、流式输出面试报告，并写入 GrowthRecord 与 system_learning.json。
- [InterviewRunner 回合门面](runner.md) - app/services/interview/runner.py 作为 WebSocket/HTTP/测试的公共入口，委托 PromptAssembler、ToolRoundRunner、StreamingConsumer 执行。
- [流式消费者](streaming.md) - app/services/interview/streaming_consumer.py 中 StreamingConsumer 提供三个流式入口，协调 followup、RAG、工具循环、LLM 流式输出与状态持久化。
- [Function Tools 与工具循环](tools.md) - app/services/interview/tools.py 与 tool_round_runner.py 中注册 OpenAI function tools、执行 GitHub/公司/简历/搜索工具，最多 interview_max_tool_rounds 轮。
- [面试工作流与阶段元数据](workflows.md) - app/services/interview/workflows.py 是面试阶段、中文名、题量、人格/风格/严格度提示的唯一来源。
