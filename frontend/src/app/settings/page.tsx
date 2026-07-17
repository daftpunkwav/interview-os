"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LLM_PROVIDERS } from "@/config/providers";
import type { LLMSettings } from "@/types";
import { Save, Zap, Loader2, CheckCircle, XCircle, Settings2, KeyRound, Cpu, Mic } from "lucide-react";
import { LoadError } from "@/components/LoadError";

export default function SettingsPage() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [msg, setMsg] = useState("");

  const loadSettings = () => {
    setLoading(true);
    setLoadError("");
    api
      .getLLMSettings()
      .then((s) => setSettings({ ...s, api_key: "" }))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleProviderChange = (providerId: string) => {
    if (!settings) return;
    const p = LLM_PROVIDERS.find((x) => x.id === providerId);
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
      setMsg("已保存");
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
    <div className="page-shell !max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="page-header !mb-0">
          <div className="icon-badge">
            <Settings2 size={20} />
          </div>
          <div>
            <h1 className="page-title">BYOK 设置</h1>
            <p className="page-desc">Bring Your Own Key — 密钥本地加密，数据不出本机。</p>
          </div>
        </div>
        {settings && (
          <div className="flex items-center gap-2 shrink-0">
            {msg && (
              <span
                className={`text-sm font-medium ${
                  msg.includes("失败") ? "text-[var(--danger-ink)]" : "text-[var(--success-ink)]"
                }`}
              >
                {msg}
              </span>
            )}
            <button type="button" onClick={handleTest} disabled={testing} className="btn-secondary">
              {testing ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
              测试
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)] py-16 justify-center">
          <Loader2 className="animate-spin text-[var(--brand)]" size={18} /> 加载设置…
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={loadSettings} />
      ) : settings ? (
        <div className="space-y-4">
          {/* 连接 */}
          <Section icon={KeyRound} title="连接配置" hint="服务商与密钥">
            <div className="mb-4">
              <label className="field-label">服务商</label>
              <div className="flex flex-wrap gap-2">
                {LLM_PROVIDERS.map((p) => {
                  const active = settings.provider === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handleProviderChange(p.id)}
                      className={`h-9 px-3.5 rounded-[var(--radius)] text-sm border transition-colors ${
                        active
                          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)] font-medium"
                          : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]/40 hover:bg-[var(--brand-softer)]"
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="API Base URL"
                value={settings.api_base}
                onChange={(v) => setSettings({ ...settings, api_base: v })}
                className="sm:col-span-2"
              />
              <Field
                label="API Key"
                value={settings.api_key || ""}
                onChange={(v) => setSettings({ ...settings, api_key: v })}
                type="password"
                placeholder={settings.has_api_key ? "已配置（留空保持不变）" : "输入 API Key"}
                className="sm:col-span-2"
              />
              <Field
                label="模型名称"
                value={settings.model}
                onChange={(v) => setSettings({ ...settings, model: v })}
                className="sm:col-span-2"
              />
            </div>
          </Section>

          {/* 模型参数 */}
          <Section icon={Cpu} title="模型参数" hint="生成与上下文">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Max Tokens"
                value={String(settings.max_tokens)}
                onChange={(v) => setSettings({ ...settings, max_tokens: Number(v) || 0 })}
              />
              <Field
                label="上下文窗口"
                value={String(settings.context_window)}
                onChange={(v) => setSettings({ ...settings, context_window: Number(v) || 0 })}
              />
              <div>
                <label className="field-label">API 协议</label>
                <select
                  className="field-input"
                  value={settings.protocol || "openai_chat"}
                  onChange={(e) => setSettings({ ...settings, protocol: e.target.value })}
                >
                  <option value="openai_chat">OpenAI Chat Completions</option>
                  <option value="openai_responses">OpenAI Responses</option>
                  <option value="anthropic_messages">Anthropic Messages</option>
                </select>
              </div>
              <div>
                <label className="field-label">思考等级</label>
                <select
                  className="field-input"
                  value={settings.reasoning_effort || "medium"}
                  onChange={(e) => setSettings({ ...settings, reasoning_effort: e.target.value })}
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-5 mt-4 pt-4 border-t border-[var(--border)]">
              <Toggle
                checked={settings.supports_vision ?? true}
                onChange={(v) => setSettings({ ...settings, supports_vision: v })}
                label="视觉多模态"
              />
              <Toggle
                checked={settings.supports_audio ?? false}
                onChange={(v) => setSettings({ ...settings, supports_audio: v })}
                label="音频多模态"
              />
            </div>
          </Section>

          {/* 语音 */}
          <Section icon={Mic} title="语音" hint="STT / TTS">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Whisper 模型"
                value={settings.stt_model || "base"}
                onChange={(v) => setSettings({ ...settings, stt_model: v })}
              />
              <Field
                label="Edge TTS 音色"
                value={settings.tts_voice || "zh-CN-XiaoxiaoNeural"}
                onChange={(v) => setSettings({ ...settings, tts_voice: v })}
              />
            </div>
          </Section>

          {testResult && (
            <div className={`alert ${testResult.success ? "alert-success" : "alert-error"}`}>
              {testResult.success ? (
                <CheckCircle size={16} className="mt-0.5 shrink-0" />
              ) : (
                <XCircle size={16} className="mt-0.5 shrink-0" />
              )}
              <span className="text-sm leading-relaxed break-words">{testResult.message}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5 sm:p-6">
      <header className="flex items-center gap-2.5 mb-5 pb-3 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--brand-softer)] text-[var(--brand)] flex items-center justify-center">
          <Icon size={16} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {hint && <p className="text-xs text-[var(--muted)] mt-0.5">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      <input
        className="field-input font-mono text-[13px]"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-[var(--text-secondary)]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          checked ? "bg-[var(--brand)]" : "bg-[#c4c7c5]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
      {label}
    </label>
  );
}
