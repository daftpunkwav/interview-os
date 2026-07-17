"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { InterviewSession } from "@/types";
import {
  Loader2,
  ExternalLink,
  BarChart3,
  Clock,
  CheckCircle2,
  Circle,
  Play,
  FileText,
  TrendingUp,
} from "lucide-react";
import { LoadError } from "@/components/LoadError";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await api.listSessions();
      setSessions(list);
      const firstCompleted = list.find((s) => s.status === "completed");
      const fallback = list[0];
      setSelectedId(firstCompleted?.id ?? fallback?.id ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  const stats = useMemo(
    () => ({
      total: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      active: sessions.filter((s) => s.status === "active").length,
      avgScore: (() => {
        const scored = sessions.filter((s) => s.overall_score != null);
        if (scored.length === 0) return null;
        return Math.round(
          scored.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) / scored.length,
        );
      })(),
    }),
    [sessions],
  );

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="icon-badge !bg-[#dbeafe] !text-[#0043ad]">
          <BarChart3 size={20} />
        </div>
        <div>
          <h1 className="page-title">面试记录</h1>
          <p className="page-desc">回顾每一次模拟面试与报告</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)] py-16 justify-center">
          <Loader2 className="animate-spin text-[var(--brand)]" size={18} /> 加载记录…
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={load} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          <div className="surface-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">全部场次</h2>
              <span className="chip chip-gray">{stats.total} 场</span>
            </div>

            {sessions.length === 0 ? (
              <div className="empty-state !py-14">
                <div className="empty-state-icon">
                  <BarChart3 size={24} />
                </div>
                <p className="text-sm mb-4">暂无面试记录</p>
                <Link href="/interview" className="btn-primary !h-9">
                  <Play size={14} />
                  开始模拟面试
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {sessions.map((s) => {
                  const active = selectedId === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors ${
                          active ? "bg-[var(--brand-softer)]" : "hover:bg-[#fafbfc]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[var(--foreground)]">
                              {s.role} · {s.level}
                            </span>
                            <StatusBadge status={s.status} />
                          </div>
                          <p className="text-xs text-[var(--muted)] mt-1">
                            {s.company} · {s.workflow_type} ·{" "}
                            {new Date(s.created_at).toLocaleString("zh-CN")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {s.overall_score != null && (
                            <p className="text-lg font-semibold text-[var(--brand)] tabular-nums leading-none">
                              {s.overall_score}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <aside className="xl:sticky xl:top-6 space-y-3">
            <div className="surface-card p-5">
              <h2 className="text-sm font-semibold mb-3.5 flex items-center gap-2 tracking-tight">
                <TrendingUp size={15} className="text-[var(--brand)]" />
                数据概览
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <StatCell value={stats.total} label="总场次" />
                <StatCell value={stats.completed} label="已完成" accent="green" />
                <StatCell value={stats.active} label="进行中" accent="blue" />
                <StatCell value={stats.avgScore ?? "—"} label="平均分" />
              </div>
            </div>

            <div className="surface-card p-5">
              {selected ? (
                <>
                  <h2 className="text-sm font-semibold mb-3.5 tracking-tight">场次详情</h2>
                  <dl className="space-y-2.5 text-sm">
                    <DetailRow label="岗位" value={`${selected.role} · ${selected.level}`} />
                    <DetailRow label="公司" value={selected.company} />
                    <DetailRow label="类型" value={selected.workflow_type} />
                    <DetailRow label="状态" value={<StatusBadge status={selected.status} />} />
                    <DetailRow
                      label="时间"
                      value={new Date(selected.created_at).toLocaleString("zh-CN")}
                    />
                    {selected.overall_score != null && (
                      <DetailRow
                        label="综合评分"
                        value={
                          <span className="font-semibold text-[var(--brand)] text-base tabular-nums">
                            {selected.overall_score}
                          </span>
                        }
                      />
                    )}
                    {selected.current_phase && selected.status === "active" && (
                      <DetailRow label="当前阶段" value={selected.current_phase} />
                    )}
                  </dl>

                  <div className="mt-5 pt-4 border-t border-[var(--border)]">
                    {selected.status === "completed" ? (
                      <Link href={`/report/${selected.id}`} className="btn-primary w-full">
                        <FileText size={16} />
                        查看报告
                        <ExternalLink size={14} />
                      </Link>
                    ) : selected.status === "active" ? (
                      <Link href={`/interview/${selected.id}`} className="btn-primary w-full">
                        <Play size={16} />
                        继续面试
                      </Link>
                    ) : (
                      <p className="text-xs text-[var(--muted)] text-center py-1">该场次尚未开始</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)] text-center py-6">选择一条记录查看详情</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StatCell({
  value,
  label,
  accent,
}: {
  value: string | number;
  label: string;
  accent?: "green" | "blue";
}) {
  const color =
    accent === "green"
      ? "text-[var(--g-green)]"
      : accent === "blue"
        ? "text-[var(--brand)]"
        : "text-[var(--brand)]";
  return (
    <div className="rounded-lg bg-[var(--popover)] py-3 text-center">
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-[var(--muted)] mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    completed: { icon: CheckCircle2, text: "已完成", className: "chip-green" },
    active: { icon: Clock, text: "进行中", className: "chip-blue" },
    pending: { icon: Circle, text: "待开始", className: "chip-gray" },
  };
  const c = config[status as keyof typeof config] || config.pending;
  const Icon = c.icon;
  return (
    <span className={`chip ${c.className}`}>
      <Icon size={11} />
      {c.text}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-[var(--muted)] shrink-0 pt-0.5">{label}</span>
      <span className="text-right text-[13px] font-medium text-[var(--foreground)]">{value}</span>
    </div>
  );
}
