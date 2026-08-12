## 目标:docs/ 目录按文档类型分类整理

**原则**:只移动/改名文件并同步引用链接,**不修改任何文档正文内容**(仅引用路径随移动调整)。`git mv` 保留历史。

### 最终目录结构

```
docs/
├── spec/                                   # 技术规约(开发者契约)
│   ├── ARCHITECTURE.md                     # ← docs/ARCHITECTURE.md
│   ├── API.md                              # ← docs/API.md
│   └── ERROR_CODES.md                      # ← docs/ERROR_CODES.md
├── product/
│   └── PRD.md                              # ← docs/PRD/PRD.md
├── review/                                 # 审查报告(已有)
│   ├── REVIEW_2026-08-04.md
│   ├── REVIEW_2026-08-04.html
│   └── REVIEW_ARCHITECTURE_DECOUPLING_2026-08-09.md   # ← 改名自 ARCHITECTURE_DECOUPLING_REVIEW_2026-08-09.md
└── history/                                # 历史归档(已有,gitignore,不动)
    └── INTERVIEWOS_ORIGINAL_IDEA.md
```

### 第 1 步:git mv 移动文件

1. `git mv docs/API.md docs/ARCHITECTURE.md docs/ERROR_CODES.md docs/spec/`
2. `git mv docs/PRD/PRD.md docs/product/PRD.md`(旧空目录 PRD/ 由 git 自动消失)
3. `git mv docs/review/ARCHITECTURE_DECOUPLING_REVIEW_2026-08-09.md docs/review/REVIEW_ARCHITECTURE_DECOUPLING_2026-08-09.md`

### 第 2 步:同步引用链接(逐文件更新)

**外部引用(根目录/代码/测试):**
| 文件 | 改动 |
|---|---|
| `README.md:50` | `docs/ARCHITECTURE.md §5` → `docs/spec/ARCHITECTURE.md §5` |
| `README.md:183` | 项目结构树中 docs/ 行注释及新增 spec/、product/ 子目录说明 |
| `README.md:213-214` | 主要文档列表路径 → `docs/spec/ARCHITECTURE.md`、`docs/spec/API.md` |
| `SECURITY.md:38` | → `docs/spec/ARCHITECTURE.md §5` |
| `CONTRIBUTING.md:56` | → `docs/spec/ARCHITECTURE.md §5` |
| `DEVELOPMENT_PROGRESS.md:6` | `docs/PRD/PRD.md` → `docs/product/PRD.md` |
| `CODE_REVIEW.md:5` | 指向 `docs/review/REVIEW_2026-08-04.md`,路径不变,无需改(核对即可) |
| `backend/app/core/errors.py:1,37` | 注释 `docs/ERROR_CODES.md` → `docs/spec/ERROR_CODES.md` |
| `backend/tests/test_error_codes.py:4` | 注释 → `docs/spec/ERROR_CODES.md` |

**docs 内部互引(随文件移动后调整相对路径):**
- `docs/spec/API.md`:对 `ERROR_CODES.md` 的引用(原同目录相对引用在 spec/ 内依然有效);纯文本提及处同步为 `docs/spec/ERROR_CODES.md`
- `docs/spec/ERROR_CODES.md`:对 `docs/review/ARCHITECTURE_DECOUPLING_REVIEW_2026-08-09.md` 的引用(行5)→ 新文件名;对 `docs/API.md` 的纯文本提及(行142、515)→ `docs/spec/API.md`;嵌入代码块内的注释(行176、212)→ `docs/spec/ERROR_CODES.md`
- `docs/spec/ARCHITECTURE.md`、`docs/product/PRD.md`、`docs/review/REVIEW_2026-08-04.md`:执行时全量 rg 核对,若有对旧路径的引用一并更新
- `docs/review/REVIEW_ARCHITECTURE_DECOUPLING_2026-08-09.md`(改名后):自引 `../ERROR_CODES.md`(行4、518、2173)→ `../spec/ERROR_CODES.md`

**明确不改动:**
- `CHANGELOG.md:107-108`:历史记录中的旧路径是当时事实,保持原样
- `InterviewOS.md:3`:指向 docs/history/,不移动,无需改
- `docs/history/`:gitignore 个人笔记,内容与路径均不动
- openwiki/ 生成页面:AGENTS.md 规定不手改,由 CI 重新生成

### 第 3 步:验证

1. `rg -n "docs/(API|ARCHITECTURE|ERROR_CODES|PRD|ARCHITECTURE_DECOUPLING_REVIEW)" .` 排除 `CHANGELOG.md` 与 `.git/`、`node_modules/`,确认无残留旧路径引用
2. `git status` 确认移动与引用修改完整、无遗漏文件
3. `git mv` 后 `git diff --stat` 人工核对移动清单与预期一致

### 交付

- docs/ 新目录结构如上(分类清晰、命名统一)
- 所有链接有效,无断链
- 文档正文零内容改动(除引用路径)