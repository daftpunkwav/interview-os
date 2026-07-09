"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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

  const stats = useMemo(() => ({
    total: sessions.length,
    completed: sessions.filter((s) => s.status === "completed").length,
    active: sessions.filter((s) => s.status === "active").length,
    avgScore: (() => {
      const scored = sessions.filter((s) => s.overall_score != null);
      if (scored.length === 0) return null;
      return Math.round(scored.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) / scored.length);
    })(),
  }), [sessions]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <BarChart3 className="text-white" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">面试记录</h1>
          <p className="text-sm text-[var(--muted)]">回顾你的每一次模拟面试</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <Loader2 className="animate-spin" size={18} /> 加载中...
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={load} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* 左侧列表 */}
          <div className="space-y-3">
            {sessions.map((s) => (
              <motion.button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left border rounded-xl p-4 bg-[var(--card)] transition-all ${
                  selectedId === s.id
                    ? "border-brand-500 ring-2 ring-brand-500/15 shadow-sm"
                    : "border-[var(--border)] hover:border-brand-300"
                }`}
                whileHover={{ y: -1 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.role} · {s.level}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="text-sm text-[var(--muted)] mt-0.5">
                      {s.company} · {s.workflow_type} · {new Date(s.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {s.overall_score != null && (
                      <span className="text-xl font-bold text-brand-600">{s.overall_score}</span>
                    )}
                    {s.status === "completed" && (
                      <Link
                        href={`/report/${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs px-2.5 py-1 rounded-lg bg-brand-600 text-white hover:bg-brand-700 flex items-center gap-1"
                      >
                        <FileText size={12} />
                        查看报告
                      </Link>
                    )}
                    {s.status === "active" && (
                      <Link
                        href={`/interview/${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs px-2.5 py-1 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 flex items-center gap-1"
                      >
                        <Play size={12} />
                        继续
                      </Link>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
            {sessions.length === 0 && (
              <p className="text-center text-[var(--muted)] py-12">
                暂无面试记录，开始你的第一次模拟面试吧
              </p>
            )}
          </div>

          {/* 右侧详情 */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-brand-600" />
                数据概览
              </h2>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-slate-50 py-3">
                  <p className="text-2xl font-bold text-brand-600">{stats.total}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">总场次</p>
                </div>
                <div className="rounded-xl bg-slate-50 py-3">
                  <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">已完成</p>
                </div>
                <div className="rounded-xl bg-slate-50 py-3">
                  <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">进行中</p>
                </div>
                <div className="rounded-xl bg-slate-50 py-3">
                  <p className="text-2xl font-bold text-brand-600">{stats.avgScore ?? "—"}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">平均分</p>
                </div>
              </div>
            </div>

            {selected ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <h2 className="font-semibold text-sm mb-4">场次详情</h2>
                <div className="space-y-2.5 text-sm">
                  <DetailRow label="岗位" value={`${selected.role} · ${selected.level}`} />
                  <DetailRow label="公司" value={selected.company} />
                  <DetailRow label="类型" value={selected.workflow_type} />
                  <DetailRow label="状态" value={<StatusBadge status={selected.status} />} />
                  <DetailRow
                    label="时间"
                    value={new Date(selected.created_at).toLocaleString("zh-CN")}
                  />
                  {selected.overall_score != null && (
                    <DetailRow label="综合评分" value={<span className="font-bold text-brand-600 text-lg">{selected.overall_score}</span>} />
                  )}
                  {selected.current_phase && selected.status === "active" && (
                    <DetailRow label="当前阶段" value={selected.current_phase} />
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-[var(--border)] space-y-2">
                  {selected.status === "completed" ? (
                    <Link
                      href={`/report/${selected.id}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                    >
                      <FileText size={16} />
                      查看面试报告
                      <ExternalLink size={14} />
                    </Link>
                  ) : selected.status === "active" ? (
                    <Link
                      href={`/interview/${selected.id}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                    >
                      <Play size={16} />
                      继续面试
                    </Link>
                  ) : (
                    <p className="text-xs text-[var(--muted)] text-center">该场次尚未开始</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-sm text-[var(--muted)]">选择一条记录查看详情</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    completed: { icon: CheckCircle2, text: "已完成", className: "bg-green-50 text-green-700" },
    active: { icon: Clock, text: "进行中", className: "bg-blue-50 text-blue-700" },
    pending: { icon: Circle, text: "待开始", className: "bg-gray-50 text-gray-600" },
  };
  const c = config[status as keyof typeof config] || config.pending;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${c.className}`}>
      <Icon size={12} />
      {c.text}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--muted)] shrink-0">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
