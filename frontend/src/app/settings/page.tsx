"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { LLMSettings } from "@/types";
import { Save, Zap, Loader2, CheckCircle, XCircle, Settings2 } from "lucide-react";
import { LoadError } from "@/components/LoadError";

const PROVIDERS = [
  { id: "openai", name: "OpenAI", base: "https://api.openai.com/v1" },
  { id: "stepfun", name: "StepFun", base: "https://api.stepfun.com/step_plan/v1" },
  { id: "deepseek", name: "DeepSeek", base: "https://api.deepseek.com/v1" },
  { id: "openrouter", name: "OpenRouter", base: "https://openrouter.ai/api/v1" },
  { id: "custom", name: "自定义", base: "" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<LLMSettings & { api_key?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [msg, setMsg] = useState("");

  const loadSettings = () => {
    setLoading(true);
    setLoadError("");
    api.getLLMSettings()
      .then((s) => setSettings({ ...s, api_key: "" }))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
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
        protocol: settings.protocol || "openai_chat",
        reasoning_effort: settings.reasoning_effort || "medium",
        supports_vision: settings.supports_vision ?? true,
        supports_audio: settings.supports_audio ?? false,
        stt_model: settings.stt_model || "base",
        tts_voice: settings.tts_voice || "zh-CN-XiaoxiaoNeural",
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

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
          <Settings2 className="text-white" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">BYOK 设置</h1>
          <p className="text-sm text-[var(--muted)]">
            Bring Your Own Key — 使用你自己的 LLM API，数据完全本地存储。
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)] mt-6">
          <Loader2 className="animate-spin" size={18} /> 加载中...
        </div>
      ) : loadError ? (
        <div className="mt-6">
          <LoadError message={loadError} onRetry={loadSettings} />
        </div>
      ) : settings ? (
        <>
      <div className="space-y-4 mt-6">
        <div>
            <label className="block text-sm font-medium mb-2">服务商</label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <motion.button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    settings.provider === p.id
                      ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                      : "border-[var(--border)] hover:border-brand-300"
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {p.name}
                </motion.button>
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

        <div>
            <label className="block text-sm font-medium mb-1.5">API 协议</label>
            <select
              className="input"
              value={settings.protocol || "openai_chat"}
              onChange={(e) => setSettings({ ...settings, protocol: e.target.value })}
            >
              <option value="openai_chat">OpenAI Chat Completions</option>
              <option value="openai_responses">OpenAI Responses</option>
              <option value="anthropic_messages">Anthropic Messages</option>
            </select>
          </div>

        <div>
            <label className="block text-sm font-medium mb-1.5">思考等级 (reasoning_effort)</label>
            <select
              className="input"
              value={settings.reasoning_effort || "medium"}
              onChange={(e) => setSettings({ ...settings, reasoning_effort: e.target.value })}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Whisper 模型" value={settings.stt_model || "base"} onChange={(v) => setSettings({ ...settings, stt_model: v })} />
          <Field label="Edge TTS 音色" value={settings.tts_voice || "zh-CN-XiaoxiaoNeural"} onChange={(v) => setSettings({ ...settings, tts_voice: v })} />
        </div>

        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.supports_vision ?? true} onChange={(e) => setSettings({ ...settings, supports_vision: e.target.checked })} />
            支持视觉多模态
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.supports_audio ?? false} onChange={(e) => setSettings({ ...settings, supports_audio: e.target.checked })} />
            支持音频多模态
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <motion.button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          保存
        </motion.button>
        <motion.button
          onClick={handleTest}
          disabled={testing}
          className="btn-secondary flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {testing ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
          测试连接
        </motion.button>
        {msg && (
          <motion.span
            className="text-sm text-green-600"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            {msg}
          </motion.span>
        )}
      </div>

      {testResult && (
        <motion.div
          className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${testResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {testResult.success ? <CheckCircle size={16} className="mt-0.5" /> : <XCircle size={16} className="mt-0.5" />}
          <span>{testResult.message}</span>
        </motion.div>
      )}
        </>
      ) : null}

      <style jsx global>{`
        .input { @apply w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-300; }
        .btn-primary { @apply px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors; }
        .btn-secondary { @apply px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors; }
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
