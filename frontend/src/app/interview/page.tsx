"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
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
          const active = res.find((r) => r.is_active) || res[0];
          setConfig((c) => ({ ...c, resume_id: active.id }));
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
      alert(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
          <Sparkles className="text-white" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">配置模拟面试</h1>
          <p className="text-sm text-[var(--muted)]">定制你的专属面试体验</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <Loader2 className="animate-spin" size={18} /> 加载中...
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={loadData} />
      ) : options ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* 左侧表单 */}
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="目标岗位" value={config.role} options={options.roles} onChange={(v) => setConfig({ ...config, role: v })} />
              <Select label="职级" value={config.level} options={options.levels} onChange={(v) => setConfig({ ...config, level: v })} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">目标公司</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {options.companies.map((c) => (
                  <motion.button
                    key={c.id}
                    type="button"
                    onClick={() => setConfig({ ...config, company: c.id })}
                    className={`p-3 rounded-xl border text-left text-sm transition-all ${
                      config.company === c.id
                        ? "border-brand-500 bg-brand-50 shadow-sm shadow-brand-500/10"
                        : "border-[var(--border)] hover:border-brand-300 hover:shadow-sm"
                    }`}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="font-medium">{c.name}</span>
                    <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{c.style}</p>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div>
              <label className="block text-sm font-medium mb-2">面试官性格</label>
              <div className="flex flex-wrap gap-2">
                {options.personalities.map((p) => (
                  <motion.button
                    key={p.id}
                    type="button"
                    onClick={() => setConfig({ ...config, personality: p.id })}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      config.personality === p.id
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

            <div>
              <label className="block text-sm font-medium mb-2">
                严厉程度：{config.strictness}/10
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={config.strictness}
                onChange={(e) => setConfig({ ...config, strictness: Number(e.target.value) })}
                className="w-full accent-brand-600"
              />
              <div className="flex justify-between text-xs text-[var(--muted)] mt-1">
                <span>友好</span><span>正常</span><span>高压</span><span>极限</span>
              </div>
            </div>

            {(options.avatars?.length || options.scenes?.length) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>
            ) : null}

            {resumes.length > 0 && (
              <Select
                label="关联简历"
                value={String(config.resume_id)}
                options={resumes.map((r) => String(r.id))}
                labels={resumes.map((r) => `${r.filename}${r.is_active ? " (投递)" : ""}`)}
                onChange={(v) => setConfig({ ...config, resume_id: Number(v) })}
              />
            )}

            <motion.button
              type="button"
              className="lg:hidden w-full px-8 py-3 bg-brand-600 text-white rounded-xl font-medium shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStart}
              disabled={creating}
            >
              {creating ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
              开始模拟面试
            </motion.button>
          </div>

          {/* 右侧预览 */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <ListChecks size={16} className="text-brand-600" />
                配置预览
              </h2>
              <div className="space-y-3 text-sm">
                <PreviewRow icon={Briefcase} label="岗位" value={`${config.role} · ${config.level}`} />
                <PreviewRow icon={Building2} label="公司" value={selectedCompany?.name ?? config.company} />
                <PreviewRow icon={Mic} label="类型" value={selectedWorkflow?.name ?? config.workflow_type} />
                <PreviewRow
                  icon={UserCircle}
                  label="面试官"
                  value={`${selectedPersonality?.name ?? config.personality} · ${strictnessLabel}`}
                />
                <PreviewRow icon={Sparkles} label="风格" value={selectedStyle?.name ?? config.interview_style} />
                {(selectedAvatar || selectedScene) && (
                  <PreviewRow
                    icon={UserCircle}
                    label="形象/场景"
                    value={[selectedAvatar?.name, selectedScene?.name].filter(Boolean).join(" · ")}
                  />
                )}
                {selectedResume && (
                  <PreviewRow icon={Briefcase} label="简历" value={selectedResume.filename} />
                )}
              </div>
            </div>

            {selectedCompany && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <h2 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Building2 size={16} className="text-brand-600" />
                  {selectedCompany.name} 面经提示
                </h2>
                <p className="text-xs text-[var(--muted)] leading-relaxed mb-3">{selectedCompany.style}</p>
                {selectedCompany.focus_areas.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 mb-1.5">考察重点</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCompany.focus_areas.map((area) => (
                        <span key={area} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCompany.sample_questions.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">参考题型</p>
                    <ul className="text-xs text-[var(--muted)] space-y-1">
                      {selectedCompany.sample_questions.slice(0, 3).map((q) => (
                        <li key={q} className="flex gap-1.5">
                          <span className="text-brand-400 shrink-0">•</span>
                          <span className="line-clamp-2">{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {selectedWorkflow && selectedWorkflow.phases.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <ListChecks size={16} className="text-brand-600" />
                  面试流程
                </h2>
                <ol className="space-y-2">
                  {selectedWorkflow.phases.map((phase, i) => (
                    <li key={phase} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span>{phase}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Lightbulb size={16} className="text-brand-600" />
                小贴士
              </h2>
              <ul className="text-xs text-[var(--muted)] space-y-2 leading-relaxed">
                <li>· 严厉程度越高，追问越深、容错越低</li>
                <li>· 关联简历后，问题会更贴合你的项目经历</li>
                <li>· 建议先完成 BYOK 配置再开始面试</li>
              </ul>
            </div>

            <motion.button
              type="button"
              className="hidden lg:flex w-full px-8 py-3.5 bg-brand-600 text-white rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStart}
              disabled={creating}
            >
              {creating ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
              开始模拟面试
            </motion.button>
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
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 transition-all"
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
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-[var(--muted)] mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-xs text-slate-400">{label}</span>
        <p className="font-medium text-slate-800 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}
