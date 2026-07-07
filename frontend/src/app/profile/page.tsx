"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { UserProfile } from "@/types";
import { Save, Loader2, User, Plus } from "lucide-react";
import { FadeInView, StaggerContainer, StaggerItem } from "@/components/effects";

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
      <div className="p-8 flex items-center gap-2 text-[var(--muted)]">
        <Loader2 className="animate-spin" size={18} /> 加载中...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <FadeInView>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <User className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">个人档案</h1>
            <p className="text-sm text-[var(--muted)]">
              本地存储，无需注册登录。信息将用于个性化面试问题生成。
            </p>
          </div>
        </div>
      </FadeInView>

      <StaggerContainer className="space-y-4 mt-6">
        <StaggerItem><Field label="姓名" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} /></StaggerItem>
        <StaggerItem><Field label="性别" value={profile.gender || ""} onChange={(v) => setProfile({ ...profile, gender: v })} /></StaggerItem>
        <StaggerItem><Field label="身份" value={profile.identity || ""} onChange={(v) => setProfile({ ...profile, identity: v })} placeholder="学生/在职/待业" /></StaggerItem>
        <StaggerItem><Field label="学校" value={profile.school || ""} onChange={(v) => setProfile({ ...profile, school: v })} /></StaggerItem>
        <StaggerItem><Field label="专业" value={profile.major || ""} onChange={(v) => setProfile({ ...profile, major: v })} /></StaggerItem>
        <StaggerItem><Field label="毕业年份" value={profile.graduation_year || ""} onChange={(v) => setProfile({ ...profile, graduation_year: v })} /></StaggerItem>
        <StaggerItem><Field label="求职方向" value={profile.job_direction} onChange={(v) => setProfile({ ...profile, job_direction: v })} /></StaggerItem>
        <StaggerItem><Field label="目标岗位" value={profile.target_role} onChange={(v) => setProfile({ ...profile, target_role: v })} /></StaggerItem>
        <StaggerItem><Field label="工作年限" value={profile.experience_years} onChange={(v) => setProfile({ ...profile, experience_years: v })} /></StaggerItem>
        <StaggerItem><Field label="当前公司" value={profile.current_company || ""} onChange={(v) => setProfile({ ...profile, current_company: v })} /></StaggerItem>
        <StaggerItem><Field label="期望薪资" value={profile.expected_salary || ""} onChange={(v) => setProfile({ ...profile, expected_salary: v })} /></StaggerItem>

        <StaggerItem>
          <div>
            <label className="block text-sm font-medium mb-1.5">自我介绍</label>
            <textarea className="input" rows={3} value={profile.self_intro || ""} onChange={(e) => setProfile({ ...profile, self_intro: e.target.value })} />
          </div>
        </StaggerItem>

        <StaggerItem>
          <div>
            <label className="block text-sm font-medium mb-1.5">技术领域</label>
            {profile.tech_domains.map((d, i) => (
              <input
                key={i}
                className="input mb-2"
                value={d}
                placeholder="如：Python、React、分布式系统"
                onChange={(e) => {
                  const domains = [...profile.tech_domains];
                  domains[i] = e.target.value;
                  setProfile({ ...profile, tech_domains: domains });
                }}
              />
            ))}
            <motion.button
              onClick={addDomain}
              className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus size={14} /> 添加领域
            </motion.button>
          </div>
        </StaggerItem>
      </StaggerContainer>

      <FadeInView delay={0.3} className="mt-6 flex items-center gap-3">
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
        {msg && (
          <motion.span
            className="text-sm text-green-600"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            {msg}
          </motion.span>
        )}
      </FadeInView>

      <style jsx global>{`
        .input {
          @apply w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all;
        }
        .btn-primary {
          @apply px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors;
        }
      `}</style>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
