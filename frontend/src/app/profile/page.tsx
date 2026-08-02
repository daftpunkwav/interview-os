"use client";

import { useEffect, useMemo, useState } from "react";
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
  Mail,
  Phone,
  Award,
} from "lucide-react";
import { LoadError } from "@/components/LoadError";

/** 必填字段：保存时校验，并计入完整度核心项 */
const REQUIRED_KEYS = [
  "name",
  "identity",
  "job_direction",
  "target_role",
  "self_intro",
  "tech_domains",
] as const;

type RequiredKey = (typeof REQUIRED_KEYS)[number];

const REQUIRED_LABELS: Record<RequiredKey, string> = {
  name: "姓名",
  identity: "身份",
  job_direction: "求职方向",
  target_role: "目标岗位",
  self_intro: "自我介绍",
  tech_domains: "技术领域",
};

/** 选填字段：计入完整度但不拦截保存 */
const OPTIONAL_COMPLETION_KEYS = [
  "gender",
  "school",
  "major",
  "education_level",
  "graduation_year",
  "experience_years",
  "current_company",
  "expected_salary",
  "city",
  "expected_city",
  "email",
  "phone",
  "github_username",
  "english_level",
  "certificates",
  "signature_projects",
  "career_highlights",
  "strengths",
  "weaknesses",
] as const;

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [missingRequired, setMissingRequired] = useState<RequiredKey[]>([]);

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

  const filledDomains = profile?.tech_domains.filter((d) => d.trim()) ?? [];

  const isFieldFilled = (key: string): boolean => {
    if (!profile) return false;
    if (key === "tech_domains") return filledDomains.length > 0;
    const value = profile[key as keyof UserProfile];
    return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
  };

  const requiredMissing = useMemo(() => {
    if (!profile) return [] as RequiredKey[];
    return REQUIRED_KEYS.filter((key) => !isFieldFilled(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, filledDomains.length]);

  const requiredDone = REQUIRED_KEYS.length - requiredMissing.length;
  const optionalDone = OPTIONAL_COMPLETION_KEYS.filter((key) => isFieldFilled(key)).length;
  const totalTracked = REQUIRED_KEYS.length + OPTIONAL_COMPLETION_KEYS.length;
  const completion = requiredDone + optionalDone;
  const completionPct = Math.round((completion / totalTracked) * 100);

  const handleSave = async () => {
    if (!profile) return;
    const missing = REQUIRED_KEYS.filter((key) => {
      if (key === "tech_domains") return filledDomains.length === 0;
      const value = profile[key as keyof UserProfile];
      return typeof value === "string" ? !value.trim() : !value;
    });
    setMissingRequired(missing);
    if (missing.length > 0) {
      setMsg(`请先填写必填项：${missing.map((k) => REQUIRED_LABELS[k]).join("、")}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...profile,
        tech_domains: profile.tech_domains.map((d) => d.trim()).filter(Boolean),
      };
      const updated = await api.updateProfile(payload);
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

  const patch = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    if (!profile) return;
    setProfile({ ...profile, [key]: value });
    if (REQUIRED_KEYS.includes(key as RequiredKey)) {
      setMissingRequired((prev) => prev.filter((k) => k !== key));
    }
  };

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

  const requiredError = (key: RequiredKey) => missingRequired.includes(key);

  return (
    <div className="page-shell">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <PageHead />
        <div className="flex items-center gap-3 shrink-0">
          {msg && (
            <span
              className={`text-sm font-medium max-w-xs text-right ${
                msg.includes("失败") || msg.includes("必填")
                  ? "text-[var(--danger-ink)]"
                  : "text-[var(--success-ink)]"
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
        <div className="space-y-5">
          <Section title="基本信息" icon={User} hint="带 * 为必填，影响面试问题生成">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5">
              <Field
                label="姓名"
                required
                error={requiredError("name")}
                value={profile.name}
                onChange={(v) => patch("name", v)}
                placeholder="你的姓名"
              />
              <Field
                label="性别"
                value={profile.gender || ""}
                onChange={(v) => patch("gender", v)}
                placeholder="男 / 女"
              />
              <Field
                label="身份"
                required
                error={requiredError("identity")}
                value={profile.identity || ""}
                onChange={(v) => patch("identity", v)}
                placeholder="学生 / 在职 / 待业"
              />
              <Field
                label="邮箱"
                value={profile.email || ""}
                onChange={(v) => patch("email", v)}
                placeholder="you@example.com"
              />
              <Field
                label="电话 / 微信"
                value={profile.phone || ""}
                onChange={(v) => patch("phone", v)}
                placeholder="手机号或微信号"
              />
            </div>
          </Section>

          <Section title="教育背景" icon={GraduationCap}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5">
              <Field
                label="学校"
                value={profile.school || ""}
                onChange={(v) => patch("school", v)}
                placeholder="学校全称"
              />
              <Field
                label="专业"
                value={profile.major || ""}
                onChange={(v) => patch("major", v)}
                placeholder="专业名称"
              />
              <Field
                label="学历层次"
                value={profile.education_level || ""}
                onChange={(v) => patch("education_level", v)}
                placeholder="本科 / 硕士 / 博士"
              />
              <Field
                label="毕业年份"
                value={profile.graduation_year || ""}
                onChange={(v) => patch("graduation_year", v)}
                placeholder="如 2027"
              />
              <Field
                label="英语水平"
                value={profile.english_level || ""}
                onChange={(v) => patch("english_level", v)}
                placeholder="CET-6 / 雅思 7 / 工作语言"
              />
            </div>
          </Section>

          <Section title="求职意向" icon={Briefcase}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
              <Field
                label="求职方向"
                required
                error={requiredError("job_direction")}
                value={profile.job_direction}
                onChange={(v) => patch("job_direction", v)}
                placeholder="如 人工智能 / 后端"
              />
              <Field
                label="目标岗位"
                required
                error={requiredError("target_role")}
                value={profile.target_role}
                onChange={(v) => patch("target_role", v)}
                placeholder="如 AI 工程师"
              />
              <Field
                label="工作年限"
                value={profile.experience_years}
                onChange={(v) => patch("experience_years", v)}
                placeholder="0-1 年"
              />
              <Field
                label="年限说明"
                value={profile.work_years_detail || ""}
                onChange={(v) => patch("work_years_detail", v)}
                placeholder="含实习 / 仅正式工作"
              />
              <Field
                label="当前公司"
                value={profile.current_company || ""}
                onChange={(v) => patch("current_company", v)}
                placeholder="无则留空"
              />
              <Field
                label="期望薪资"
                value={profile.expected_salary || ""}
                onChange={(v) => patch("expected_salary", v)}
                placeholder="如 15-20K"
              />
              <Field
                label="所在城市"
                value={profile.city || ""}
                onChange={(v) => patch("city", v)}
                placeholder="如 上海"
              />
              <Field
                label="期望城市"
                value={profile.expected_city || ""}
                onChange={(v) => patch("expected_city", v)}
                placeholder="如 北京 / 远程"
              />
              <Field
                label="到岗时间"
                value={profile.notice_period || ""}
                onChange={(v) => patch("notice_period", v)}
                placeholder="两周 / 一个月"
              />
              <Field
                label="远程意愿"
                value={profile.open_to_remote || ""}
                onChange={(v) => patch("open_to_remote", v)}
                placeholder="yes / no / hybrid"
              />
            </div>
          </Section>

          <Section title="在线身份" icon={Link2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
              <Field
                label="GitHub"
                value={profile.github_username || ""}
                onChange={(v) => patch("github_username", v)}
                placeholder="用户名"
              />
              <Field
                label="偏好语言"
                value={profile.preferred_languages || ""}
                onChange={(v) => patch("preferred_languages", v)}
                placeholder="中文, English"
              />
              <Field
                label="作品集 / 博客"
                value={profile.portfolio_url || ""}
                onChange={(v) => patch("portfolio_url", v)}
                placeholder="https://..."
                className="sm:col-span-2"
              />
              <Field
                label="LinkedIn"
                value={profile.linkedin_url || ""}
                onChange={(v) => patch("linkedin_url", v)}
                placeholder="https://linkedin.com/in/..."
                className="sm:col-span-2"
              />
            </div>
          </Section>

          <Section title="技能与介绍" icon={Sparkles}>
            <div className="space-y-5">
              <div>
                <label className="field-label">
                  自我介绍 <span className="text-[var(--danger)]">*</span>
                </label>
                <textarea
                  className={`field-textarea !leading-[1.7] ${requiredError("self_intro") ? "field-invalid" : ""}`}
                  rows={4}
                  value={profile.self_intro || ""}
                  onChange={(e) => patch("self_intro", e.target.value)}
                  placeholder="简要介绍背景、优势与求职动机…"
                />
                {requiredError("self_intro") && <p className="field-error">请填写自我介绍</p>}
              </div>
              <div>
                <label className="field-label">职业亮点</label>
                <textarea
                  className="field-textarea !min-h-[80px] !leading-[1.7]"
                  rows={3}
                  value={profile.career_highlights || ""}
                  onChange={(e) => patch("career_highlights", e.target.value)}
                  placeholder="2–4 条可量化的成就…"
                />
              </div>
              <div>
                <label className="field-label">代表项目</label>
                <textarea
                  className="field-textarea !min-h-[80px] !leading-[1.7]"
                  rows={3}
                  value={profile.signature_projects || ""}
                  onChange={(e) => patch("signature_projects", e.target.value)}
                  placeholder="1–3 个代表性项目：名称、职责、技术栈、结果…"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="field-label">优势</label>
                  <textarea
                    className="field-textarea !min-h-[80px] !leading-[1.7]"
                    rows={3}
                    value={profile.strengths || ""}
                    onChange={(e) => patch("strengths", e.target.value)}
                    placeholder="如系统思维、落地能力…"
                  />
                </div>
                <div>
                  <label className="field-label">待提升</label>
                  <textarea
                    className="field-textarea !min-h-[80px] !leading-[1.7]"
                    rows={3}
                    value={profile.weaknesses || ""}
                    onChange={(e) => patch("weaknesses", e.target.value)}
                    placeholder="坦诚且可改进的短板…"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">证书</label>
                <textarea
                  className="field-textarea !min-h-[72px] !leading-[1.7]"
                  rows={2}
                  value={profile.certificates || ""}
                  onChange={(e) => patch("certificates", e.target.value)}
                  placeholder="如 AWS SAA、软考、专利等"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="field-label !mb-0">
                    技术领域 <span className="text-[var(--danger)]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={addDomain}
                    className="btn-tertiary !h-8 !px-2 !text-xs text-[var(--brand)]"
                  >
                    <Plus size={14} /> 添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.tech_domains.map((d, i) => (
                    <div
                      key={i}
                      className={`inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-[var(--radius)] border bg-[var(--card)] focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_rgba(66,133,244,0.18)] ${
                        requiredError("tech_domains")
                          ? "border-[var(--danger)]"
                          : "border-[var(--input)]"
                      }`}
                    >
                      <input
                        className="w-28 sm:w-32 text-sm bg-transparent outline-none placeholder:text-[var(--muted-soft)]"
                        value={d}
                        placeholder="如 Python"
                        onChange={(e) => {
                          const domains = [...profile.tech_domains];
                          domains[i] = e.target.value;
                          patch("tech_domains", domains);
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
                {requiredError("tech_domains") && (
                  <p className="field-error">请至少填写一项技术领域</p>
                )}
              </div>
            </div>
          </Section>
        </div>

        <aside className="xl:sticky xl:top-6 space-y-4">
          <div className="surface-card p-5 sm:p-6">
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-deep)] flex items-center justify-center text-white text-lg font-semibold shrink-0 tracking-tight">
                {(profile.name || "?").charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-[15px] truncate tracking-tight leading-snug">
                  {profile.name || "未填写姓名"}
                </h2>
                <p className="text-[12px] text-[var(--muted)] truncate mt-1 leading-snug">
                  {[profile.identity, profile.school].filter(Boolean).join(" · ") ||
                    "完善档案以生成预览"}
                </p>
              </div>
            </div>

            <dl className="space-y-3.5">
              {profile.major && (
                <PreviewRow
                  icon={GraduationCap}
                  label="专业"
                  value={`${profile.major}${profile.graduation_year ? ` · ${profile.graduation_year}` : ""}`}
                />
              )}
              {profile.education_level && (
                <PreviewRow icon={Award} label="学历" value={profile.education_level} />
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
              {profile.expected_city && (
                <PreviewRow icon={MapPin} label="期望城市" value={profile.expected_city} />
              )}
              {profile.city && !profile.expected_city && (
                <PreviewRow icon={MapPin} label="城市" value={profile.city} />
              )}
              {profile.email && <PreviewRow icon={Mail} label="邮箱" value={profile.email} />}
              {profile.phone && <PreviewRow icon={Phone} label="电话/微信" value={profile.phone} />}
              {profile.github_username && (
                <PreviewRow icon={Link2} label="GitHub" value={profile.github_username} />
              )}
            </dl>

            {filledDomains.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[var(--border)]">
                <p className="text-[11px] font-medium text-[var(--muted)] mb-2.5 tracking-wide">
                  技术栈
                </p>
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
              <div className="mt-5 pt-4 border-t border-[var(--border)]">
                <p className="text-[11px] font-medium text-[var(--muted)] mb-2 tracking-wide">
                  自我介绍
                </p>
                <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.7] line-clamp-6 text-justify [text-align-last:left]">
                  {profile.self_intro}
                </p>
              </div>
            )}
          </div>

          <div className="surface-card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-medium tracking-tight">档案完整度</span>
              <span className="text-sm font-semibold text-[var(--brand)] tabular-nums">
                {completionPct}%
              </span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${completionPct}%` }} />
            </div>
            <p className="text-[12px] text-[var(--muted)] mt-3 leading-relaxed">
              必填 {requiredDone}/{REQUIRED_KEYS.length} · 选填 {optionalDone}/
              {OPTIONAL_COMPLETION_KEYS.length}
            </p>
            {requiredMissing.length > 0 && (
              <p className="text-[12px] text-[var(--danger-ink)] mt-2 leading-relaxed">
                待补必填：{requiredMissing.map((k) => REQUIRED_LABELS[k]).join("、")}
              </p>
            )}
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
        <p className="page-desc">本地存储，无需注册。必填信息用于生成更精准的面试问题。</p>
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
    <section className="surface-card p-5 sm:p-7">
      <header className="flex items-center gap-3 mb-6 pb-3.5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-lg bg-[var(--brand-softer)] text-[var(--brand)] flex items-center justify-center shrink-0">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)] leading-snug">
            {title}
          </h2>
          {hint && <p className="text-[12px] text-[var(--muted)] mt-1 leading-snug">{hint}</p>}
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
  required = false,
  error = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <div className={className}>
      <label className="field-label !mb-2 !text-[12.5px] !tracking-wide">
        {label}
        {required ? <span className="text-[var(--danger)]"> *</span> : null}
      </label>
      <input
        type="text"
        className={`field-input !h-11 !text-[13.5px] ${error ? "field-invalid" : ""}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error || undefined}
        aria-required={required || undefined}
      />
      {error && <p className="field-error">请填写{label}</p>}
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
    <div className="flex items-start gap-3">
      <Icon size={14} className="text-[var(--muted)] mt-1 shrink-0" />
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] text-[var(--muted)] leading-none tracking-wide">{label}</dt>
        <dd className="text-[13.5px] font-medium text-[var(--foreground)] mt-1.5 leading-snug break-words">
          {value}
        </dd>
      </div>
    </div>
  );
}
