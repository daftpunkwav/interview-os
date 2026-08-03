"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { InterviewReport, ScoreBreakdown } from "@/types";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";

export default function ReportPage() {
  const params = useParams();
  const sessionId = Number(params.id);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [messagesCount, setMessagesCount] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const applyPayload = (data: {
    report: InterviewReport;
    duration_minutes?: number;
    messages_count?: number;
  }) => {
    setReport(data.report);
    setDuration(data.duration_minutes);
    setMessagesCount(data.messages_count);
  };

  const loadReport = () => {
    setLoading(true);
    setError("");
    api.getReport(sessionId)
      .then(applyPayload)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const startPolling = () => {
      let attempts = 0;
      const maxAttempts = 45;
      const tick = () => {
        if (cancelled) return;
        attempts += 1;
        api.getReport(sessionId)
          .then((data) => {
            if (cancelled) return;
            applyPayload(data);
            setError("");
            setLoading(false);
          })
          .catch((e) => {
            if (cancelled) return;
            const msg = e instanceof Error ? e.message : String(e);
            if (attempts < maxAttempts && /尚未|不存在|404|生成/.test(msg)) {
              setTimeout(tick, 2000);
              return;
            }
            setError(msg);
            setLoading(false);
          });
      };
      tick();
    };

    // 先读报告；仅缺失/生成中时才触发 finish 补生成
    api
      .getReport(sessionId)
      .then((data) => {
        if (cancelled) return;
        applyPayload(data);
        setError("");
        setLoading(false);
      })
      .catch(async (e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const missing = /尚未|不存在|404|生成/.test(msg) || (e && typeof e === "object" && "status" in e && Number(e.status) === 404);
        if (missing) {
          void api.finishInterview(sessionId).catch(() => undefined);
          try {
            const streamedReport = await api.getReportStream(
              sessionId,
              () => {},
              ctrl.signal,
            );
            if (cancelled) return;
            setReport(streamedReport);
            setError("");
            setLoading(false);
            api.getReport(sessionId).then((data) => {
              if (!cancelled) applyPayload(data);
            }).catch(() => undefined);
          } catch {
            if (!cancelled) startPolling();
          }
          return;
        }
        setError(msg);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[40vh] gap-2 text-[var(--muted)]">
        <Loader2 className="animate-spin text-brand-500" size={18} /> 生成报告中…
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="page-shell text-center py-16">
        <p className="text-[var(--muted)] mb-4">{error || "报告不可用"}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => {
              // 若 WS 后台未落库，补一次 HTTP 生成后再拉取
              api
                .finishInterview(sessionId)
                .catch(() => undefined)
                .finally(() => loadReport());
            }}
          >
            <RefreshCw size={16} /> 重新加载
          </button>
          <Link href="/interview" className="btn-primary">返回面试</Link>
        </div>
      </div>
    );
  }

  const scores = normalizeScores(report.score_breakdown);
  const shortSession =
    (typeof messagesCount === "number" && messagesCount < 6) ||
    (typeof duration === "number" && duration < 5);

  return (
    <div className="page-shell max-w-3xl">
      <Link href="/history" className="text-sm text-[var(--muted)] hover:text-brand-600 flex items-center gap-1 mb-6 w-fit">
        <ArrowLeft size={14} /> 返回记录
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 surface-card p-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">面试评估报告</h1>
          {duration != null && (
            <p className="text-sm text-[var(--muted)] mt-1">
              面试时长：{duration} 分钟
              {typeof messagesCount === "number" ? ` · 有效对话 ${messagesCount} 条` : ""}
            </p>
          )}
        </div>
        <div className="text-center sm:text-right px-4 py-2 rounded-2xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20">
          <div
            className="text-4xl font-bold tabular-nums"
            style={{ color: scoreColor(report.overall_score) }}
          >
            {formatScore(report.overall_score)}
          </div>
          <div className="text-xs text-[var(--muted)] mt-0.5">综合评分 / 100</div>
        </div>
      </div>

      {shortSession && (
        <div className="mb-6 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-800 dark:text-amber-200">
          本场对话较短或有效作答很少，维度分可能偏低或接近 0，属评估结果而非页面缺数。
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: "技术能力", score: scores.technical },
          { label: "表达能力", score: scores.communication },
          { label: "项目深度", score: scores.project_depth },
          { label: "问题解决", score: scores.problem_solving },
          { label: "临场状态", score: scores.presence },
          { label: "话轮礼貌", score: scores.politeness },
        ].map((item) => {
          const display = formatScore(item.score);
          const scoreVal = typeof item.score === "number" ? item.score : null;
          const numeric = scoreVal != null;
          return (
            <div
              key={item.label}
              className="border border-[var(--border)] rounded-xl p-4 text-center bg-[var(--card)]"
            >
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: numeric ? scoreColor(scoreVal) : "var(--muted)" }}
              >
                {display}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">{item.label}</div>
              {numeric && scoreVal != null && (
                <div className="mt-2 h-1.5 bg-[var(--border)]/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, scoreVal))}%`,
                      backgroundColor: scoreColor(scoreVal),
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <RadarChart scores={scores} />

      <Section title="优势" items={report.strengths} color="green" />
      <Section title="不足" items={report.weaknesses} color="red" />
      <Section title="简历改进建议" items={report.resume_suggestions || []} color="blue" />
      <Section title="面试表现建议" items={report.interview_suggestions || []} color="blue" />
      <Section title="综合建议" items={report.improvement_suggestions} color="blue" />
      <Section title="下一阶段训练计划" items={report.training_plan} color="brand" />

      {report.presence_moments && report.presence_moments.length > 0 && (
        <Section title="临场关键时刻" items={report.presence_moments} color="brand" />
      )}

      {report.face_analysis_summary && (
        <div className="mt-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h3 className="font-semibold mb-2">面试状态分析</h3>
          <p className="text-sm text-[var(--muted)]">{report.face_analysis_summary}</p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/interview" className="btn-primary">
          <RefreshCw size={16} /> 再来一次
        </Link>
        <Link href="/growth" className="btn-secondary">
          查看成长记录
        </Link>
      </div>
    </div>
  );
}

/** 保证雷达/卡片拿到完整数值字段；缺省为 null（显示 —），0 视为有效分。 */
function normalizeScores(raw: ScoreBreakdown | undefined | null): {
  technical: number | null;
  communication: number | null;
  project_depth: number | null;
  problem_solving: number | null;
  presence: number | null;
  politeness: number | null;
  overall: number | null;
} {
  const pick = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
  return {
    technical: pick(raw?.technical),
    communication: pick(raw?.communication),
    project_depth: pick(raw?.project_depth),
    problem_solving: pick(raw?.problem_solving),
    presence: pick(raw?.presence),
    politeness: pick(raw?.politeness),
    overall: pick(raw?.overall),
  };
}

function formatScore(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return String(Math.round(score));
}

function RadarChart({
  scores,
}: {
  scores: ReturnType<typeof normalizeScores>;
}) {
  const dims = [
    { key: "technical" as const, label: "技术" },
    { key: "communication" as const, label: "表达" },
    { key: "project_depth" as const, label: "项目" },
    { key: "problem_solving" as const, label: "解题" },
    { key: "presence" as const, label: "临场" },
    { key: "politeness" as const, label: "礼貌" },
  ];
  const cx = 120;
  const cy = 120;
  const r = 80;
  const values = dims.map((d) => {
    const v = scores[d.key];
    return typeof v === "number" ? Math.min(1, Math.max(0, v / 100)) : 0;
  });
  const points = dims
    .map((_, i) => {
      const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
      const v = values[i] ?? 0;
      return `${cx + Math.cos(angle) * r * v},${cy + Math.sin(angle) * r * v}`;
    })
    .join(" ");
  const rings = [0.25, 0.5, 0.75, 1];
  const hasAny = values.some((v) => v > 0);

  return (
    <div className="mb-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <h3 className="font-semibold mb-1 text-center">能力雷达图</h3>
      <p className="text-xs text-[var(--muted)] text-center mb-4">各轴满分 100；0 分会落在中心附近</p>
      <div className="flex justify-center">
        <svg width="240" height="240" viewBox="0 0 240 240" aria-label="能力雷达图">
          {rings.map((ring) => (
            <polygon
              key={ring}
              points={dims
                .map((_, i) => {
                  const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                  return `${cx + Math.cos(angle) * r * ring},${cy + Math.sin(angle) * r * ring}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
            />
          ))}
          {dims.map((d, i) => {
            const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
            const x = cx + Math.cos(angle) * (r + 18);
            const y = cy + Math.sin(angle) * (r + 18);
            const score = scores[d.key];
            return (
              <text
                key={d.key}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-[var(--muted)]"
                style={{ fontSize: 10 }}
              >
                {d.label}
                {typeof score === "number" ? ` ${score}` : ""}
              </text>
            );
          })}
          {hasAny && (
            <polygon
              points={points}
              fill="rgba(59,130,246,0.35)"
              stroke="#3b82f6"
              strokeWidth="2"
            />
          )}
          {!hasAny && (
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--muted)]"
              style={{ fontSize: 11 }}
            >
              暂无有效维度分
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

function scoreColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "var(--muted)";
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#3b82f6";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function Section({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  const bgMap: Record<string, string> = {
    green: "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25",
    red: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25",
    blue: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25",
    brand: "bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/25",
  };
  return (
    <div className={`mt-4 p-4 rounded-xl border ${bgMap[color] || "border-[var(--border)]"}`}>
      <h3 className="font-semibold mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm flex items-start gap-2">
            <span className="text-[var(--muted)]">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
