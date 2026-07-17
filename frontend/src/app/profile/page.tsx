"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { UserProfile } from "@/types";
import {
  Save,
  Loader2,
  User,
  Plus,
  GraduationCap,
  Briefcase,
  Sparkles,
  MapPin,
  Building2,
  Link2,
  X,
} from "lucide-react";
import { LoadError } from "@/components/LoadError";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const loadProfile = () => {
    setLoading(true);
    setLoadError("");
    api
      .getProfile()
      .then(setProfile)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await api.updateProfile(profile);
      setProfile(updated);
      setMsg("已保存");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const addDomain = () => {
    if (!profile) return;
    setProfile({ ...profile, tech_domains: [...profile.tech_domains, ""] });
  };

  const removeDomain = (i: number) => {
    if (!profile) return;
    const domains = profile.tech_domains.filter((_, idx) => idx !== i);
    setProfile({ ...profile, tech_domains: domains.length ? domains : [""] });
  };

  const filledDomains = profile?.tech_domains.filter((d) => d.trim()) ?? [];
  const completion = profile
    ? [
        profile.name,
        profile.gender,
        profile.identity,
        profile.school,
        profile.major,
        profile.job_direction,
        profile.target_role,
        profile.self_intro,
        filledDomains.length > 0 ? "ok" : "",
        profile.github_username,
        profile.city,
        profile.career_highlights,
      ].filter(Boolean).length
    : 0;
  const completionPct = Math.round((completion / 12) * 100);

  if (loading) {
    return (
      <div className="page-shell">
        <PageHead />
        <div className="flex items-center gap-2 text-sm text-[var(--muted)] py-16 justify-center">
          <Loader2 className="animate-spin text-[var(--brand)]" size={18} /> 加载档案…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-shell">
        <PageHead />
        <LoadError message={loadError} onRetry={loadProfile} />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="page-shell">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <PageHead />
        <div className="flex items-center gap-3 shrink-0">
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
            保存档案
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
        {/* 表单区 */}
        <div className="space-y-4">
          <Section title="基本信息" icon={User} hint="面试官第一眼看到的信息">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
              <Field label="姓名" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} placeholder="你的姓名" />
              <Field label="性别" value={profile.gender || ""} onChange={(v) => setProfile({ ...profile, gender: v })} placeholder="男 / 女" />
              <Field label="身份" value={profile.identity || ""} onChange={(v) => setProfile({ ...profile, identity: v })} placeholder="学生 / 在职 / 待业" />
            </div>
          </Section>

          <Section title="教育背景" icon={GraduationCap}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
              <Field label="学校" value={profile.school || ""} onChange={(v) => setProfile({ ...profile, school: v })} placeholder="学校全称" />
              <Field label="专业" value={profile.major || ""} onChange={(v) => setProfile({ ...profile, major: v })} placeholder="专业名称" />
              <Field label="毕业年份" value={profile.graduation_year || ""} onChange={(v) => setProfile({ ...profile, graduation_year: v })} placeholder="如 2027" />
            </div>
          </Section>

          <Section title="求职意向" icon={Briefcase}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              <Field label="求职方向" value={profile.job_direction} onChange={(v) => setProfile({ ...profile, job_direction: v })} placeholder="如 人工智能 / 后端" />
              <Field label="目标岗位" value={profile.target_role} onChange={(v) => setProfile({ ...profile, target_role: v })} placeholder="如 AI 工程师" />
              <Field label="工作年限" value={profile.experience_years} onChange={(v) => setProfile({ ...profile, experience_years: v })} placeholder="0-1 年" />
              <Field label="当前公司" value={profile.current_company || ""} onChange={(v) => setProfile({ ...profile, current_company: v })} placeholder="无则留空" />
              <Field label="期望薪资" value={profile.expected_salary || ""} onChange={(v) => setProfile({ ...profile, expected_salary: v })} placeholder="如 15-20K" />
              <Field label="到岗时间" value={profile.notice_period || ""} onChange={(v) => setProfile({ ...profile, notice_period: v })} placeholder="两周 / 一个月" />
            </div>
          </Section>

          <Section title="在线身份" icon={Link2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              <Field label="GitHub" value={profile.github_username || ""} onChange={(v) => setProfile({ ...profile, github_username: v })} placeholder="用户名" />
              <Field label="所在城市" value={profile.city || ""} onChange={(v) => setProfile({ ...profile, city: v })} placeholder="如 上海" />
              <Field label="作品集 / 博客" value={profile.portfolio_url || ""} onChange={(v) => setProfile({ ...profile, portfolio_url: v })} placeholder="https://..." className="sm:col-span-2" />
              <Field label="LinkedIn" value={profile.linkedin_url || ""} onChange={(v) => setProfile({ ...profile, linkedin_url: v })} placeholder="https://linkedin.com/in/..." className="sm:col-span-2" />
              <Field label="偏好语言" value={profile.preferred_languages || ""} onChange={(v) => setProfile({ ...profile, preferred_languages: v })} placeholder="中文, English" />
              <Field label="远程意愿" value={profile.open_to_remote || ""} onChange={(v) => setProfile({ ...profile, open_to_remote: v })} placeholder="yes / no / hybrid" />
            </div>
          </Section>

          <Section title="技能与介绍" icon={Sparkles}>
            <div className="space-y-4">
              <div>
                <label className="field-label">自我介绍</label>
                <textarea
                  className="field-textarea"
                  rows={4}
                  value={profile.self_intro || ""}
                  onChange={(e) => setProfile({ ...profile, self_intro: e.target.value })}
                  placeholder="简要介绍背景、优势与求职动机…"
                />
              </div>
              <div>
                <label className="field-label">职业亮点</label>
                <textarea
                  className="field-textarea !min-h-[72px]"
                  rows={3}
                  value={profile.career_highlights || ""}
                  onChange={(e) => setProfile({ ...profile, career_highlights: e.target.value })}
                  placeholder="2–4 条可量化的成就…"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="field-label !mb-0">技术领域</label>
                  <button type="button" onClick={addDomain} className="btn-tertiary !h-8 !px-2 !text-xs text-[var(--brand)]">
                    <Plus size={14} /> 添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.tech_domains.map((d, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-[var(--radius)] border border-[var(--input)] bg-white focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_rgba(66,133,244,0.18)]"
                    >
                      <input
                        className="w-28 sm:w-32 text-sm bg-transparent outline-none placeholder:text-[var(--muted-soft)]"
                        value={d}
                        placeholder="如 Python"
                        onChange={(e) => {
                          const domains = [...profile.tech_domains];
                          domains[i] = e.target.value;
                          setProfile({ ...profile, tech_domains: domains });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeDomain(i)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-[var(--popover)] hover:text-[var(--foreground)]"
                        aria-label="移除"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* 右侧预览 · sticky 紧凑 */}
        <aside className="xl:sticky xl:top-6 space-y-3">
          <div className="surface-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-deep)] flex items-center justify-center text-white text-lg font-semibold shrink-0">
                {(profile.name || "?").charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-[15px] truncate tracking-tight">
                  {profile.name || "未填写姓名"}
                </h2>
                <p className="text-xs text-[var(--muted)] truncate mt-0.5">
                  {[profile.identity, profile.school].filter(Boolean).join(" · ") || "完善档案以生成预览"}
                </p>
              </div>
            </div>

            <dl className="space-y-2.5 text-sm">
              {profile.major && (
                <PreviewRow icon={GraduationCap} label="专业" value={`${profile.major}${profile.graduation_year ? ` · ${profile.graduation_year}` : ""}`} />
              )}
              {profile.target_role && (
                <PreviewRow icon={Briefcase} label="目标岗位" value={profile.target_role} />
              )}
              {profile.job_direction && (
                <PreviewRow icon={MapPin} label="求职方向" value={profile.job_direction} />
              )}
              {profile.current_company && (
                <PreviewRow icon={Building2} label="当前公司" value={profile.current_company} />
              )}
              {profile.github_username && (
                <PreviewRow icon={Link2} label="GitHub" value={profile.github_username} />
              )}
              {profile.city && <PreviewRow icon={MapPin} label="城市" value={profile.city} />}
            </dl>

            {filledDomains.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <p className="text-[11px] font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">技术栈</p>
                <div className="flex flex-wrap gap-1.5">
                  {filledDomains.map((d) => (
                    <span key={d} className="chip chip-blue">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.self_intro && (
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <p className="text-[11px] font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">自我介绍</p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-5">
                  {profile.self_intro}
                </p>
              </div>
            )}
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">档案完整度</span>
              <span className="text-sm font-semibold text-[var(--brand)] tabular-nums">{completionPct}%</span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${completionPct}%` }} />
            </div>
            <p className="text-xs text-[var(--muted)] mt-2.5 leading-relaxed">
              已填 {completion}/12 项 · 完整档案可帮助 AI 生成更精准的问题
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PageHead() {
  return (
    <div className="page-header !mb-0">
      <div className="icon-badge">
        <User size={20} />
      </div>
      <div>
        <h1 className="page-title">个人档案</h1>
        <p className="page-desc">本地存储，无需注册。用于个性化面试问题生成。</p>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5 sm:p-6">
      <header className="flex items-center gap-2.5 mb-5 pb-3 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--brand-softer)] text-[var(--brand)] flex items-center justify-center shrink-0">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
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
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      <input
        type="text"
        className="field-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
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
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="text-[var(--muted)] mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] text-[var(--muted)] leading-none">{label}</dt>
        <dd className="text-[13px] font-medium text-[var(--foreground)] mt-1 truncate">{value}</dd>
      </div>
    </div>
  );
}
