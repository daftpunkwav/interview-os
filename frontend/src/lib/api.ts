/** API 客户端封装 */

const BASE = "/api";

/** 解析后端错误响应（兼容非 JSON 的 500/HTML 代理错误） */
async function parseErrorResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `请求失败: ${res.status}`;

  try {
    const data = JSON.parse(text) as { detail?: unknown; message?: string };
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => (typeof item === "object" && item && "msg" in item ? String((item as { msg: string }).msg) : String(item)))
        .join("; ");
    }
    if (data.detail) return JSON.stringify(data.detail);
    if (data.message) return data.message;
  } catch {
    // 非 JSON，如 Next 代理返回的 Internal Server Error
  }

  if (/internal server error/i.test(text)) {
    return "后端服务不可用，请确认 backend 已在 localhost:8000 启动";
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
    });
  } catch {
    throw new Error("无法连接后端服务，请确认 backend 已在 localhost:8000 启动");
  }

  if (!res.ok) {
    throw new Error(await parseErrorResponse(res));
  }

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("服务器返回了无效的 JSON 响应");
  }
}

export const api = {
  // LLM 设置
  getLLMSettings: () => request<import("@/types").LLMSettings>("/settings/llm"),
  updateLLMSettings: (data: Record<string, unknown>) =>
    request<import("@/types").LLMSettings>("/settings/llm", { method: "PUT", body: JSON.stringify(data) }),
  testLLM: () => request<{ success: boolean; message: string }>("/settings/llm/test", { method: "POST" }),

  // 档案
  getProfile: () => request<import("@/types").UserProfile>("/profile"),
  updateProfile: (data: Partial<import("@/types").UserProfile>) =>
    request<import("@/types").UserProfile>("/profile", { method: "PUT", body: JSON.stringify(data) }),

  // 简历
  uploadResume: async (file: File): Promise<import("@/types").Resume> => {
    let res: Response;
    try {
      const form = new FormData();
      form.append("file", file);
      res = await fetch(`${BASE}/resume/upload`, { method: "POST", body: form });
    } catch {
      throw new Error("无法连接后端服务，请确认 backend 已在 localhost:8000 启动");
    }
    if (!res.ok) throw new Error(await parseErrorResponse(res));
    const text = await res.text();
    if (!text) throw new Error("服务器返回了空响应");
    try {
      return JSON.parse(text) as import("@/types").Resume;
    } catch {
      throw new Error("服务器返回了无效的 JSON 响应");
    }
  },
  listResumes: () => request<import("@/types").Resume[]>("/resume/list"),
  activateResume: (id: number) => request<{ id: number; is_active: boolean }>(`/resume/${id}/activate`, { method: "POST" }),
  analyzeResume: (id: number) => request<import("@/types").ResumeAnalysis>(`/resume/${id}/analyze`, { method: "POST" }),

  // 面试准备
  createPrepSession: (data: { resume_id?: number; target_role?: string; target_company?: string }) =>
    request<{ id: number }>("/v1/prep/sessions", { method: "POST", body: JSON.stringify(data) }),
  prepMessage: (sessionId: number, content: string) =>
    request<{ reply: string; token_usage: number }>(`/v1/prep/sessions/${sessionId}/message`, {
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
      res = await fetch(`${BASE}/v1/prep/sessions/${sessionId}/message/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch {
      throw new Error("无法连接后端服务，请确认 backend 已在 localhost:8000 启动");
    }
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }
    if (!res.body) throw new Error("流式响应不可用");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let tokenUsage = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6)) as {
          type: string;
          content?: string;
          token_usage?: number;
          message?: string;
        };
        if (payload.type === "token" && payload.content) {
          onToken(payload.content);
        } else if (payload.type === "done") {
          tokenUsage = payload.token_usage ?? 0;
        } else if (payload.type === "error") {
          throw new Error(payload.message || "流式输出失败");
        }
      }
    }
    return { token_usage: tokenUsage };
  },

  // 选项
  getOptions: () => request<import("@/types").Options>("/options"),

  // 面试
  createSession: (config: import("@/types").InterviewConfig) =>
    request<import("@/types").InterviewSession>("/interview/sessions", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  listSessions: () => request<import("@/types").InterviewSession[]>("/interview/sessions"),
  getSession: (id: number) => request<import("@/types").InterviewSession>(`/interview/sessions/${id}`),
  startInterview: (id: number) =>
    request<{ message: import("@/types").ChatMessage; current_phase: string }>(
      `/interview/sessions/${id}/start`,
      { method: "POST" }
    ),
  sendMessage: (id: number, content: string, faceAnalysis?: Record<string, unknown>, imageBase64?: string) =>
    request<{
      message: import("@/types").ChatMessage;
      current_phase: string;
      is_complete: boolean;
      phases_remaining: string[];
    }>(`/interview/sessions/${id}/message`, {
      method: "POST",
      body: JSON.stringify({ content, face_analysis: faceAnalysis, image_base64: imageBase64 }),
    }),
  getMessages: (id: number) => request<import("@/types").ChatMessage[]>(`/interview/sessions/${id}/messages`),
  finishInterview: (id: number) =>
    request<{ session_id: number; status: string; overall_score?: number }>(
      `/interview/sessions/${id}/finish`,
      { method: "POST" }
    ),

  // 报告
  getReport: (id: number) =>
    request<{ session_id: number; report: import("@/types").InterviewReport; duration_minutes?: number }>(
      `/reports/${id}`
    ),
  getGrowthHistory: () => request<import("@/types").GrowthRecord[]>("/reports/growth/history"),
};
