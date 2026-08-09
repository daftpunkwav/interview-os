# 文件

- [面试会话端点](interview.md) - app/api/interview.py 中面试会话创建、开始、文本消息、历史与结束。
- [选项端点](options.md) - app/api/options.py 中返回前端启动所需的岗位、职级、公司、工作流、人格、风格、头像、场景、音色等选项。
- [API 路由与 v1/legacy 别名](overview.md) - app/api/router.py 与 app/api/v1/router.py 的聚合结构、/api/v1 权威路径与 /api 兼容别名策略。
- [面试准备端点](prep.md) - app/api/v1/prep.py 中 prep session 创建、同步聊天与 SSE 流式辅导。
- [用户档案端点](profile.md) - app/api/profile.py 中 UserProfile 的自动创建、读取与更新。
- [报告与成长端点](reports.md) - app/api/reports.py 中面试报告读取、SSE 流式生成、成长历史与系统洞察。
- [简历端点](resume.md) - app/api/resume.py 中上传、激活、分析、删除简历的 API 与安全校验。
- [设置端点](settings.md) - app/api/settings.py 中 BYOK 三处理器配置、供应商目录、阶段测试与密钥更新。
- [实时面试 WebSocket 端点](websocket.md) - app/api/v1/ws_interview.py 注册 ws://host/api/v1/ws/interview/{id} 并委托 InterviewWSHandler 处理。
