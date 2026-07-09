/** API 客户端封装
 *
 * 所有接口返回类型严格基于 ``src/types``：
 * - REST 调用走 Next rewrites（``/api/* → localhost:8000/*``）；
 * - 流式调用走 ``NEXT_PUBLIC_STREAM_API_BASE``，避免 Next 缓冲；
 * - 错误信息解析兼容 FastAPI 的 ``{detail: ...}``。
 */

import type {
  ChatMessage,
  FaceAnalysis,
  FinishInterviewResponse,
  GetReportResponse,
  GrowthRecord,
  InterviewConfig,
  InterviewReport,
  InterviewSession,
  LLMSettings,
  LLMTestResponse,
  Options,
  PrepMessageResponse,
  PrepSessionCreateResponse,
  PrepSSEEvent,
  ReportSSEEvent,
  Resume,
  ResumeActivateResponse,
  ResumeAnalysis,
  StartInterviewResponse,
  SendMessageResponse,
  UserProfile,
} from "@/types";
import { getEnv } from "@/lib/env";

/* ====================================================================== */
/* 通用 fetch 封装                                                          */
/* ====================================================================== */

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function parseErrorResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `请求失败: ${res.status}`;

  try {
    const data = JSON.parse(text) as {
      detail?: unknown;
      message?: string;
      error?: { code?: string; message?: string; trace_id?: string };
    };
    // 优先读取统一 envelope (main.py 的 _envelope)
    if (data.error?.message) return data.error.message;
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) =>
          typeof item === "object" && item && "msg" in item
            ? String((item as { msg: string }).msg)
            : String(item),
        )
        .join("; ");
    }
    if (data.detail) return JSON.stringify(data.detail);
    if (data.message) return data.message;
  } catch {
    // 非 JSON
  }
  if (/internal server error/i.test(text)) {
    return "后端服务不可用，请确认 backend 已在 localhost:8000 启动";
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: externalSignal, ...rest } = options;
  // 组合外部 signal 与超时 signal，任一触发即取消。
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("request timeout")), timeoutMs);
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new ApiError("请求已取消", 0);
    }
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      headers: { "Content-Type": "application/json", ...rest.headers },
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError("请求超时或被取消", 0);
    }
    throw new ApiError("无法连接后端服务，请确认 backend 已在 localhost:8000 启动", 0);
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
  if (!res.ok) {
    throw new ApiError(await parseErrorResponse(res), res.status);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("服务器返回了无效的 JSON 响应", res.status);
  }
}

/* ====================================================================== */
/* 流式响应解析                                                              */
/* ====================================================================== */

interface SSERawEvent {
  type?: unknown;
  content?: unknown;
  token_usage?: unknown;
  message?: unknown;
  report?: unknown;
}

function isSsePayload(value: unknown): value is SSERawEvent {
  return typeof value === "object" && value !== null;
}

/** 流式 SSE 解析器：消费 ``onEvent`` 回调；遇到错误抛 ``ApiError``。 */
async function consumeSSE<TEvent extends { type: string }>(
  res: Response,
  onEvent: (event: TEvent) => void,
): Promise<void> {
  if (!res.body) throw new ApiError("流式响应不可用", res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(trimmed.slice(6));
      } catch {
        continue; // 跳过畸形行而不是中断整个流
      }
      if (!isSsePayload(payload)) continue;
      onEvent(payload as TEvent);
    }
  }
}

/* ====================================================================== */
/* API 表面                                                                 */
/* ====================================================================== */

export const api = {
  /* LLM 设置 */
  getLLMSettings: () => request<LLMSettings>("/settings/llm"),
  updateLLMSettings: (data: Partial<import("@/types").LLMSettingsWrite>) =>
    request<LLMSettings>("/settings/llm", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testLLM: () => request<LLMTestResponse>("/settings/llm/test", { method: "POST" }),

  /* 档案 */
  getProfile: () => request<UserProfile>("/profile"),
  updateProfile: (data: Partial<UserProfile>) =>
    request<UserProfile>("/profile", { method: "PUT", body: JSON.stringify(data) }),

  /* 简历 */
  uploadResume: async (file: File): Promise<Resume> => {
    let res: Response;
    try {
      const form = new FormData();
      form.append("file", file);
      res = await fetch("/api/resume/upload", { method: "POST", body: form });
    } catch {
      throw new ApiError("无法连接后端服务", 0);
    }
    if (!res.ok) throw new ApiError(await parseErrorResponse(res), res.status);
    const text = await res.text();
    if (!text) throw new ApiError("服务器返回了空响应", res.status);
    try {
      return JSON.parse(text) as Resume;
    } catch {
      throw new ApiError("服务器返回了无效的 JSON 响应", res.status);
    }
  },
  listResumes: () => request<Resume[]>("/resume/list"),
  activateResume: (id: number) =>
    request<ResumeActivateResponse>(`/resume/${id}/activate`, { method: "POST" }),
  analyzeResume: (id: number) =>
    request<ResumeAnalysis>(`/resume/${id}/analyze`, { method: "POST" }),

  /* 面试准备 */
  createPrepSession: (data: {
    resume_id?: number;
    target_role?: string;
    target_company?: string;
  }) =>
    request<PrepSessionCreateResponse>("/v1/prep/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  prepMessage: (sessionId: number, content: string) =>
    request<PrepMessageResponse>(`/v1/prep/sessions/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  prepMessageStream: async (
    sessionId: number,
    content: string,
    onToken: (token: string) => void,
  ): Promise<{ token_usage: number }> => {
    let res: Response;
    try {
      res = await fetch(
        `${getEnv().STREAM_API_BASE}/api/v1/prep/sessions/${sessionId}/message/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
    } catch {
      throw new ApiError("无法连接后端服务", 0);
    }
    if (!res.ok) throw new ApiError(await parseErrorResponse(res), res.status);

    let tokenUsage = 0;
    await consumeSSE<PrepSSEEvent>(res, (event) => {
      if (event.type === "token" && typeof event.content === "string") {
        onToken(event.content);
      } else if (event.type === "done") {
        tokenUsage = event.token_usage;
      } else if (event.type === "error") {
        throw new ApiError(event.message || "流式输出失败", res.status);
      }
    });
    return { token_usage: tokenUsage };
  },

  /* 选项 */
  getOptions: () => request<Options>("/options"),

  /* 面试 */
  createSession: (config: InterviewConfig) =>
    request<InterviewSession>("/interview/sessions", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  listSessions: () => request<InterviewSession[]>("/interview/sessions"),
  getSession: (id: number) =>
    request<InterviewSession>(`/interview/sessions/${id}`),
  startInterview: (id: number) =>
    request<StartInterviewResponse>(`/interview/sessions/${id}/start`, {
      method: "POST",
    }),
  sendMessage: (id: number, content: string, faceAnalysis?: FaceAnalysis, imageBase64?: string) =>
    request<SendMessageResponse>(`/interview/sessions/${id}/message`, {
      method: "POST",
      body: JSON.stringify({
        content,
        face_analysis: faceAnalysis,
        image_base64: imageBase64,
      }),
    }),
  getMessages: (id: number) => request<ChatMessage[]>(`/interview/sessions/${id}/messages`),
  finishInterview: (id: number) =>
    request<FinishInterviewResponse>(`/interview/sessions/${id}/finish`, {
      method: "POST",
    }),

  /* 报告 */
  getReport: (id: number) => request<GetReportResponse>(`/reports/${id}`),
  getGrowthHistory: () => request<GrowthRecord[]>("/reports/growth/history"),

  /** 流式获取报告（备用入口；当前未在页面中使用，但保留以备扩展） */
  streamReport: async (id: number, onToken: (t: string) => void) => {
    const res = await fetch(`${getEnv().STREAM_API_BASE}/api/reports/${id}/stream`, {
      headers: { Accept: "text/event-stream" },
    });
    if (!res.ok) throw new ApiError(await parseErrorResponse(res), res.status);
    await consumeSSE<ReportSSEEvent>(res, (event) => {
      if (event.type === "token" && typeof event.content === "string") onToken(event.content);
    });
    return {} satisfies Partial<Pick<InterviewReport, "overall_score">>;
  },
};

export { ApiError };
