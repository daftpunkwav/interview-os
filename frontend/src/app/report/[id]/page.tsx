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
    return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> 生成报告中...</div>;
  }

  if (error || !report) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--muted)] mb-4">{error || "报告不可用"}</p>
        <Link href="/interview" className="text-brand-600 hover:underline">返回面试</Link>
      </div>
    );
  }

  const scores = report.score_breakdown;

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/history" className="text-sm text-[var(--muted)] hover:text-brand-600 flex items-center gap-1 mb-6">
        <ArrowLeft size={14} /> 返回记录
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">面试评估报告</h1>
          {duration && <p className="text-sm text-[var(--muted)]">面试时长：{duration} 分钟</p>}
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-brand-600">{report.overall_score}</div>
          <div className="text-xs text-[var(--muted)]">综合评分</div>
        </div>
      </div>

      {/* 能力雷达 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "技术能力", score: scores.technical },
          { label: "表达能力", score: scores.communication },
          { label: "项目深度", score: scores.project_depth },
          { label: "问题解决", score: scores.problem_solving },
        ].map((item) => (
          <div key={item.label} className="border border-[var(--border)] rounded-xl p-4 text-center bg-[var(--card)]">
            <div className="text-2xl font-bold" style={{ color: scoreColor(item.score) }}>{item.score}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{item.label}</div>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${item.score}%`, backgroundColor: scoreColor(item.score) }} />
            </div>
          </div>
        ))}
      </div>

      <Section title="优势" items={report.strengths} color="green" />
      <Section title="不足" items={report.weaknesses} color="red" />
      <Section title="改进建议" items={report.improvement_suggestions} color="blue" />
      <Section title="下一阶段训练计划" items={report.training_plan} color="brand" />

      {report.face_analysis_summary && (
        <div className="mt-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h3 className="font-semibold mb-2">面试状态分析</h3>
          <p className="text-sm text-[var(--muted)]">{report.face_analysis_summary}</p>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Link href="/interview" className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">
          <RefreshCw size={16} /> 再来一次
        </Link>
        <Link href="/growth" className="px-5 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-gray-50">
          查看成长记录
        </Link>
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
