"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LLMSettings } from "@/types";
import { Save, Zap, Loader2, CheckCircle, XCircle } from "lucide-react";

const PROVIDERS = [
  { id: "openai", name: "OpenAI", base: "https://api.openai.com/v1" },
  { id: "stepfun", name: "StepFun", base: "https://api.stepfun.com/step_plan/v1" },
  { id: "deepseek", name: "DeepSeek", base: "https://api.deepseek.com/v1" },
  { id: "openrouter", name: "OpenRouter", base: "https://openrouter.ai/api/v1" },
  { id: "custom", name: "自定义", base: "" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<LLMSettings & { api_key?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.getLLMSettings().then((s) => setSettings({ ...s, api_key: "" }));
  }, []);

  const handleProviderChange = (providerId: string) => {
    if (!settings) return;
    const p = PROVIDERS.find((x) => x.id === providerId);
    setSettings({
      ...settings,
      provider: providerId,
      api_base: p?.base || settings.api_base,
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.updateLLMSettings({
        api_base: settings.api_base,
        api_key: settings.api_key || "keep",
        model: settings.model,
        max_tokens: settings.max_tokens,
        context_window: settings.context_window,
        provider: settings.provider,
      });
      setMsg("保存成功");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testLLM();
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : "测试失败" });
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return <div className="p-8 flex items-center gap-2 text-[var(--muted)]"><Loader2 className="animate-spin" size={18} /> 加载中...</div>;
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">BYOK 设置</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Bring Your Own Key — 使用你自己的 LLM API，数据完全本地存储。
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">服务商</label>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  settings.provider === p.id
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-[var(--border)] hover:border-brand-300"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <Field label="API Base URL" value={settings.api_base} onChange={(v) => setSettings({ ...settings, api_base: v })} />
        <Field
          label="API Key"
          value={settings.api_key || ""}
          onChange={(v) => setSettings({ ...settings, api_key: v })}
          type="password"
          placeholder={settings.has_api_key ? "已配置（留空保持不变）" : "输入 API Key"}
        />
        <Field label="模型名称" value={settings.model} onChange={(v) => setSettings({ ...settings, model: v })} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max Tokens" value={String(settings.max_tokens)} onChange={(v) => setSettings({ ...settings, max_tokens: Number(v) })} />
          <Field label="上下文窗口" value={String(settings.context_window)} onChange={(v) => setSettings({ ...settings, context_window: Number(v) })} />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          保存
        </button>
        <button onClick={handleTest} disabled={testing} className="btn-secondary flex items-center gap-2">
          {testing ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
          测试连接
        </button>
        {msg && <span className="text-sm text-green-600">{msg}</span>}
      </div>

      {testResult && (
        <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${testResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {testResult.success ? <CheckCircle size={16} className="mt-0.5" /> : <XCircle size={16} className="mt-0.5" />}
          <span>{testResult.message}</span>
        </div>
      )}

      <style jsx global>{`
        .input { @apply w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-300; }
        .btn-primary { @apply px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50; }
        .btn-secondary { @apply px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-gray-50 disabled:opacity-50; }
      `}</style>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
