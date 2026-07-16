"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { InterviewReport } from "@/types";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";

export default function ReportPage() {
  const params = useParams();
  const sessionId = Number(params.id);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getReport(sessionId)
      .then((data) => {
        setReport(data.report);
        setDuration(data.duration_minutes);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
        <Link href="/interview" className="btn-primary">返回面试</Link>
      </div>
    );
  }

  const scores = report.score_breakdown;

  return (
    <div className="page-shell max-w-3xl">
      <Link href="/history" className="text-sm text-[var(--muted)] hover:text-brand-600 flex items-center gap-1 mb-6 w-fit">
        <ArrowLeft size={14} /> 返回记录
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 surface-card p-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">面试评估报告</h1>
          {duration != null && (
            <p className="text-sm text-[var(--muted)] mt-1">面试时长：{duration} 分钟</p>
          )}
        </div>
        <div className="text-center sm:text-right px-4 py-2 rounded-2xl bg-brand-50 border border-brand-100">
          <div className="text-4xl font-bold text-brand-600 tabular-nums">{report.overall_score}</div>
          <div className="text-xs text-[var(--muted)] mt-0.5">综合评分</div>
        </div>
      </div>

      {/* 能力雷达 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {[
          { label: "技术能力", score: scores.technical },
          { label: "表达能力", score: scores.communication },
          { label: "项目深度", score: scores.project_depth },
          { label: "问题解决", score: scores.problem_solving },
          { label: "临场状态", score: scores.presence },
        ].map((item) => {
          // 缺失值（LLM 未返回或设为 0）显式显示 —，避免雷达图维度归零造成视觉失真。
          const display =
            typeof item.score === "number" && item.score > 0 ? item.score : "—";
          return (
            <div
              key={item.label}
              className="border border-[var(--border)] rounded-xl p-4 text-center bg-[var(--card)]"
            >
              <div
                className="text-2xl font-bold"
                style={{ color: typeof display === "number" ? scoreColor(display) : "#9ca3af" }}
              >
                {display}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">{item.label}</div>
              {typeof display === "number" && (
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${display}%`,
                      backgroundColor: scoreColor(display),
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

function RadarChart({ scores }: { scores: import("@/types").ScoreBreakdown }) {
  const dims = [
    { key: "technical", label: "技术" },
    { key: "communication", label: "表达" },
    { key: "project_depth", label: "项目" },
    { key: "problem_solving", label: "解题" },
    { key: "presence", label: "临场" },
  ] as const;
  const cx = 120;
  const cy = 120;
  const r = 80;
  const values = dims.map((d) => (scores[d.key] ?? scores.communication) / 100);
  const points = dims.map((_, i) => {
    const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
    const v = values[i] ?? 0;
    return `${cx + Math.cos(angle) * r * v},${cy + Math.sin(angle) * r * v}`;
  }).join(" ");
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="mb-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <h3 className="font-semibold mb-4 text-center">能力雷达图</h3>
      <div className="flex justify-center">
        <svg width="240" height="240" viewBox="0 0 240 240">
          {rings.map((ring) => (
            <polygon
              key={ring}
              points={dims.map((_, i) => {
                const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                return `${cx + Math.cos(angle) * r * ring},${cy + Math.sin(angle) * r * ring}`;
              }).join(" ")}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          ))}
          {dims.map((d, i) => {
            const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
            const x = cx + Math.cos(angle) * (r + 18);
            const y = cy + Math.sin(angle) * (r + 18);
            return (
              <text key={d.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-gray-500">
                {d.label}
              </text>
            );
          })}
          <polygon points={points} fill="rgba(59,130,246,0.35)" stroke="#3b82f6" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#3b82f6";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function Section({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  const bgMap: Record<string, string> = {
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    blue: "bg-blue-50 border-blue-200",
    brand: "bg-brand-50 border-brand-200",
  };
  return (
    <div className={`mt-4 p-4 rounded-xl border ${bgMap[color] || "border-[var(--border)]"}`}>
      <h3 className="font-semibold mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm flex items-start gap-2">
            <span className="text-[var(--muted)]">•</span>{item}
          </li>
        ))}
      </ul>
    </div>
  );
}
