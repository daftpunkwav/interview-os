/** API 客户端封装 */

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `请求失败: ${res.status}`);
  }
  return res.json();
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
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/resume/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json()).detail || "上传失败");
    return res.json();
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
