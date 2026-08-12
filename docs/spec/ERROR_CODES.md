# InterviewOS 错误码规范（ERROR_CODES.md）

> **版本**：v1.0（2026-08-09）
> **地位**：全站（后端 REST / WebSocket / SSE、前端展示）错误码的唯一权威来源。新增/修改错误码必须先改本文档，再改代码。
> **配套**：架构审查报告 `docs/review/ARCHITECTURE_DECOUPLING_REVIEW_2026-08-09.md` 的 E6 项引用本文档。

---

## 1. 设计目标

| 目标 | 具体含义 |
| --- | --- |
| 前端友好 | 每条错误带**中文说明 + 中文处置建议（hint）**，前端可直接展示，无需自行翻译 |
| 可排查定位 | 每条错误带**机器可读错误码 + trace_id**，用户截图报错即可在本文档查到含义、在日志里按 trace_id 串联 |
| 业界习俗 | 错误来源三分法（用户端/本系统/第三方）对齐《阿里巴巴 Java 开发手册》错误码规约；envelope 结构对齐 Google API Design Guide（`error.code/message` + details）；处置建议字段参考 Stripe `declined_code` 的人因友好思路 |
| 可演进 | 错误码注册表集中管理，新增错误码不改协议结构；未迁移的旧错误保持兼容 |

## 2. 错误码格式

### 2.1 格式定义

错误码为 **5 位字符串**：`来源字母 + 域数字 + 两位序号`，形如 `A1004`、`C0003`。

```
 A   1   04
 │   │   └─ 序号（01-99，域内递增）
 │   └───── 域（第 2 位数字，见 2.2）
 └───────── 错误来源（第 1 位字母，见 2.3）
```

### 2.2 第 1 位：错误来源（三分法，业界依据）

| 字母 | 来源 | 含义 | 对应 HTTP | 业界依据 |
| --- | --- | --- | --- | --- |
| `A` | **用户端错误**（User/Client） | 用户输入、权限、状态、上传问题，**用户可自行修复** | 4xx | 阿里规约 A 类 |
| `B` | **本系统错误**（Backend/System） | 代码 bug、DB 故障、状态机异常，**需要开发者介入** | 5xx / WS | 阿里规约 B 类 |
| `C` | **第三方服务错误**（3rd-party/Cloud） | LLM、ASR、TTS、搜索、GitHub、RAG 等外部依赖故障，**通常可重试或换配置** | 502/503 / WS / SSE | 阿里规约 C 类 |

**排查第一刀**：看到 `A` 找用户操作，看到 `B` 查后端日志，看到 `C` 查第三方配置/网络/额度。

### 2.3 第 2 位：域划分

| 域数字 | A 类含义 | B 类含义 | C 类含义 |
| --- | --- | --- | --- |
| `0` | 通用请求（参数/限流/鉴权/上传） | 系统通用 | LLM 通用 |
| `1` | 简历 | 数据库 | 报告生成 |
| `2` | 面试会话 | 实时会话（WS） | 语音（ASR/TTS） |
| `3` | 面试准备（prep） | 预留 | 联网搜索 / GitHub |
| `4` | 设置与语音配置 | 预留 | RAG 知识库 |

### 2.4 序号分配规则

- 域内从 `01` 递增，不回收、不复用已废弃码（废弃标注 `deprecated`，保留含义防误读）；
- 同一语义在多处出现用**同一个码**（如"请先配置 API Key"出现在简历评价与面试启动，统一 `A0006`）；
- 文档先行：先在 §3 目录表登记，再在代码中使用。

## 3. 错误码目录表（权威清单）

> 字段：`code` / HTTP 状态 / 中文 message（默认文案）/ 中文 hint（处置建议）/ 可重试 / 当前出现位置（文件:行号，2026-08-09 快照）

### 3.1 A0 通用请求

| code | HTTP | message | hint | 可重试 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| `A0001` | 422 | 请求参数校验失败 | 请检查输入内容是否完整、格式是否正确 | 否 | `main.py` RequestValidationError handler |
| `A0002` | 429 | 请求过于频繁，请稍后再试 | 请放慢操作频率；连续触发请等待 1 分钟 | 是 | `core/ratelimit.py:139,171`；WS `connection_lifecycle.py:373,403,413` |
| `A0003` | 400 | 文本过长（上限 {max} 字符） | 请分段输入或精简内容 | 否 | WS `connection_lifecycle.py:388-391` |
| `A0004` | 400 | 音频过大，请分段说话或改用文字输入 | 单次发言请控制在 2 分钟内 | 否 | WS `turn_coordinator.py:207,249` |
| `A0005` | 400 | 文件为空 | 请选择非空文件重新上传 | 否 | `api/resume.py:207` |
| `A0006` | 400 | 请先配置 API Key | 请到「设置」页填写思考处理器的 API Base 与 Key | 否 | `api/resume.py:481`、`api/interview.py:162,202` |
| `A0007` | 400 | URL 不安全 | 仅允许 https 公网地址；本地模型请在 `.env` 显式开启 ALLOW_LOCAL_LLM | 否 | `main.py` UnsafeURLError handler、`api/settings.py:60` |
| `A0401` | 403 | 无权访问该会话 | 会话令牌已失效，请回到列表页重新进入 | 否 | `core/session_auth.py:68` |
| `A0403` | 403 | 跨站请求被拒绝 | 请从本站页面发起操作，不要直接调用接口 | 否 | `core/session_auth.py:159` |
| `A0404` | 404 | 请求的资源不存在 | 可能已被删除，请返回列表页刷新 | 否 | Starlette 404 兜底 handler |
| `A0405` | 403 | 仅允许本机访问管理接口 | 请在部署本机的浏览器访问 | 否 | `core/local_only.py:26-39` |
| `A0413` | 413 | 文件超过 {max}MB 上限 | 请压缩文件或改用 DOCX/TXT 格式后重试 | 否 | `api/resume.py:199` |

### 3.2 A1 简历域

| code | HTTP | message | hint | 可重试 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| `A1001` | 400 | 文件名不能为空 | 请检查所选文件后重试 | 否 | `api/resume.py:181` |
| `A1002` | 400 | 不支持的文件格式，允许：{exts} | 请上传 PDF / DOCX / MD / TXT 格式简历 | 否 | `api/resume.py:185` |
| `A1003` | 400 | 文件内容与扩展名不匹配 | 文件可能已损坏或被篡改，请重新导出后再上传 | 否 | `api/resume.py:211` |
| `A1004` | 400 | 文件解析失败，请检查格式 | 扫描件 PDF 无法提取文字，请改用文字版或 DOCX | 否 | `api/resume.py:222` |
| `A1005` | 404 | 简历不存在 | 简历可能已被删除，请刷新列表 | 否 | `api/resume.py:282,301,447,478` |

### 3.3 A2 面试域

| code | HTTP | message | hint | 可重试 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| `A2001` | 404 | 面试会话不存在 | 会话可能已过期或删除，请新建面试 | 否 | `api/interview.py:114,155,195,257,290`、`api/reports.py:102,154`、WS `turn_control.py:160` |
| `A2002` | 400 | 面试已结束 | 本场面试已完成，可前往报告页查看结果 | 否 | `api/interview.py:158,198`、WS `streaming_consumer.py:138,262` |
| `A2003` | 400 | 面试尚未结束 | 请先完成面试再查看报告 | 否 | `api/reports.py:105` |
| `A2004` | 404 | 报告尚未生成 | 报告正在后台生成中，请稍后刷新；若长时间未生成请点击重试 | 是 | `api/reports.py:158` |

### 3.4 A3 面试准备域

| code | HTTP | message | hint | 可重试 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| `A3001` | 404 | 辅导会话不存在 | 会话可能已过期，请新建辅导会话 | 否 | `api/v1/prep.py:116,145,183` |
| `A3002` | 400 | 辅导会话已结束 | 本辅导会话已关闭，请新建会话 | 否 | `api/v1/prep.py:119,148` |

### 3.5 A4 设置与语音配置域

| code | HTTP | message | hint | 可重试 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| `A4001` | 400 | 所选供应商不支持面试思考 | 请在设置页更换支持 Chat Completions 的供应商 | 否 | `api/settings.py:113,118` |
| `A4002` | 400 | 该识别处理者不支持转写 | 请更换识别处理器或改用本地 Whisper | 否 | `api/settings.py:128` |
| `A4003` | 400 | 语音配置无效 | 请检查识别/播报处理器的 Base、Key、模型名是否完整 | 否 | `api/settings.py:123,133,142` |
| `A4004` | 400 | stage 须为 recognize / reason / speak | 请从设置页按钮发起测试，勿直接调用 | 否 | `api/settings.py:255` |

### 3.6 B 类：本系统错误

| code | HTTP | message | hint | 可重试 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| `B0001` | 500 | 服务器内部错误，请稍后重试 | 若反复出现，请携带 trace_id 反馈给开发者 | 是 | `main.py` 兜底 Exception handler |
| `B1001` | 500 | 结果写入失败，请稍后重试 | 本地数据库写入异常；若反复出现请检查磁盘空间与文件权限 | 是 | `api/resume.py:546` |
| `B2001` | —(WS) | 服务端异常，已恢复待答状态 | 面试可继续；若反复出现请重进面试 | 是 | WS `connection_lifecycle.py:303` |
| `B2002` | —(WS) | 心跳超时，连接已断开 | 请检查网络后刷新页面重连 | 是 | WS `connection_lifecycle.py:284` |
| `B2003` | —(WS) | 该面试已在其他窗口打开，当前连接已被顶替 | 请关闭其他窗口的本场面试 | 否 | WS `session_registry.py:48` |

### 3.7 C 类：第三方服务错误

| code | HTTP | message | hint | 可重试 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| `C0001` | 502 | AI 服务暂时不可用，请稍后重试 | 请检查 API Key 额度与网络；持续失败请到设置页测试连通性 | 是 | `api/interview.py:133`、`api/resume.py:512`、WS `streaming_consumer.py:113,253,334`（面试官服务不可用） |
| `C0002` | 502 | 模型未返回有效结果，请稍后重试 | 当前模型可能不兼容（仅推理/空输出），请更换模型后重试 | 是 | `api/resume.py:506,534` |
| `C0003` | 503 | AI 服务熔断保护中，请稍候（30 秒）再试 | 服务商连续故障触发保护；请稍候自动恢复，或先检查 Key 与额度 | 是 | E2 熔断器（`services/llm/circuit_breaker.py`，见架构报告 §12.2） |
| `C1001` | 502 | 报告生成失败，请稍后重试 | 请到报告页点击重新生成；口头收尾内容不受影响 | 是 | `api/interview.py:221,272`、WS `report_scheduler.py:75`、SSE `api/reports.py:133` |
| `C2001` | —(WS) | 未能识别语音内容，请重新说话或手动输入 | 请靠近麦克风、降低环境噪音；也可改用文字作答 | 是 | WS `turn_coordinator.py:300` |
| `C2002` | —(WS) | 语音合成失败，本轮仅显示字幕 | 请检查播报处理器配置；可在设置页切换 Edge TTS | 是 | WS `voice_pipeline.py:284` |
| `C3001` | 200* | 联网搜索暂时不可用，已基于通用知识继续 | 检索失败不影响主流程；如需实时信息请稍后重试 | 是 | `services/search/web.py` SEARCH_UNAVAILABLE、prep SSE |
| `C4001` | 200* | 知识库检索失败，已按无知识库模式继续 | 检索降级不影响面试；请检查 RAG 配置与 embeddings 服务 | 是 | `services/interview/tool_round_runner.py:67-69`（内部降级，不直接对外） |

> `200*` 表示这类错误**不中断业务流程**，仅以提示/降级形式出现（对齐 §4.3 的既有降级语义），错误码用于日志与前端提示角标，不弹错误框。

## 4. 协议格式（三通道统一）

### 4.1 REST 响应信封

在现有 envelope（`docs/spec/API.md` §1.1）基础上扩展 `hint` 与 `retryable` 两个字段，`detail` 旧字段保留：

```json
{
  "detail": "AI 服务暂时不可用，请稍后重试",
  "error": {
    "code": "C0001",
    "message": "AI 服务暂时不可用，请稍后重试",
    "hint": "请检查 API Key 额度与网络；持续失败请到设置页测试连通性",
    "retryable": true,
    "trace_id": "req-3f9a2c71"
  }
}
```

### 4.2 WebSocket error 事件

```json
{ "type": "error", "code": "C0001", "message": "面试官服务暂时不可用，请稍后重试", "retryable": true }
```

不带 code 的旧 error 帧前端按 `B0001` 兜底显示。`info` 级降级提示（如 ASR 回退）继续走 `{"type":"info"}`，不占用错误码。

### 4.3 SSE error 事件（prep / report 流）

```json
{ "type": "error", "code": "C0001", "message": "辅导生成失败，请稍后重试", "retryable": true }
```

## 5. 后端实施指南（含完整代码）

### 5.1 新建错误码注册表 `backend/app/core/errors.py`

```python
"""全站错误码注册表（权威实现，目录定义见 docs/spec/ERROR_CODES.md）。

用法：
    from app.core.errors import raise_error

    raise_error("A1005")                       # 用目录默认文案
    raise_error("A0413", max=10)               # 格式化 message 中的 {max}
    raise_error("C0001", cause=e)              # 链式保留原始异常

设计要点：
- ``ApiBusinessError`` 继承 ``HTTPException``，所有既有 ``except HTTPException``
  与 ``main.py`` 的 envelope handler 自动兼容；
- handler 通过 ``exc.error_code`` 属性识别业务错误码，未迁移的旧
  ``raise HTTPException`` 走 ``http_{status}`` 兜底码，互不干扰。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import NoReturn

from fastapi import HTTPException


@dataclass(frozen=True)
class ErrorSpec:
    """单条错误码规格。"""

    code: str
    http_status: int
    message: str          # 中文默认文案（可含 {name} 格式占位）
    hint: str = ""        # 中文处置建议
    retryable: bool = False


# ---------------------------------------------------------------------------
# 目录（与 docs/spec/ERROR_CODES.md §3 一一对应；新增错误码先改文档再改这里）
# ---------------------------------------------------------------------------

CATALOG: dict[str, ErrorSpec] = {
    # A0 通用
    "A0001": ErrorSpec("A0001", 422, "请求参数校验失败", "请检查输入内容是否完整、格式是否正确"),
    "A0002": ErrorSpec("A0002", 429, "请求过于频繁，请稍后再试", "请放慢操作频率；连续触发请等待 1 分钟", True),
    "A0003": ErrorSpec("A0003", 400, "文本过长（上限 {max} 字符）", "请分段输入或精简内容"),
    "A0004": ErrorSpec("A0004", 400, "音频过大，请分段说话或改用文字输入", "单次发言请控制在 2 分钟内"),
    "A0005": ErrorSpec("A0005", 400, "文件为空", "请选择非空文件重新上传"),
    "A0006": ErrorSpec("A0006", 400, "请先配置 API Key", "请到「设置」页填写思考处理器的 API Base 与 Key"),
    "A0007": ErrorSpec("A0007", 400, "URL 不安全", "仅允许 https 公网地址；本地模型请在 .env 显式开启 ALLOW_LOCAL_LLM"),
    "A0401": ErrorSpec("A0401", 403, "无权访问该会话", "会话令牌已失效，请回到列表页重新进入"),
    "A0403": ErrorSpec("A0403", 403, "跨站请求被拒绝", "请从本站页面发起操作，不要直接调用接口"),
    "A0404": ErrorSpec("A0404", 404, "请求的资源不存在", "可能已被删除，请返回列表页刷新"),
    "A0405": ErrorSpec("A0405", 403, "仅允许本机访问管理接口", "请在部署本机的浏览器访问"),
    "A0413": ErrorSpec("A0413", 413, "文件超过 {max}MB 上限", "请压缩文件或改用 DOCX/TXT 格式后重试"),
    # A1 简历
    "A1001": ErrorSpec("A1001", 400, "文件名不能为空", "请检查所选文件后重试"),
    "A1002": ErrorSpec("A1002", 400, "不支持的文件格式，允许：{exts}", "请上传 PDF / DOCX / MD / TXT 格式简历"),
    "A1003": ErrorSpec("A1003", 400, "文件内容与扩展名不匹配", "文件可能已损坏或被篡改，请重新导出后再上传"),
    "A1004": ErrorSpec("A1004", 400, "文件解析失败，请检查格式", "扫描件 PDF 无法提取文字，请改用文字版或 DOCX"),
    "A1005": ErrorSpec("A1005", 404, "简历不存在", "简历可能已被删除，请刷新列表"),
    # A2 面试
    "A2001": ErrorSpec("A2001", 404, "面试会话不存在", "会话可能已过期或删除，请新建面试"),
    "A2002": ErrorSpec("A2002", 400, "面试已结束", "本场面试已完成，可前往报告页查看结果"),
    "A2003": ErrorSpec("A2003", 400, "面试尚未结束", "请先完成面试再查看报告"),
    "A2004": ErrorSpec("A2004", 404, "报告尚未生成", "报告正在后台生成中，请稍后刷新；若长时间未生成请点击重试", True),
    # A3 辅导
    "A3001": ErrorSpec("A3001", 404, "辅导会话不存在", "会话可能已过期，请新建辅导会话"),
    "A3002": ErrorSpec("A3002", 400, "辅导会话已结束", "本辅导会话已关闭，请新建会话"),
    # A4 设置
    "A4001": ErrorSpec("A4001", 400, "所选供应商不支持面试思考", "请在设置页更换支持 Chat Completions 的供应商"),
    "A4002": ErrorSpec("A4002", 400, "该识别处理者不支持转写", "请更换识别处理器或改用本地 Whisper"),
    "A4003": ErrorSpec("A4003", 400, "语音配置无效", "请检查识别/播报处理器的 Base、Key、模型名是否完整"),
    "A4004": ErrorSpec("A4004", 400, "stage 须为 recognize / reason / speak", "请从设置页按钮发起测试，勿直接调用"),
    # B 系统
    "B0001": ErrorSpec("B0001", 500, "服务器内部错误，请稍后重试", "若反复出现，请携带 trace_id 反馈给开发者", True),
    "B1001": ErrorSpec("B1001", 500, "结果写入失败，请稍后重试", "本地数据库写入异常；若反复出现请检查磁盘空间与文件权限", True),
    # C 第三方
    "C0001": ErrorSpec("C0001", 502, "AI 服务暂时不可用，请稍后重试", "请检查 API Key 额度与网络；持续失败请到设置页测试连通性", True),
    "C0002": ErrorSpec("C0002", 502, "模型未返回有效结果，请稍后重试", "当前模型可能不兼容（仅推理/空输出），请更换模型后重试", True),
    "C0003": ErrorSpec("C0003", 503, "AI 服务熔断保护中，请稍候（30 秒）再试", "服务商连续故障触发保护；请稍候自动恢复，或先检查 Key 与额度", True),
    "C1001": ErrorSpec("C1001", 502, "报告生成失败，请稍后重试", "请到报告页点击重新生成；口头收尾内容不受影响", True),
}


def get_spec(code: str) -> ErrorSpec:
    """按码取规格；未登记的码返回 B0001（并保留原码字符串）。"""
    spec = CATALOG.get(code)
    if spec is None:
        return ErrorSpec(code or "B0001", 500, "服务器内部错误，请稍后重试",
                         "若反复出现，请携带 trace_id 反馈给开发者", True)
    return spec


class ApiBusinessError(HTTPException):
    """携带业务错误码的 HTTP 异常。"""

    def __init__(self, spec: ErrorSpec, *, message: str, cause: Exception | None = None):
        super().__init__(status_code=spec.http_status, detail=message)
        self.error_code = spec.code
        self.error_hint = spec.hint
        self.error_retryable = spec.retryable
        if cause is not None:
            self.__cause__ = cause


def raise_error(code: str, *, cause: Exception | None = None, **fmt: object) -> NoReturn:
    """抛出携带错误码的业务异常。

    ``fmt`` 用于格式化目录 message 中的 ``{占位符}``，例如
    ``raise_error("A0413", max=10)``。
    """
    spec = get_spec(code)
    message = spec.message.format(**fmt) if fmt else spec.message
    raise ApiBusinessError(spec, message=message, cause=cause)


__all__ = ["CATALOG", "ApiBusinessError", "ErrorSpec", "get_spec", "raise_error"]
```

### 5.2 `main.py` 异常 handler 扩展（识别业务错误码）

`_envelope` 与 `_http_exception_handler`（`main.py:237-275`）改为：

```python
def _envelope(*, code: str, message: str, status: int, request: Request,
              hint: str = "", retryable: bool = False) -> JSONResponse:
    payload = {
        "detail": message,  # legacy 兼容
        "error": {
            "code": code,
            "message": message,
            "hint": hint,
            "retryable": retryable,
            "trace_id": get_trace_id() or "",
        },
    }
    return JSONResponse(
        status_code=status,
        content=payload,
        headers={TRACE_ID_HEADER: get_trace_id() or ""},
    )


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """所有 ``raise HTTPException(...)`` 走这里统一封装。

    携带 ``error_code`` 的 :class:`ApiBusinessError` 用业务码；
    未迁移的旧 raise 走 ``http_{status}`` 兜底码。
    """
    code = getattr(exc, "error_code", None) or f"http_{exc.status_code}"
    hint = getattr(exc, "error_hint", "") or ""
    retryable = bool(getattr(exc, "error_retryable", False))
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return _envelope(code=code, message=detail, status=exc.status_code,
                     hint=hint, retryable=retryable, request=request)
```

`RequestValidationError` handler 改为 `code="A0001"`；`UnsafeURLError` handler 改为 `code="A0007"`；兜底 Exception handler 改为 `code="B0001"`（均为目录中已登记码）。

### 5.3 各报错点迁移（逐站点对照表）

迁移方式统一为：`raise HTTPException(status_code=XXX, detail="...")` → `raise_error("码", **占位)`。以下按文件列出全部迁移点（行号为 2026-08-09 快照，漂移时按 detail 文案检索）：

| 文件 | 原 detail 文案 | 迁移 |
| --- | --- | --- |
| `api/resume.py:181` | 文件名不能为空 | `raise_error("A1001")` |
| `api/resume.py:185` | 不支持的文件格式… | `raise_error("A1002", exts=", ".join(ALLOWED_EXTENSIONS))` |
| `api/resume.py:199` | 文件超过…上限 | `raise_error("A0413", max=RESUME_MAX_UPLOAD_BYTES // (1024*1024))` |
| `api/resume.py:207` | 文件为空 | `raise_error("A0005")` |
| `api/resume.py:211` | 文件内容与扩展名不匹配 | `raise_error("A1003")` |
| `api/resume.py:222` | 文件解析失败… | `raise_error("A1004", cause=e)` |
| `api/resume.py:282,301,447,478` | 简历不存在 | `raise_error("A1005")` |
| `api/resume.py:481` | 请先配置 API Key | `raise_error("A0006")` |
| `api/resume.py:506` | 模型未返回有效评价结果… | `raise_error("C0002", cause=e)` |
| `api/resume.py:512` | 评价请求失败… | `raise_error("C0001", cause=e)` |
| `api/resume.py:534` | 模型返回结构不符合评价格式… | `raise_error("C0002", cause=e)` |
| `api/resume.py:546` | 评价结果写入失败… | `raise_error("B1001", cause=e)` |
| `api/interview.py:114,155,195,257,290` | 面试会话不存在 | `raise_error("A2001")` |
| `api/interview.py:158,198` | 面试已结束 | `raise_error("A2002")` |
| `api/interview.py:162,202` | 请先配置 LLM API Key | `raise_error("A0006")` |
| `api/interview.py:221,272` | 报告生成失败… | `raise_error("C1001", cause=e)` |
| `api/interview.py:133` | `detail=error`（runner 错误透传） | `raise_error("C0001")`（WS 同款文案统一入码） |
| `api/reports.py:102,154` | 面试会话不存在 | `raise_error("A2001")` |
| `api/reports.py:105` | 面试尚未结束 | `raise_error("A2003")` |
| `api/reports.py:158` | 报告尚未生成 | `raise_error("A2004")` |
| `api/v1/prep.py:116,145,183` | 会话不存在 | `raise_error("A3001")` |
| `api/v1/prep.py:119,148` | 会话已结束 | `raise_error("A3002")` |
| `api/settings.py:60` | {label} 地址不安全… | `raise ApiBusinessError(get_spec("A0007"), message=原文案)`（保留 label 动态文案） |
| `api/settings.py:113` | 面试思考处理者必须是文本 LLM… | `raise ApiBusinessError(get_spec("A4001"), message="面试思考处理者必须是文本 LLM，不能选择仅 ASR/仅 TTS 供应商")` |
| `api/settings.py:118` | 所选供应商不支持面试思考 | `raise_error("A4001")` |
| `api/settings.py:123` | 识别方式为原生听音频时… | `raise ApiBusinessError(get_spec("A4003"), message="识别方式为原生听音频时，处理者必须支持 native_audio")` |
| `api/settings.py:128` | 该识别处理者不支持转写 | `raise_error("A4002")` |
| `api/settings.py:133` | 播报方式为原生出声时… | `raise ApiBusinessError(get_spec("A4003"), message="播报方式为原生出声时，处理者必须支持 native_audio")` |
| `api/settings.py:142` | 播报方式为 TTS 时请选择… | `raise ApiBusinessError(get_spec("A4003"), message="播报方式为 TTS 时请选择 Edge / MiniMax Speech / 仅字幕")` |
| `api/settings.py:255` | stage 须为… | `raise_error("A4004")` |
| `core/session_auth.py:68` | 无权访问（detail 参数） | `raise ApiBusinessError(get_spec("A0401"), message=detail)`（保留调用方自定义文案） |
| `core/session_auth.py:159` | 跨站请求被拒绝 | `raise_error("A0403")` |
| `core/local_only.py:26,37,39` | 仅允许本机访问管理接口 | `raise_error("A0405")`（三处同文案同码） |
| `core/ratelimit.py:139,171` | 请求过于频繁… | `raise_error("A0002")` |

### 5.4 WS / SSE 错误帧带码

**WS**：`send("error", ...)` 调用点增加 `code=` 参数（`send` 实现为 `self.ws.send_json({"type": msg_type, **payload})`，payload 直接透传，无需改 send 本体）：

| 文件:行 | 当前文案 | 加码 |
| --- | --- | --- |
| `connection_lifecycle.py:284` | 心跳超时，连接已断开 | `code="B2002"` |
| `connection_lifecycle.py:303` | 服务端异常，已恢复 USER_SPEAKING | `code="B2001"` |
| `connection_lifecycle.py:345` | 音频缓存超限… | `code="A0004"` |
| `connection_lifecycle.py:373,403,413` | 请求过于频繁… | `code="A0002"` |
| `connection_lifecycle.py:389` | 文本过长… | `code="A0003"` |
| `turn_coordinator.py:207,249` | 音频过大… | `code="A0004"` |
| `turn_coordinator.py:291` | 检测到可能误采了面试官声音… | `code="C2001"` |
| `turn_coordinator.py:300` | 未能识别语音内容… | `code="C2001"` |
| `turn_control.py:160` | 面试会话不存在 | `code="A2001"` |
| `turn_control.py:173` | 面试引擎未就绪… | `code="A0006"` |
| `turn_control.py:189` | 收尾发言失败… | `code="C0001"` |
| `report_scheduler.py:75` | 口头收尾已完成，但报告生成失败… | `code="C1001"` |
| `voice_pipeline.py:216,284` | （TTS 合成/队列错误） | `code="C2002"` |
| `session_registry.py:48` | （顶替提示） | `code="B2003"` |
| `_fail_and_close`（`connection_lifecycle.py:112-124`） | 鉴权/会话失败 | 增加 `code` 形参，调用点传入 `A0401` / `A2001` / `A2002` / `A0006` |

**runner 事件流**：`StreamEvent.make_error`（`services/interview/events.py:57-58`）增加可选 `code` 字段，`streaming_consumer.py:113,253,334` 三处传 `code="C0001"`，`138,262` 两处传 `code="A2002"`；`turn_streaming.py:152` 与 `turn_control.py:218` 透传 `code=event.code`。

**SSE**：`api/v1/prep.py:166` 与 `api/reports.py:133` 的 error 事件 JSON 加 `"code": "C0001"`（prep）/ `"code": "C1001"`（report）。

## 6. 前端实施指南（含完整代码）

### 6.1 `frontend/src/lib/api.ts`：ApiError 携带结构化字段

```ts
export class ApiError extends Error {
  status: number;
  code: string;        // 错误码；无码场景（网络失败/超时/兜底）用本地码
  hint: string;        // 中文处置建议，可直接展示
  traceId: string;     // 日志串联 id；dev 模式展示
  retryable: boolean;

  constructor(
    message: string,
    status: number,
    opts: { code?: string; hint?: string; traceId?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.status = status;
    this.code = opts.code ?? (status === 0 ? "NET0000" : `http_${status}`);
    this.hint = opts.hint ?? "";
    this.traceId = opts.traceId ?? "";
    this.retryable = opts.retryable ?? false;
    this.name = "ApiError";
  }

  /** 页面展示用的一行格式：[C0001] AI 服务暂时不可用，请稍后重试 */
  get displayText(): string {
    return `[${this.code}] ${this.message}`;
  }
}
```

> `NET0000` 是前端本地码（网络不可达/超时/取消，未收到后端响应），不进后端目录，仅前端使用；本地码以 `NET` 开头，永不与后端 A/B/C 冲突。

`parseErrorResponse` 由"返回 string"改为"返回结构化对象"：

```ts
interface ParsedError {
  message: string;
  code?: string;
  hint?: string;
  traceId?: string;
  retryable?: boolean;
}

async function parseErrorResponse(res: Response): Promise<ParsedError> {
  const text = await res.text();
  if (!text) return { message: `请求失败: ${res.status}` };
  try {
    const data = JSON.parse(text) as {
      detail?: unknown;
      message?: string;
      error?: { code?: string; message?: string; hint?: string; retryable?: boolean; trace_id?: string };
    };
    if (data.error?.message) {
      return {
        message: data.error.message,
        code: data.error.code,
        hint: data.error.hint,
        traceId: data.error.trace_id,
        retryable: data.error.retryable,
      };
    }
    if (typeof data.detail === "string") return { message: data.detail };
    // ……（detail 数组 / 非 JSON / internal server error 等既有兜底逻辑原样保留，返回 { message }）……
  } catch { /* 非 JSON */ }
  return { message: text.length > 300 ? `${text.slice(0, 300)}…` : text };
}
```

`request()` 与 `uploadResume()` 中的抛出点改为：

```ts
if (!res.ok) {
  const p = await parseErrorResponse(res);
  throw new ApiError(p.message, res.status, p);
}
```

（网络失败/超时分支保持纯 message 构造，自动落 `NET0000`。）

### 6.2 展示约定

| 场景 | 展示形式 |
| --- | --- |
| 表单/按钮型操作（上传、分析、保存设置） | 错误块第一行 `[code] message`，第二行小字 hint（如有） |
| 面试页 WS 错误 |  toast/会话内系统消息：`[code] message`；`retryable=true` 附"重试"按钮 |
| SSE 流（prep/报告） | 流内错误卡：`[code] message` + hint |
| dev 模式（`NODE_ENV=development`） | 错误块底部显示 `trace_id: xxx`，复制即可去后端日志检索 |
| 无码兜底 | `[NET0000]` 或 `[http_500]` 照显，用户反馈时同样可定位 |

WS error 帧（`useInterviewWS` 的 `ServerEvent` 类型）补 `code?: string; retryable?: boolean` 两个可选字段；页面 error handler 里：

```ts
on("error", (msg) => {
  const code = msg.code ?? "B0001";
  showErrorToast(`[${code}] ${msg.message}`);
});
```

### 6.3 类型文件更新

`frontend/src/types/index.ts` 中 `ReportSSEEvent` / `PrepSSEEvent` 的 error 分支补 `code?: string`；WS `ServerEvent` 的 error 分支补 `code?: string; retryable?: boolean`。

## 7. 迁移路线图

| 步骤 | 内容 | 验证 |
| --- | --- | --- |
| 1 | 后端：`core/errors.py` + `main.py` handler 扩展（兼容旧 raise，零行为变化） | `pytest tests/test_main.py tests/test_security.py -q`；手工 curl 一个 404 确认 envelope 多了 hint/retryable 字段且 code=http_404 |
| 2 | 前端：ApiError 结构化 + parseErrorResponse 改造（兼容无 hint 的旧响应） | `npx tsc --noEmit`；手工触发一个错误看 `[code]` 前缀 |
| 3 | 后端按 §5.3 表逐文件迁移 REST raise 点（建议按 resume → interview → reports/prep → settings → core 顺序，每个文件一次提交） | 每迁一个文件跑相关测试文件；手工逐接口触发代表性错误核对 code |
| 4 | WS/SSE 错误帧带码（§5.4）+ 前端 ServerEvent 类型与 toast | `pytest tests/test_ws_handler.py tests/test_ws_hardening.py -q`；手工断 LLM 看面试页 `[C0001]` |
| 5 | 文档同步：docs/spec/API.md §1.1 错误约定更新为指向本文档；CHANGELOG 记录 | 目检 |

**完成判定**：

1. `rg -n "raise HTTPException" backend/app` 命中数降为 0（`session_auth.py` 保留的自定义文案场景用 `ApiBusinessError`，不算 HTTPException 直抛；`main.py` handler docstring 中的一处文字命中可忽略）；
2. `rg -n -U 'send\(\s*\n?\s*"error"' backend/app` 全部命中带 `code=`（必须用 `-U` 多行模式——`turn_coordinator.py`/`voice_pipeline.py`/`report_scheduler.py`/`session_registry.py`/`turn_control.py:188`/`connection_lifecycle.py:283,344,388` 等 10 处是多行 `send(\n "error", ...)` 写法，单行模式会漏检）；
3. 前端 `npx tsc --noEmit` 通过；
4. 抽查 5 个代表性错误（404、429、A1005、C0001、B0001），REST envelope 的 code/message/hint/retryable/trace_id 五字段齐全且中文正确；
5. 面试中断开 LLM，WS error 帧 `{"type":"error","code":"C0001",...}` 到达前端并显示 `[C0001] 面试官服务暂时不可用，请稍后重试`。

## 8. 附录：为什么是 A/B/C 三分法而不是纯英文蛇形码

| 方案 | 代表 | 本项目适配性 |
| --- | --- | --- |
| **A/B/C + 域 + 序号（选定）** | 阿里巴巴开发手册错误码规约 | 首字母即"谁的错"：用户（A）/系统（B）/第三方（C）。本项目故障排查的第一分流问题永远是"是用户操作问题、本地系统问题、还是 BYOK 第三方服务问题"，三分法与排查动线完全一致；数字码便于文档检索与用户口述（"我报 C0001"） |
| 纯英文蛇形码（`resume_too_large`） | Stripe | 自描述性好，但无来源分类，且本项目用户面错误文案以中文为主，英文码与中文 message 割裂 |
| 纯数字分段（`10001`） | 部分国内 SaaS | 无字母前缀时首数字既表来源又表域，可读性与扩展性都差于字母+数字 |

信封结构（`error.code/message/trace_id` + details 扩展位）对齐 Google API Design Guide 的 `google.rpc.Status`；`hint`（人可读的下一步建议）参考 Stripe 的 `declined_code`/`doc_url` 人因友好实践，但用内联中文字段而非外链文档，适配本地优先、无公网文档站的场景。
