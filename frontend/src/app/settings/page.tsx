"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { LLMSettings, LLMTestResponse, VoiceCatalog, VoiceProviderOption } from "@/types";
import {
  Save,
  Zap,
  Loader2,
  CheckCircle,
  XCircle,
  Settings2,
  Brain,
  Mic,
  Volume2,
} from "lucide-react";
import { LoadError } from "@/components/LoadError";

type StageKey = "recognize" | "reason" | "speak";

const KEEP = "keep";

export default function SettingsPage() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<StageKey | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<StageKey, LLMTestResponse>>>({});
  const [msg, setMsg] = useState("");

  const loadSettings = () => {
    setLoading(true);
    setLoadError("");
    Promise.all([api.getLLMSettings(), api.getVoiceCatalog()])
      .then(([s, c]) => {
        setSettings({
          ...s,
          api_key: "",
          asr_api_key: "",
          asr_api_secret: "",
          asr_access_key: "",
          tts_api_key: "",
          speech_recognize_handler: s.speech_recognize_handler || "local",
          speech_recognize_mode: s.speech_recognize_mode || "transcribe",
          speech_speak_handler: s.speech_speak_handler || "edge",
          speech_speak_mode: s.speech_speak_mode || "tts_from_text",
        });
        setCatalog(c);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const comboWarning = useMemo(() => {
    if (!settings) return "";
    const same =
      settings.speech_recognize_handler &&
      settings.speech_recognize_handler === settings.provider &&
      settings.provider === settings.speech_speak_handler;
    if (same) {
      return "三阶段都选了同一语音 LLM：允许，但面试思考更建议仍用 MiniMax 文本模型。";
    }
    return "";
  }, [settings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.updateLLMSettings({
        api_base: settings.api_base,
        api_key: settings.api_key || KEEP,
        model: settings.model,
        max_tokens: settings.max_tokens,
        context_window: settings.context_window,
        provider: settings.provider,
        protocol: settings.protocol || "openai_chat",
        reasoning_effort: settings.reasoning_effort || "medium",
        supports_vision: settings.supports_vision ?? true,
        supports_audio: settings.supports_audio ?? false,
        stt_model: settings.asr_model || settings.stt_model || "base",
        tts_voice: settings.tts_voice || "zh-CN-XiaoxiaoNeural",
        speech_recognize_handler: settings.speech_recognize_handler || "local",
        speech_recognize_mode: settings.speech_recognize_mode || "transcribe",
        asr_api_base: settings.asr_api_base || "",
        asr_api_key: settings.asr_api_key || KEEP,
        asr_model: settings.asr_model || "",
        asr_app_id: settings.asr_app_id || "",
        asr_api_secret: settings.asr_api_secret || KEEP,
        asr_access_key: settings.asr_access_key || KEEP,
        asr_resource_id: settings.asr_resource_id || "",
        asr_app_key: settings.asr_app_key || "",
        speech_speak_handler: settings.speech_speak_handler || "edge",
        speech_speak_mode: settings.speech_speak_mode || "tts_from_text",
        tts_api_base: settings.tts_api_base || "",
        tts_api_key: settings.tts_api_key || KEEP,
        tts_model: settings.tts_model || "",
      });
      setSettings({
        ...updated,
        api_key: "",
        asr_api_key: "",
        asr_api_secret: "",
        asr_access_key: "",
        tts_api_key: "",
      });
      setMsg("已保存");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (stage: StageKey) => {
    setTesting(stage);
    try {
      const result = await api.testPipelineStage(stage);
      setTestResults((prev) => ({ ...prev, [stage]: result }));
      if (result.audio_base64 && stage === "speak") {
        try {
          const bin = atob(result.audio_base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          void audio.play().finally(() => URL.revokeObjectURL(url));
        } catch {
          /* 试听失败不影响测试结果展示 */
        }
      }
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [stage]: {
          success: false,
          message: e instanceof Error ? e.message : "测试失败",
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const pickRecognize = (p: VoiceProviderOption) => {
    if (!settings) return;
    setSettings({
      ...settings,
      speech_recognize_handler: p.id,
      speech_recognize_mode:
        p.recognize_via === "native_audio" ? "native_audio" : "transcribe",
      asr_api_base: p.default_api_base || settings.asr_api_base || "",
      asr_model: p.default_model || settings.asr_model || "",
    });
  };

  const pickReason = (p: VoiceProviderOption) => {
    if (!settings) return;
    setSettings({
      ...settings,
      provider: p.id === "zhipu_glm4_voice" ? "zhipu_glm4_voice" : p.id,
      api_base: p.default_api_base || settings.api_base,
      model: p.default_model || settings.model,
    });
  };

  const pickSpeak = (p: VoiceProviderOption) => {
    if (!settings) return;
    let mode = "tts_from_text";
    if (p.id === "none") mode = "text_only";
    else if (p.speak_via === "native_audio") mode = "native_audio";
    setSettings({
      ...settings,
      speech_speak_handler: p.id,
      speech_speak_mode: mode,
      tts_api_base: p.default_api_base || settings.tts_api_base || "",
      tts_model: p.default_model || settings.tts_model || "",
      tts_voice:
        p.id === "edge"
          ? settings.tts_voice || "zh-CN-XiaoxiaoNeural"
          : p.id === "minimax_speech"
            ? settings.tts_voice || "male-qn-qingse"
            : settings.tts_voice,
    });
  };

  return (
    <div className="page-shell !max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="page-header !mb-0">
          <div className="icon-badge">
            <Settings2 size={20} />
          </div>
          <div>
            <h1 className="page-title">三处理器设置</h1>
            <p className="page-desc">
              语音识别 → 面试思考 → 语音输出，各自独立指派；密钥本地加密。
            </p>
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
      ) : settings && catalog ? (
        <div className="space-y-4">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--brand-softer)]/40 px-4 py-3 text-sm text-[var(--text-secondary)]">
            推荐组合：识别 = ASR（如 SenseVoice / 讯飞）· 思考 = MiniMax · 播报 = Edge 或 MiniMax Speech
          </div>
          {comboWarning && (
            <div className="alert alert-error text-sm">{comboWarning}</div>
          )}

          {/* 阶段 1 */}
          <StageSection
            icon={Mic}
            title="语音识别处理器"
            hint="听麦 → 文字；勿使用 MiniMax Coding Plan Key"
            testing={testing === "recognize"}
            onTest={() => handleTest("recognize")}
            testResult={testResults.recognize}
          >
            <ProviderPicker
              options={catalog.recognize}
              value={settings.speech_recognize_handler || "local"}
              onPick={pickRecognize}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="field-label">识别方式</label>
                <select
                  className="field-input"
                  value={settings.speech_recognize_mode || "transcribe"}
                  onChange={(e) =>
                    setSettings({ ...settings, speech_recognize_mode: e.target.value })
                  }
                >
                  <option value="transcribe">先转文字（transcribe）</option>
                  <option value="native_audio">原生听音频（native）</option>
                </select>
              </div>
              <Field
                label="ASR 模型"
                value={settings.asr_model || ""}
                onChange={(v) => setSettings({ ...settings, asr_model: v })}
              />
              <Field
                label="ASR API Base"
                value={settings.asr_api_base || ""}
                onChange={(v) => setSettings({ ...settings, asr_api_base: v })}
                className="sm:col-span-2"
              />
              <Field
                label="ASR API Key"
                value={settings.asr_api_key || ""}
                onChange={(v) => setSettings({ ...settings, asr_api_key: v })}
                type="password"
                placeholder={settings.has_asr_api_key ? "已配置（留空保持）" : "独立转写 Key"}
              />
              <Field
                label="ASR API Secret"
                value={settings.asr_api_secret || ""}
                onChange={(v) => setSettings({ ...settings, asr_api_secret: v })}
                type="password"
                placeholder={settings.has_asr_api_secret ? "已配置（留空保持）" : "讯飞/腾讯/百度等"}
              />
              <Field
                label="AppId"
                value={settings.asr_app_id || ""}
                onChange={(v) => setSettings({ ...settings, asr_app_id: v })}
              />
              <Field
                label="AppKey"
                value={settings.asr_app_key || ""}
                onChange={(v) => setSettings({ ...settings, asr_app_key: v })}
              />
              <Field
                label="Access Key"
                value={settings.asr_access_key || ""}
                onChange={(v) => setSettings({ ...settings, asr_access_key: v })}
                type="password"
                placeholder={settings.has_asr_access_key ? "已配置（留空保持）" : "豆包等"}
              />
              <Field
                label="Resource Id"
                value={settings.asr_resource_id || ""}
                onChange={(v) => setSettings({ ...settings, asr_resource_id: v })}
                placeholder="volc.bigasr.auc_turbo"
              />
            </div>
          </StageSection>

          {/* 阶段 2 */}
          <StageSection
            icon={Brain}
            title="面试思考处理器"
            hint="必须是文本 LLM；推荐 MiniMax-M3"
            testing={testing === "reason"}
            onTest={() => handleTest("reason")}
            testResult={testResults.reason}
          >
            <ProviderPicker
              options={catalog.reasoning}
              value={settings.provider}
              onPick={pickReason}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
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
            </div>
          </StageSection>

          {/* 阶段 3 */}
          <StageSection
            icon={Volume2}
            title="语音输出处理器"
            hint="可降级为仅字幕；TTS 失败不中断文字流"
            testing={testing === "speak"}
            onTest={() => handleTest("speak")}
            testResult={testResults.speak}
          >
            <ProviderPicker
              options={catalog.speak}
              value={settings.speech_speak_handler || "edge"}
              onPick={pickSpeak}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="field-label">播报方式</label>
                <select
                  className="field-input"
                  value={settings.speech_speak_mode || "tts_from_text"}
                  onChange={(e) =>
                    setSettings({ ...settings, speech_speak_mode: e.target.value })
                  }
                >
                  <option value="tts_from_text">文本 TTS</option>
                  <option value="native_audio">原生出声</option>
                  <option value="text_only">仅字幕</option>
                </select>
              </div>
              <Field
                label="音色 / Voice Id"
                value={settings.tts_voice || ""}
                onChange={(v) => setSettings({ ...settings, tts_voice: v })}
              />
              <Field
                label="TTS API Base"
                value={settings.tts_api_base || ""}
                onChange={(v) => setSettings({ ...settings, tts_api_base: v })}
                className="sm:col-span-2"
              />
              <Field
                label="TTS API Key（可选，MiniMax 可留空复用思考 Key）"
                value={settings.tts_api_key || ""}
                onChange={(v) => setSettings({ ...settings, tts_api_key: v })}
                type="password"
                placeholder={settings.has_tts_api_key ? "已配置（留空保持）" : "可选"}
                className="sm:col-span-2"
              />
              <Field
                label="TTS 模型"
                value={settings.tts_model || ""}
                onChange={(v) => setSettings({ ...settings, tts_model: v })}
                className="sm:col-span-2"
              />
            </div>
          </StageSection>
        </div>
      ) : null}
    </div>
  );
}

function StageSection({
  icon: Icon,
  title,
  hint,
  children,
  testing,
  onTest,
  testResult,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  hint?: string;
  children: React.ReactNode;
  testing: boolean;
  onTest: () => void;
  testResult?: LLMTestResponse;
}) {
  return (
    <section className="surface-card p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3 mb-5 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-softer)] text-[var(--brand)] flex items-center justify-center">
            <Icon size={16} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {hint && <p className="text-xs text-[var(--muted)] mt-0.5">{hint}</p>}
          </div>
        </div>
        <button type="button" onClick={onTest} disabled={testing} className="btn-secondary shrink-0">
          {testing ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
          测试
        </button>
      </header>
      {children}
      {testResult && (
        <div className={`alert mt-4 ${testResult.success ? "alert-success" : "alert-error"}`}>
          {testResult.success ? (
            <CheckCircle size={16} className="mt-0.5 shrink-0" />
          ) : (
            <XCircle size={16} className="mt-0.5 shrink-0" />
          )}
          <span className="text-sm leading-relaxed break-words">{testResult.message}</span>
        </div>
      )}
    </section>
  );
}

function ProviderPicker({
  options,
  value,
  onPick,
}: {
  options: VoiceProviderOption[];
  value: string;
  onPick: (p: VoiceProviderOption) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((p) => {
        const active = value === p.id;
        return (
          <button
            type="button"
            key={p.id}
            onClick={() => onPick(p)}
            className={`text-left px-3.5 py-2.5 rounded-[var(--radius)] border transition-colors ${
              active
                ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                : "border-[var(--border)] hover:border-[var(--brand)]/40 hover:bg-[var(--brand-softer)]"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{p.label}</span>
              <CapabilityBadges p={p} />
              {p.status === "coming_soon" && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--muted)]">
                  coming soon
                </span>
              )}
            </div>
            {p.hint && <p className="text-xs text-[var(--muted)] mt-1">{p.hint}</p>}
          </button>
        );
      })}
    </div>
  );
}

function CapabilityBadges({ p }: { p: VoiceProviderOption }) {
  const badges: string[] = [];
  if (p.can_speech_recognize) {
    badges.push(p.recognize_via === "native_audio" ? "原生听" : "转写");
  }
  if (p.can_interview_reason) badges.push("可思考");
  if (p.can_speech_speak) {
    badges.push(p.speak_via === "native_audio" ? "原生说" : "TTS");
  }
  if (!badges.length && p.speak_via === "none") badges.push("仅字幕");
  return (
    <>
      {badges.map((b) => (
        <span
          key={b}
          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--brand-softer)] text-[var(--brand-ink)]"
        >
          {b}
        </span>
      ))}
    </>
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
