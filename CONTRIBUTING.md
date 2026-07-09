# 贡献者指南

> 任何 PR / Issue 都默认你读过本文件。

## 1. 行为准则

请保持专业、聚焦于工程本身。任何针对个人的不当言论按 PRD §1 处置。

## 2. 仓库约定

- 默认分支：`main`，永远是绿的；
- 长期分支以 `feat/<milestone>` 形式存在，例如 `feat/m5-rag-enhance`；
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：
  ```
  feat(backend): 新增公司知识库 RAG
  fix(frontend): 修复断线重连导致的状态卡死
  docs: 补充 API.md
  chore: 更新依赖
  ```
- 邮箱：所有提交均使用 `daftpunk.wav@outlook.com`。

## 3. 提交流程

1. **`git checkout -b feat/your-thing` 从 main 拉分支**；
2. 每个小改动一次提交，便于 review 与回滚；
3. 大改动（新模块、新协议）请先开 issue 讨论，或者直接在 PR description 里写 RFC；
4. 跑通 `pytest`（48 通过为基线）与 `npm run build` 再提 PR；
5. PR title 简要说明动机；description 关联 issue / 列影响面；
6. Review 通过后 squash merge。

## 4. 分层规则

| 层 | 加新东西的入口 |
|---|---|
| 新增 LLM Provider | `app/services/llm/<provider>.py`，在 `from_db` 中分支选择 |
| 新增 Workflow | `app/services/interview/workflows.py` 注册；`Options.workflow_types` 自动暴露 |
| 新增前端页面 | `src/app/<route>/page.tsx`，配套 `src/lib/api.ts` 入口；侧栏加在 `Sidebar.tsx` |
| 新增 SSE/WS 事件 | 同步修改 `app/realtime/events.py` 与 `frontend/src/types/index.ts`，使 TS 编译器锁住协议 |

## 5. 测试规范

- 后端：`pytest -q`，新增单测覆盖正常路径 + 1 个边界；
- 前端：当前无强制测试，但脚本/纯函数鼓励补 Vitest；
- 不要把真实 API Key / 用户数据提交到仓库（见 `SECURITY.md`）。

## 6. 安全相关变更

任何触及以下内容的 PR **必须** 自带脱敏/防御的考量，并在 description 里说明：

- 鉴权、Token、Cookie；
- 文件上传 / 文件 IO；
- URL / 跨域调用；
- LLM Prompt 拼接；
- 日志 / 错误回显。

完整威胁模型见 `docs/ARCHITECTURE.md §5`。

## 7. 编码风格

- Python：black/ruff（暂未启用）；函数级 docstring 中文；
- TypeScript：strict + noUncheckedIndexedAccess；Tailwind 走 `cn()`；
- i18n：当前默认中文，新功能尽量抽出 key 便于后续抽取。

## 8. 反馈与沟通

- Issue：GitHub / GitLab / Gitee 任一镜像均可，作者会做镜像同步；
- 大改动前可先开 Discussion / 邮件给 `daftpunk.wav@outlook.com`。
