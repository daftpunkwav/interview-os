/**
 * 面试阶段展示映射
 *
 * 后端 ``app/services/interview/workflows.py`` 内的 phase 列表与此处一一对应。
 * 阶段名修改时需同步修改后端；新增阶段要么先在后端加，再到此处填文案。
 */
export const PHASE_LABELS: Record<string, string> = {
  identity_check: "身份确认",
  self_intro: "自我介绍",
  basic_knowledge: "基础知识",
  project_deep_dive: "项目深挖",
  technical_deep: "技术深挖",
  system_design: "系统设计",
  scenario: "情景问题",
  reverse_qa: "反问环节",
  summary: "总结评价",
} as const;

export const PHASE_ORDER: readonly string[] = [
  "identity_check",
  "self_intro",
  "basic_knowledge",
  "project_deep_dive",
  "technical_deep",
  "system_design",
  "scenario",
  "reverse_qa",
  "summary",
] as const;
