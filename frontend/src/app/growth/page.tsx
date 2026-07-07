"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { GrowthRecord } from "@/types";
import {
  Loader2,
  TrendingUp,
  Target,
  Award,
  Play,
  BarChart3,
  Calendar,
  ListTodo,
  AlertCircle,
} from "lucide-react";
import { AnimatedCounter } from "@/components/effects";

export default function GrowthPage() {
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    api.getGrowthHistory().then((list) => {
      setRecords(list);
      setSelectedId(list[0]?.id ?? null);
    }).finally(() => setLoading(false));
  }, []);

  const allWeaknesses = records.flatMap((r) => r.weak_skills);
  const weaknessCount: Record<string, number> = {};
  allWeaknesses.forEach((w) => { weaknessCount[w] = (weaknessCount[w] || 0) + 1; });
  const topWeaknesses = Object.entries(weaknessCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalInterviews = records.length;
  const totalPlans = records.reduce((sum, r) => sum + r.training_plan.length, 0);
  const totalWeakSkills = new Set(allWeaknesses).size;

  const selected = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

  const growthPct = Math.min(100, totalInterviews * 25 + Math.min(totalPlans, 4) * 5);
  const growthLevel =
    totalInterviews === 0 ? "待启动" : totalInterviews < 3 ? "起步阶段" : totalInterviews < 6 ? "持续成长" : "进阶提升";

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <TrendingUp className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">成长追踪</h1>
          <p className="text-sm text-[var(--muted)]">
            系统记录你的面试表现，识别薄弱项并生成个性化训练计划。
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <Loader2 className="animate-spin" size={18} /> 加载中...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* 左侧主内容 */}
          <div className="space-y-5">
            <SectionCard title="高频薄弱项" icon={Target}>
              {topWeaknesses.length > 0 ? (
                <div className="space-y-4">
                  {topWeaknesses.map(([skill, count], index) => (
                    <div key={skill} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600 text-sm font-bold shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="font-medium text-slate-900">{skill}</span>
                          <span className="text-xs text-[var(--muted)]">出现 {count} 次</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-400 to-orange-400 rounded-full transition-[width] duration-500"
                            style={{ width: `${Math.min((count / totalInterviews) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <AlertCircle className="mx-auto text-slate-300 mb-2" size={28} />
                  <p className="text-sm text-[var(--muted)]">
                    完成模拟面试后，系统将自动汇总高频薄弱技能
                  </p>
                </div>
              )}
            </SectionCard>

            <SectionCard title="训练历史" icon={Award}>
              {records.length > 0 ? (
                <div className="space-y-3">
                  {records.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-colors ${
                        selectedId === r.id
                          ? "border-brand-500 bg-brand-50/40"
                          : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-slate-900">
                          面试 #{r.session_id}
                        </span>
                        <Link
                          href={`/report/${r.session_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          查看报告 →
                        </Link>
                      </div>
                      <p className="text-xs text-[var(--muted)] mb-2">
                        {new Date(r.created_at).toLocaleString("zh-CN")}
                      </p>
                      {r.weak_skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {r.weak_skills.map((s) => (
                            <span key={s} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-100">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.training_plan.length > 0 && (
                        <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                          {r.training_plan[0]}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Award className="mx-auto text-slate-300 mb-3" size={32} />
                  <p className="text-sm text-[var(--muted)] mb-4">
                    完成面试后将自动生成成长记录与训练计划
                  </p>
                  <Link
                    href="/interview"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                  >
                    <Play size={16} />
                    开始模拟面试
                  </Link>
                </div>
              )}
            </SectionCard>
          </div>

          {/* 右侧预览 — 对齐个人档案 */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white">
                  <TrendingUp size={24} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-lg">{growthLevel}</h2>
                  <p className="text-sm text-[var(--muted)] truncate">
                    {totalInterviews > 0 ? `已积累 ${totalInterviews} 条成长记录` : "等待你的第一次面试"}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <PreviewRow icon={BarChart3} label="成长记录" value={`${totalInterviews} 场`} />
                <PreviewRow icon={ListTodo} label="训练计划" value={`${totalPlans} 项`} />
                <PreviewRow icon={Target} label="薄弱技能" value={`${totalWeakSkills} 个`} />
                {selected && (
                  <PreviewRow
                    icon={Calendar}
                    label="最近训练"
                    value={new Date(selected.created_at).toLocaleDateString("zh-CN")}
                  />
                )}
              </div>

              {topWeaknesses.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--muted)] mb-2">重点关注</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topWeaknesses.slice(0, 4).map(([skill]) => (
                      <span key={skill} className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selected && selected.training_plan.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--muted)] mb-1.5">当前训练计划</p>
                  <ul className="space-y-1">
                    {selected.training_plan.slice(0, 3).map((t, i) => (
                      <li key={i} className="text-sm text-slate-700 leading-relaxed flex gap-1.5">
                        <span className="text-brand-500 shrink-0">{i + 1}.</span>
                        <span className="line-clamp-2">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">成长完成度</span>
                <span className="text-sm font-bold text-brand-600">{growthPct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${growthPct}%` }}
                />
              </div>
              <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
                多完成模拟面试并执行训练计划，可提升成长完成度
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href="/interview"
                  className="text-center text-xs py-2 rounded-lg border border-[var(--border)] hover:bg-brand-50 hover:border-brand-300 transition-colors"
                >
                  模拟面试
                </Link>
                <Link
                  href="/prep"
                  className="text-center text-xs py-2 rounded-lg border border-[var(--border)] hover:bg-brand-50 hover:border-brand-300 transition-colors"
                >
                  面试准备
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
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
