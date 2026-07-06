/** InterviewOS 前端类型定义 */

export interface LLMSettings {
  api_base: string;
  model: string;
  max_tokens: number;
  context_window: number;
  provider: string;
  has_api_key: boolean;
  updated_at?: string;
}

export interface UserProfile {
  id: number;
  name: string;
  job_direction: string;
  experience_years: string;
  tech_domains: string[];
  target_role: string;
}

export interface CandidateProfile {
  name: string;
  education: Record<string, string>[];
  work_experience: Record<string, string>[];
  skills: string[];
  projects: Record<string, string>[];
  summary: string;
}

export interface Resume {
  id: number;
  filename: string;
  file_type: string;
  parsed_profile: CandidateProfile;
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
  overall: number;
}

export interface InterviewReport {
  overall_score: number;
  score_breakdown: ScoreBreakdown;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  training_plan: string[];
  phase_summary: Record<string, string>;
  face_analysis_summary: string;
}

export interface GrowthRecord {
  id: number;
  session_id: number;
  weak_skills: string[];
  training_plan: string[];
  created_at: string;
}
