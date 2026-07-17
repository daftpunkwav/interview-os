"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import type { Options, Resume, InterviewConfig } from "@/types";
import {
  Play,
  Loader2,
  Sparkles,
  Building2,
  UserCircle,
  Briefcase,
  Mic,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import { LoadError } from "@/components/LoadError";

export default function InterviewSetupPage() {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [config, setConfig] = useState<InterviewConfig>({
    role: "后端工程师",
    level: "中级工程师",
    company: "bytedance",
    workflow_type: "technical",
    personality: "professional",
    strictness: 3,
    interview_style: "deep_dive",
    resume_id: null,
    avatar_id: "professional_male",
    scene_id: "meeting_room",
  });

  const loadData = () => {
    setLoading(true);
    setLoadError("");
    Promise.all([api.getOptions(), api.listResumes()])
      .then(([opts, res]) => {
        setOptions(opts);
        setResumes(res);
        if (res.length > 0) {
          const active = res.find((r) => r.is_active) ?? res[0];
          if (active) setConfig((c) => ({ ...c, resume_id: active.id }));
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedCompany = useMemo(
    () => options?.companies.find((c) => c.id === config.company),
    [options, config.company],
  );

  const selectedPersonality = useMemo(
    () => options?.personalities.find((p) => p.id === config.personality),
    [options, config.personality],
  );

  const selectedWorkflow = useMemo(
    () => options?.workflow_types.find((w) => w.id === config.workflow_type),
    [options, config.workflow_type],
  );

  const selectedStyle = useMemo(
    () => options?.interview_styles.find((s) => s.id === config.interview_style),
    [options, config.interview_style],
  );

  const selectedAvatar = useMemo(
    () => options?.avatars?.find((a) => a.id === config.avatar_id),
    [options, config.avatar_id],
  );

  const selectedScene = useMemo(
    () => options?.scenes?.find((s) => s.id === config.scene_id),
    [options, config.scene_id],
  );

  const selectedResume = useMemo(
    () => resumes.find((r) => r.id === config.resume_id),
    [resumes, config.resume_id],
  );

  const strictnessLabel =
    config.strictness <= 3 ? "友好" : config.strictness <= 6 ? "正常" : config.strictness <= 8 ? "高压" : "极限";

  const handleStart = async () => {
    setCreating(true);
    try {
      const session = await api.createSession(config);
      router.push(`/interview/${session.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const startButton = (fullWidth = false) => (
    <button
      type="button"
      className={`btn-primary shrink-0 ${fullWidth ? "w-full" : ""}`}
      onClick={handleStart}
      disabled={creating || loading || !!loadError}
    >
      {creating ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
      开始模拟面试
    </button>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden page-shell !py-4 sm:!py-5">
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
        <div className="page-header !mb-0 min-w-0">
          <div className="icon-badge shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="page-title !text-xl">配置模拟面试</h1>
            <p className="page-desc !text-xs">定制你的专属面试体验</p>
          </div>
        </div>
        <div className="hidden sm:block">
          {!loading && !loadError && options ? startButton(false) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-[var(--muted)] text-sm">
          <Loader2 className="animate-spin text-brand-500" size={18} /> 加载配置中…
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={loadData} />
      ) : options ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3 overflow-hidden">
          {/* 左侧配置 */}
          <div className="min-h-0 flex flex-col gap-3 overflow-y-auto pr-0.5 pb-2">
            <div className="surface-card p-3.5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <Select label="目标岗位" value={config.role} options={options.roles} onChange={(v) => setConfig({ ...config, role: v })} />
                <Select label="职级" value={config.level} options={options.levels} onChange={(v) => setConfig({ ...config, level: v })} />
                <Select
                  label="面试类型"
                  value={config.workflow_type}
                  options={options.workflow_types.map((w) => w.id)}
                  labels={options.workflow_types.map((w) => w.name)}
                  onChange={(v) => setConfig({ ...config, workflow_type: v })}
                />
                <Select
                  label="面试风格"
                  value={config.interview_style}
                  options={options.interview_styles.map((s) => s.id)}
                  labels={options.interview_styles.map((s) => s.name)}
                  onChange={(v) => setConfig({ ...config, interview_style: v })}
                />
              </div>
            </div>

            <div className="surface-card p-3.5">
              <label className="block text-xs font-medium mb-2 text-slate-700">目标公司</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
                {options.companies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setConfig({ ...config, company: c.id })}
                    className={`px-2 py-2 rounded-xl border text-center text-xs font-medium ${
                      config.company === c.id
                        ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm shadow-brand-500/10"
                        : "border-[var(--border)] bg-white hover:border-brand-300 hover:bg-brand-50/40"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="surface-card p-3.5">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-2 text-slate-700">面试官性格</label>
                  <div className="flex flex-wrap gap-1.5">
                    {options.personalities.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setConfig({ ...config, personality: p.id })}
                        className={`px-3 py-1.5 rounded-xl text-xs border font-medium ${
                          config.personality === p.id
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-[var(--border)] bg-white hover:border-brand-300"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lg:w-48">
                  <label className="block text-xs font-medium mb-2 text-slate-700">
                    严厉 {config.strictness}/10 · {strictnessLabel}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={config.strictness}
                    onChange={(e) => setConfig({ ...config, strictness: Number(e.target.value) })}
                    className="w-full accent-brand-600 h-2"
                  />
                </div>
              </div>
            </div>

            <div className="surface-card p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {options.avatars && options.avatars.length > 0 && (
                  <Select
                    label="面试官形象"
                    value={config.avatar_id || "professional_male"}
                    options={options.avatars.map((a) => a.id)}
                    labels={options.avatars.map((a) => a.name)}
                    onChange={(v) => setConfig({ ...config, avatar_id: v })}
                  />
                )}
                {options.scenes && options.scenes.length > 0 && (
                  <Select
                    label="面试场景"
                    value={config.scene_id || "meeting_room"}
                    options={options.scenes.map((s) => s.id)}
                    labels={options.scenes.map((s) => s.name)}
                    onChange={(v) => setConfig({ ...config, scene_id: v })}
                  />
                )}
                {resumes.length > 0 ? (
                  <Select
                    label="关联简历"
                    value={String(config.resume_id)}
                    options={resumes.map((r) => String(r.id))}
                    labels={resumes.map((r) => `${r.filename}${r.is_active ? " (投递)" : ""}`)}
                    onChange={(v) => setConfig({ ...config, resume_id: Number(v) })}
                  />
                ) : (
                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-700">关联简历</label>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-2">
                      暂无简历，可稍后在「简历管理」上传
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 小屏底部开始按钮 */}
            <div className="sm:hidden shrink-0 pt-1 sticky bottom-0 bg-[var(--background)]/90 backdrop-blur-sm pb-1">
              {startButton(true)}
            </div>
          </div>

          {/* 右侧摘要（大屏） */}
          <div className="hidden lg:flex min-h-0 flex-col gap-2.5 overflow-hidden">
            <div className="surface-card p-3.5">
              <h2 className="font-semibold text-xs mb-2.5 flex items-center gap-1.5 text-slate-800">
                <ListChecks size={14} className="text-brand-600" />
                配置预览
              </h2>
              <div className="space-y-2 text-xs">
                <PreviewRow icon={Briefcase} label="岗位" value={`${config.role} · ${config.level}`} />
                <PreviewRow icon={Building2} label="公司" value={selectedCompany?.name ?? config.company} />
                <PreviewRow icon={Mic} label="类型" value={`${selectedWorkflow?.name ?? ""} · ${selectedStyle?.name ?? ""}`} />
                <PreviewRow
                  icon={UserCircle}
                  label="面试官"
                  value={`${selectedPersonality?.name ?? ""} · ${strictnessLabel}`}
                />
                {(selectedAvatar || selectedScene) && (
                  <PreviewRow
                    icon={UserCircle}
                    label="形象"
                    value={[selectedAvatar?.name, selectedScene?.name].filter(Boolean).join(" · ")}
                  />
                )}
                {selectedResume && (
                  <PreviewRow icon={Briefcase} label="简历" value={selectedResume.filename} />
                )}
              </div>
            </div>

            {selectedCompany && (
              <div className="surface-card p-3.5 flex-1 min-h-0 overflow-y-auto">
                <h2 className="font-semibold text-xs mb-1.5 flex items-center gap-1.5 text-slate-800">
                  <Building2 size={14} className="text-brand-600" />
                  {selectedCompany.name} 面经
                </h2>
                <p className="text-[11px] text-[var(--muted)] leading-snug line-clamp-3 mb-2">{selectedCompany.style}</p>
                {selectedCompany.focus_areas.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedCompany.focus_areas.slice(0, 6).map((area) => (
                      <span key={area} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                        {area}
                      </span>
                    ))}
                  </div>
                )}
                {selectedWorkflow && selectedWorkflow.phases.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] text-slate-400 mb-1">流程</p>
                    <p className="text-[11px] text-[var(--muted)] leading-snug">
                      {selectedWorkflow.phases.join(" → ")}
                    </p>
                  </div>
                )}
                {selectedCompany.sample_questions.length > 0 && (
                  <p className="text-[11px] text-[var(--muted)] leading-snug line-clamp-3">
                    <span className="text-slate-400">参考：</span>
                    {selectedCompany.sample_questions[0]}
                  </p>
                )}
              </div>
            )}

            <div className="surface-card px-3.5 py-2.5 shrink-0">
              <p className="text-[11px] text-[var(--muted)] leading-snug flex items-start gap-1.5">
                <Lightbulb size={13} className="text-brand-600 shrink-0 mt-0.5" />
                关联简历后问题更贴合项目；建议先完成 BYOK 配置
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Select({ label, value, options, labels, onChange }: {
  label: string; value: string; options: string[]; labels?: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-2 rounded-xl border border-[var(--border)] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-300/60 focus:border-brand-300"
      >
        {options.map((o, i) => (
          <option key={o} value={o}>{labels?.[i] || o}</option>
        ))}
      </select>
    </div>
  );
}

function PreviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <Icon size={12} className="text-[var(--muted)] mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-[10px] text-slate-400">{label}</span>
        <p className="font-medium text-slate-800 leading-snug break-words">{value}</p>
      </div>
    </div>
  );
}
