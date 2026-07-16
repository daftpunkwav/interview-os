/** InterviewOS 前端类型定义 */

/* ====================================================================== */
/* 静态资源（GET /options 等）                                            */
/* ====================================================================== */

export interface LLMSettings {
  api_base: string;
  model: string;
  max_tokens: number;
  context_window: number;
  provider: string;
  protocol?: string;
  reasoning_effort?: string;
  supports_vision?: boolean;
  supports_audio?: boolean;
  stt_model?: string;
  tts_voice?: string;
  has_api_key: boolean;
  updated_at?: string;
  /**
   * 仅在 settings 编辑态下使用,后端 ``LLMSettingsResponse`` 不会返回真实 key。
   * 写入时:留空或传 ``"keep"`` 表示不修改已有 key,新值会被后端 at-rest 加密。
   */
  api_key?: string;
}

/** 写 LLM 设置时携带 ``api_key`` placeholder (``"keep"`` 表示不修改)。 */
export type LLMSettingsWrite = Omit<LLMSettings, "has_api_key" | "updated_at"> & {
  api_key?: string;
};

export interface UserProfile {
  id: number;
  name: string;
  gender?: string;
  identity?: string;
  school?: string;
  major?: string;
  graduation_year?: string;
  job_direction: string;
  experience_years: string;
  work_years_detail?: string;
  current_company?: string;
  expected_salary?: string;
  self_intro?: string;
  tech_domains: string[];
  target_role: string;
  github_username?: string;
  portfolio_url?: string;
  linkedin_url?: string;
  city?: string;
  preferred_languages?: string;
  career_highlights?: string;
  open_to_remote?: string;
  notice_period?: string;
  updated_at?: string;
}

export interface CandidateProfile {
  name: string;
  education: Record<string, string>[];
  work_experience: Record<string, string>[];
  skills: string[];
  projects: Record<string, string>[];
  summary: string;
}

export interface DimensionScore {
  score: number;
  comment?: string;
}

export interface ResumeAnalysis {
  score: number;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  predicted_questions: string[];
  dimension_scores?: Record<string, DimensionScore | number>;
  ats_keywords?: string[];
  missing_keywords?: string[];
  project_deep_dive?: string[];
  red_flags?: string[];
  role_fit_summary?: string;
  seniority_estimate?: string;
  rewrite_examples?: string[];
  interview_risk_areas?: string[];
  overall_narrative?: string;
}

export interface Resume {
  id: number;
  filename: string;
  file_type: string;
  parsed_profile: CandidateProfile;
  is_active?: boolean;
  score?: number | null;
  analysis?: ResumeAnalysis | Record<string, unknown>;
  created_at: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  style: string;
  focus_areas: string[];
  sample_questions: string[];
}

export interface Options {
  roles: string[];
  levels: string[];
  experience_years: string[];
  companies: CompanyInfo[];
  personalities: { id: string; name: string; description: string }[];
  interview_styles: { id: string; name: string; description: string }[];
  workflow_types: { id: string; name: string; phases: string[] }[];
  avatars?: { id: string; name: string; voice?: string }[];
  scenes?: { id: string; name: string }[];
  tts_voices?: { id: string; name: string }[];
}

export interface InterviewConfig {
  role: string;
  level: string;
  company: string;
  workflow_type: string;
  personality: string;
  strictness: number;
  interview_style: string;
  resume_id?: number | null;
  avatar_id?: string;
  scene_id?: string;
}

export interface InterviewSession {
  id: number;
  role: string;
  level: string;
  company: string;
  workflow_type: string;
  personality: string;
  strictness: number;
  interview_style: string;
  avatar_id?: string;
  scene_id?: string;
  status: string;
  current_phase: string;
  overall_score?: number;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface ScoreBreakdown {
  technical: number;
  communication: number;
  project_depth: number;
  problem_solving: number;
  presence?: number;
  overall: number;
}

export interface InterviewReport {
  overall_score: number;
  score_breakdown: ScoreBreakdown;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  resume_suggestions?: string[];
  interview_suggestions?: string[];
  training_plan: string[];
  phase_summary: Record<string, string>;
  face_analysis_summary: string;
  presence_moments?: string[];
}

export interface GrowthRecord {
  id: number;
  session_id: number;
  weak_skills: string[];
  training_plan: string[];
  created_at: string;
}

/* ====================================================================== */
/* 多模态输入                                                              */
/* ====================================================================== */

export interface FaceAnalysis {
  dominant_emotion?: string;
  emotion_scores?: Record<string, number>;
  eye_contact?: boolean;
  smile?: boolean;
  confidence?: number;
  /** 时间戳相对值（毫秒，距录像开始） */
  timestamp_ms?: number;
  [extra: string]: unknown;
}

/* ====================================================================== */
/* SSE 事件（面试准备 / 报告生成）                                          */
/* ====================================================================== */

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

/** 通用 SSE envelope，使用 discriminated union 保留强类型。 */
export type PrepSSEEvent =
  | { type: "token"; content: string }
  | { type: "done"; token_usage: number }
  | SSEErrorEvent;

export type ReportSSEEvent =
  | { type: "token"; content: string }
  | { type: "done"; report: InterviewReport; token_usage: number }
  | SSEErrorEvent;

/* ====================================================================== */
/* WebSocket 事件（实时面试）                                              */
/* ====================================================================== */

export type TurnState = "IDLE" | "AI_SPEAKING" | "USER_SPEAKING" | "PROCESSING";

export type ServerEvent =
  | { type: "turn_state"; state: TurnState }
  | { type: "assistant_token"; token: string; phase?: string }
  | {
      type: "assistant_done";
      content: string;
      phase: string;
      emotion?: string;
      is_complete: boolean;
      audio_b64?: string;
    }
  | { type: "assistant_audio_start" }
  | { type: "assistant_audio_chunk"; data: string; idx?: number }
  | { type: "assistant_audio_end" }
  | { type: "stt_partial"; text: string }
  | { type: "stt_final"; text: string }
  | { type: "tts_audio"; data: string; mime?: string }
  | { type: "silence_nudge"; content: string }
  | { type: "reference_hint_loading"; question: string }
  | { type: "reference_hint"; content: string; question: string }
  | { type: "phase_changed"; phase: string }
  | { type: "interview_complete"; report_id?: number }
  | { type: "server_ping"; t: number }
  | SSEErrorEvent;

export type ClientEvent =
  | {
      type: "user_text";
      text: string;
      face_analysis?: FaceAnalysis;
      image_base64?: string;
    }
  | { type: "user_turn_end"; pcm: string; sample_rate: number }
  | { type: "stt_text"; text: string }
  | { type: "silence_timeout" }
  | { type: "request_hint"; question: string }
  | { type: "vision_update"; face_analysis: FaceAnalysis }
  | { type: "pong"; t: number };

/* ====================================================================== */
/* REST API 响应契约                                                       */
/* ====================================================================== */

export interface StartInterviewResponse {
  message?: ChatMessage;
  current_phase: string;
}

export interface SendMessageResponse {
  message: ChatMessage;
  current_phase: string;
  is_complete: boolean;
  phases_remaining: number;
}

export interface FinishInterviewResponse {
  session_id: number;
  status: string;
  overall_score?: number;
}

export interface ResumeActivateResponse {
  id: number;
  is_active: boolean;
}

export interface GetReportResponse {
  session_id: number;
  report: InterviewReport;
  duration_minutes?: number;
}

export interface PrepSessionCreateResponse {
  id: number;
}

export interface PrepMessageResponse {
  reply: string;
  token_usage: number;
}

export interface LLMTestResponse {
  success: boolean;
  message: string;
  model?: string | null;
}

/* ====================================================================== */
/* 错误响应统一 envelope（与后端 ``app.schemas.APIError`` 一一对齐）        */
/* ====================================================================== */

export interface ApiErrorBody {
  code: string;
  message: string;
  trace_id?: string;
}

export interface ApiErrorEnvelope {
  /** 旧字段，向后兼容 */
  detail?: string;
  /** 新统一字段 */
  error?: ApiErrorBody;
}
