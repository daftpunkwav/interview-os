/**
 * LLM Provider 预设
 *
 * 由设置页与 API 客户端共用；新增 provider 只需要在这里加一行。
 * 真实的 base-url 拼接 / SSRF 校验在后端 ``PUT /api/settings/llm`` 进行。
 */
export interface LLMProviderPreset {
  /** 数据库保存的 provider id */
  id: string;
  /** 用户可见名称 */
  name: string;
  /** 默认 API 基础地址（不含 /chat/completions 后缀） */
  base: string;
}

export const LLM_PROVIDERS: readonly LLMProviderPreset[] = [
  { id: "openai", name: "OpenAI", base: "https://api.openai.com/v1" },
  { id: "stepfun", name: "StepFun", base: "https://api.stepfun.com/step_plan/v1" },
  { id: "deepseek", name: "DeepSeek", base: "https://api.deepseek.com/v1" },
  { id: "openrouter", name: "OpenRouter", base: "https://openrouter.ai/api/v1" },
  { id: "custom", name: "自定义", base: "" },
] as const;

export const DEFAULT_LLM_PROVIDER_ID = "openai";
