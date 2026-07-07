"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";

/** 标签与输入框样式：标签 16px 黑色，输入 18px，包在同一边框容器内 */
const FIELD_BOX_CLS =
  "rounded-xl border-2 border-slate-200 bg-slate-50/80 px-3.5 pt-2 pb-2.5 shadow-sm " +
  "hover:border-slate-300 hover:bg-white focus-within:border-brand-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-500/15 transition-colors";
const LABEL_CLS = "block text-base leading-none text-slate-900 mb-1.5 select-none";
const INPUT_CLS =
  "w-full block bg-transparent border-0 p-0 m-0 text-lg font-semibold leading-snug text-slate-900 " +
  "placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-0";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.getProfile().then(setProfile).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await api.updateProfile(profile);
      setProfile(updated);
      setMsg("保存成功");
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

  if (!profile) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <Loader2 className="animate-spin" size={18} /> 加载中...
        </div>
      </div>
    );
  }

  const filledDomains = profile.tech_domains.filter((d) => d.trim());
  const completion = [
    profile.name,
    profile.gender,
    profile.identity,
    profile.school,
    profile.major,
    profile.job_direction,
    profile.target_role,
    profile.self_intro,
    filledDomains.length > 0 ? "ok" : "",
  ].filter(Boolean).length;

  const completionPct = Math.round((completion / 9) * 100);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto w-full">
      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <User className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">个人档案</h1>
              <p className="text-sm text-[var(--muted)]">
                本地存储，无需注册。信息用于个性化面试问题生成。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {msg && (
              <motion.span
                className="text-sm text-green-600"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                {msg}
              </motion.span>
            )}
            <motion.button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 shrink-0"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存档案
            </motion.button>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* 左侧表单 */}
        <div className="space-y-5">
          <SectionCard title="基本信息" icon={User}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="姓名" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} />
                <Field label="性别" value={profile.gender || ""} onChange={(v) => setProfile({ ...profile, gender: v })} placeholder="男 / 女" />
                <Field
                  label="身份"
                  value={profile.identity || ""}
                  onChange={(v) => setProfile({ ...profile, identity: v })}
                  placeholder="学生 / 在职 / 待业"
                  className="sm:col-span-2"
                />
              </div>
            </SectionCard>

          <SectionCard title="教育背景" icon={GraduationCap}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="学校" value={profile.school || ""} onChange={(v) => setProfile({ ...profile, school: v })} />
                <Field label="专业" value={profile.major || ""} onChange={(v) => setProfile({ ...profile, major: v })} />
                <Field
                  label="毕业年份"
                  value={profile.graduation_year || ""}
                  onChange={(v) => setProfile({ ...profile, graduation_year: v })}
                  placeholder="如 2027"
                />
              </div>
            </SectionCard>

          <SectionCard title="求职意向" icon={Briefcase}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="求职方向" value={profile.job_direction} onChange={(v) => setProfile({ ...profile, job_direction: v })} />
                <Field label="目标岗位" value={profile.target_role} onChange={(v) => setProfile({ ...profile, target_role: v })} />
                <Field label="工作年限" value={profile.experience_years} onChange={(v) => setProfile({ ...profile, experience_years: v })} placeholder="0-1 年" />
                <Field label="当前公司" value={profile.current_company || ""} onChange={(v) => setProfile({ ...profile, current_company: v })} placeholder="无则留空" />
                <Field
                  label="期望薪资"
                  value={profile.expected_salary || ""}
                  onChange={(v) => setProfile({ ...profile, expected_salary: v })}
                  placeholder="如 15-20K"
                  className="sm:col-span-2"
                />
              </div>
            </SectionCard>

          <SectionCard title="技能与介绍" icon={Sparkles}>
              <div className="space-y-4">
                <div className={FIELD_BOX_CLS}>
                  <label className={LABEL_CLS}>自我介绍</label>
                  <textarea
                    className={`${INPUT_CLS} min-h-[88px] resize-y`}
                    rows={4}
                    value={profile.self_intro || ""}
                    onChange={(e) => setProfile({ ...profile, self_intro: e.target.value })}
                    placeholder="简要介绍你的背景、优势与求职动机…"
                  />
                </div>
                <div>
                  <label className={`${LABEL_CLS} px-1 mb-2`}>技术领域</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {profile.tech_domains.map((d, i) => (
                      <div key={i} className={FIELD_BOX_CLS}>
                        <input
                          className={INPUT_CLS}
                          value={d}
                          placeholder="如 Python、React"
                          onChange={(e) => {
                            const domains = [...profile.tech_domains];
                            domains[i] = e.target.value;
                            setProfile({ ...profile, tech_domains: domains });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addDomain}
                    className="mt-2 text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    <Plus size={14} /> 添加领域
                  </button>
                </div>
              </div>
            </SectionCard>
        </div>

        {/* 右侧预览 */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                {(profile.name || "?").charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-lg truncate">{profile.name || "未填写姓名"}</h2>
                <p className="text-sm text-[var(--muted)] truncate">
                  {[profile.identity, profile.school].filter(Boolean).join(" · ") || "完善档案以生成预览"}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              {profile.major && (
                <PreviewRow icon={GraduationCap} label="专业" value={`${profile.major}${profile.graduation_year ? ` · ${profile.graduation_year}届` : ""}`} />
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
              {profile.expected_salary && (
                <PreviewRow icon={Briefcase} label="期望薪资" value={profile.expected_salary} />
              )}
            </div>

            {filledDomains.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] mb-2">技术栈</p>
                <div className="flex flex-wrap gap-1.5">
                  {filledDomains.map((d) => (
                    <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.self_intro && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] mb-1.5">自我介绍</p>
                <p className="text-sm text-[var(--foreground)] leading-relaxed line-clamp-4">{profile.self_intro}</p>
              </div>
            )}
          </div>

          {/* 完整度 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">档案完整度</span>
              <span className="text-sm font-bold text-brand-600">{completionPct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              完整档案可帮助 AI 生成更精准的面试问题
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border)]">
        <Icon size={18} className="text-brand-600" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
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
      <div className={FIELD_BOX_CLS}>
        <label className={LABEL_CLS}>{label}</label>
        <input
          type="text"
          className={INPUT_CLS}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
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
        <p className="text-sm font-medium text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
