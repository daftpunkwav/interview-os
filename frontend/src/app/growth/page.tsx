"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
import { LoadError } from "@/components/LoadError";

type SystemInsights = Awaited<ReturnType<typeof api.getSystemInsights>>;

export default function GrowthPage() {
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [insights, setInsights] = useState<SystemInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, sys] = await Promise.all([
        api.getGrowthHistory(),
        api.getSystemInsights().catch(() => null),
      ]);
      setRecords(list);
      setInsights(sys);
      setSelectedId(list[0]?.id ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allWeaknesses = records.flatMap((r) => r.weak_skills);
  const weaknessCount: Record<string, number> = {};
  allWeaknesses.forEach((w) => {
    weaknessCount[w] = (weaknessCount[w] || 0) + 1;
  });
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
    totalInterviews === 0
      ? "待启动"
      : totalInterviews < 3
        ? "起步阶段"
        : totalInterviews < 6
          ? "持续成长"
          : "进阶提升";

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="icon-badge !bg-[#fef7e0] !text-[#b06000]">
          <TrendingUp size={20} />
        </div>
        <div>
          <h1 className="page-title">成长追踪</h1>
          <p className="page-desc">识别薄弱项，生成个性化训练计划。</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)] py-16 justify-center">
          <Loader2 className="animate-spin text-[var(--brand)]" size={18} /> 加载中…
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={load} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          <div className="space-y-4 min-w-0">
            <Section title="高频薄弱项" icon={Target}>
              {topWeaknesses.length > 0 ? (
                <div className="space-y-3.5">
                  {topWeaknesses.map(([skill, count], index) => (
                    <div key={skill} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[var(--danger-soft)] text-[var(--danger-ink)] text-xs font-semibold flex items-center justify-center shrink-0 tabular-nums">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-[var(--foreground)]">{skill}</span>
                          <span className="text-xs text-[var(--muted)]">出现 {count} 次</span>
                        </div>
                        <div className="progress !h-1.5">
                          <div
                            className="progress-bar !bg-[var(--g-red)]"
                            style={{
                              width: `${Math.min((count / Math.max(totalInterviews, 1)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <AlertCircle className="mx-auto text-[var(--muted-soft)] mb-2" size={28} />
                  <p className="text-sm text-[var(--muted)]">完成模拟面试后将自动汇总薄弱技能</p>
                </div>
              )}
            </Section>

            {insights && (
              <Section title="系统自我成长" icon={BarChart3}>
                <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
                  跨面试聚合：公司分布、工具调用、薄弱点沉淀。
                  {insights.interview_tools_enabled ? " 工具循环已开启。" : " 工具循环已关闭。"}
                  {insights.github_token_configured
                    ? " GitHub Token 已配置。"
                    : " 未配置 GITHUB_TOKEN。"}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {Object.entries(insights.company_session_counts || {})
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded-lg bg-[var(--popover)] px-3 py-2 text-xs flex justify-between gap-2"
                      >
                        <span className="text-[var(--muted)] truncate">{k}</span>
                        <span className="font-semibold tabular-nums shrink-0">{v} 场</span>
                      </div>
                    ))}
                </div>
                {insights.recent_probes && insights.recent_probes.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1.5 text-[var(--foreground)]">近期线索</p>
                    <ul className="text-xs text-[var(--text-secondary)] space-y-1 max-h-28 overflow-y-auto">
                      {insights.recent_probes.slice(0, 5).map((p, i) => (
                        <li key={i}>
                          · [{p.company || "—"}] {p.point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            )}

            <Section title="训练历史" icon={Award}>
              {records.length > 0 ? (
                <div className="space-y-2">
                  {records.map((r) => {
                    const active = selectedId === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full text-left rounded-[var(--radius)] border px-4 py-3.5 transition-colors ${
                          active
                            ? "border-[var(--brand)] bg-[var(--brand-softer)]"
                            : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[#fafbfc]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold">面试 #{r.session_id}</span>
                          <Link
                            href={`/report/${r.session_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-medium text-[var(--brand)] hover:underline"
                          >
                            报告 →
                          </Link>
                        </div>
                        <p className="text-xs text-[var(--muted)] mb-2">
                          {new Date(r.created_at).toLocaleString("zh-CN")}
                        </p>
                        {r.weak_skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {r.weak_skills.map((s) => (
                              <span key={s} className="chip chip-red !text-[11px]">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {r.training_plan.length > 0 && (
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                            {r.training_plan[0]}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <Award className="mx-auto text-[var(--muted-soft)] mb-3" size={32} />
                  <p className="text-sm text-[var(--muted)] mb-4">完成面试后将生成成长记录</p>
                  <Link href="/interview" className="btn-primary !h-9">
                    <Play size={14} />
                    开始模拟面试
                  </Link>
                </div>
              )}
            </Section>
          </div>

          <aside className="xl:sticky xl:top-6 space-y-3">
            <div className="surface-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--g-yellow)] to-[var(--g-red)] flex items-center justify-center text-white shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[15px] tracking-tight">{growthLevel}</h2>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {totalInterviews > 0
                      ? `已积累 ${totalInterviews} 条成长记录`
                      : "等待第一次面试"}
                  </p>
                </div>
              </div>
              <dl className="space-y-2.5 text-sm">
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
              </dl>
              {topWeaknesses.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <p className="text-[11px] font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
                    重点关注
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {topWeaknesses.slice(0, 4).map(([skill]) => (
                      <span key={skill} className="chip chip-yellow">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected && selected.training_plan.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <p className="text-[11px] font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                    当前计划
                  </p>
                  <ul className="space-y-1.5">
                    {selected.training_plan.slice(0, 3).map((t, i) => (
                      <li
                        key={i}
                        className="text-xs text-[var(--text-secondary)] leading-relaxed flex gap-1.5"
                      >
                        <span className="text-[var(--brand)] font-semibold shrink-0">{i + 1}.</span>
                        <span className="line-clamp-2">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="surface-card p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">成长完成度</span>
                <span className="text-sm font-semibold text-[var(--brand)] tabular-nums">
                  {growthPct}%
                </span>
              </div>
              <div className="progress">
                <div
                  className="progress-bar !bg-gradient-to-r !from-[var(--g-yellow)] !to-[var(--g-red)]"
                  style={{ width: `${growthPct}%` }}
                />
              </div>
              <p className="text-xs text-[var(--muted)] mt-2.5 leading-relaxed">
                多完成面试并执行训练计划，可提升完成度
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href="/interview" className="btn-secondary !h-9 !text-xs">
                  模拟面试
                </Link>
                <Link href="/prep" className="btn-secondary !h-9 !text-xs">
                  面试准备
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5">
      <header className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--brand-softer)] text-[var(--brand)] flex items-center justify-center">
          <Icon size={16} />
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      </header>
      {children}
    </section>
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
      <div className="min-w-0">
        <p className="text-[11px] text-[var(--muted)] leading-none">{label}</p>
        <p className="text-[13px] font-medium mt-1">{value}</p>
      </div>
    </div>
  );
}
