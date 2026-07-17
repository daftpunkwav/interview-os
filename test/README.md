# InterviewOS 会话回归测试

覆盖 2026-07 代码审查修复的回归用例（SSRF pin、报告单次 LLM、WS 互斥、限流、TTS flush、HTTP Runner、settings/growth、前端源码断言）。

## 运行

在仓库根目录：

```bash
cd backend
# 需先安装 backend 依赖；从 test/ 运行时会自动把 backend 加入 PYTHONPATH
python -m pytest ../test -v
```

或：

```bash
cd test
python -m pytest -v
```

（请在已 `pip install -r backend/requirements.txt` 的环境中执行。）
