"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Options, Resume, InterviewConfig } from "@/types";
import { Play, Loader2 } from "lucide-react";

export default function InterviewSetupPage() {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
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
  });

  useEffect(() => {
    Promise.all([api.getOptions(), api.listResumes()]).then(([opts, res]) => {
      setOptions(opts);
      setResumes(res);
      if (res.length > 0) setConfig((c) => ({ ...c, resume_id: res[0].id }));
    });
  }, []);

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

  if (!options) {
    return <div className="p-8 flex items-center gap-2 text-[var(--muted)]"><Loader2 className="animate-spin" size={18} /> 加载中...</div>;
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">配置模拟面试</h1>

      <div className="space-y-5">
        <Select label="目标岗位" value={config.role} options={options.roles} onChange={(v) => setConfig({ ...config, role: v })} />
        <Select label="职级" value={config.level} options={options.levels} onChange={(v) => setConfig({ ...config, level: v })} />

        <div>
          <label className="block text-sm font-medium mb-1.5">目标公司</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {options.companies.map((c) => (
              <button
                key={c.id}
                onClick={() => setConfig({ ...config, company: c.id })}
                className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                  config.company === c.id ? "border-brand-500 bg-brand-50" : "border-[var(--border)] hover:border-brand-300"
                }`}
              >
                <span className="font-medium">{c.name}</span>
                <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{c.style}</p>
              </button>
            ))}
          </div>
        </div>

        <Select
          label="面试类型"
          value={config.workflow_type}
          options={options.workflow_types.map((w) => w.id)}
          labels={options.workflow_types.map((w) => w.name)}
          onChange={(v) => setConfig({ ...config, workflow_type: v })}
        />

        <div>
          <label className="block text-sm font-medium mb-1.5">面试官性格</label>
          <div className="flex flex-wrap gap-2">
            {options.personalities.map((p) => (
              <button
                key={p.id}
                onClick={() => setConfig({ ...config, personality: p.id })}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  config.personality === p.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)]"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
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
          <div className="flex justify-between text-xs text-[var(--muted)]">
            <span>友好</span><span>正常</span><span>高压</span><span>极限</span>
          </div>
        </div>

        <Select
          label="面试风格"
          value={config.interview_style}
          options={options.interview_styles.map((s) => s.id)}
          labels={options.interview_styles.map((s) => s.name)}
          onChange={(v) => setConfig({ ...config, interview_style: v })}
        />

        {resumes.length > 0 && (
          <Select
            label="关联简历"
            value={String(config.resume_id)}
            options={resumes.map((r) => String(r.id))}
            labels={resumes.map((r) => r.filename)}
            onChange={(v) => setConfig({ ...config, resume_id: Number(v) })}
          />
        )}
      </div>

      <button
        onClick={handleStart}
        disabled={creating}
        className="mt-8 btn-primary flex items-center gap-2 px-6 py-3 text-base"
      >
        {creating ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
        开始模拟面试
      </button>

      <style jsx global>{`
        .btn-primary { @apply rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors; }
      `}</style>
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
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
      >
        {options.map((o, i) => (
          <option key={o} value={o}>{labels?.[i] || o}</option>
        ))}
      </select>
    </div>
  );
}
