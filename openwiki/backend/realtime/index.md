# 文件

- [连接生命周期管理](connection-lifecycle.md) - app/realtime/connection_lifecycle.py 中 WebSocket 握手、单连接互斥、心跳与优雅关闭。
- [实时事件定义](events.md) - app/realtime/events.py 中 TurnState、SessionSnapshot 与 SessionEvent 运行时结构。
- [参考提纲服务](hint-service.md) - app/realtime/hint_service.py 中处理 request_hint 事件，异步为候选人提供答题参考提示。
- [实时 WebSocket 层概览](overview.md) - app/realtime/ 目录职责：WebSocket 协议网关，组合多个 mixin，不承载业务规则。
- [后台报告调度](report-scheduler.md) - app/realtime/report_scheduler.py 中面试完成后异步生成并持久化报告。
- [会话注册表](session-registry.md) - app/realtime/session_registry.py 中维护 session_id 到活跃 InterviewWSHandler 的映射，实现新连接踢掉旧连接。
- [打断控制与收尾](turn-control.md) - app/realtime/turn_control.py 中候选人打断、主动结束、静默追问、事件分发、打断统计持久化。
- [回合协调器](turn-coordinator.md) - app/realtime/turn_coordinator.py 中话轮锁、候选人回合入口，组合流式消费与打断/收尾副作用。
- [流式消费与 TTS 入队](turn-streaming.md) - app/realtime/turn_streaming.py 中消费 InterviewRunner 的 StreamEvent，按句入队 TTS，剥离 think 块，并处理打断 epoch。
- [语音管道（STT/TTS 队列）](voice-pipeline.md) - app/realtime/voice_pipeline.py 中 STT 选择、句子级 TTS 队列、音频缓冲、回声抑制与文本归一化。
- [WebSocket 会话处理器（门面）](ws-handler.md) - app/realtime/ws_handler.py 中 InterviewWSHandler 组合各 mixin，作为实时面试 WebSocket 的门面。
