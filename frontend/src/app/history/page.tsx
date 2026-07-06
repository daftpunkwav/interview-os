"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { InterviewSession } from "@/types";
import { Loader2, ExternalLink } from "lucide-react";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listSessions().then(setSessions).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> 加载中...</div>;
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">面试记录</h1>

      <div className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="border border-[var(--border)] rounded-xl p-4 bg-[var(--card)] flex items-center justify-between">
            <div>
              <div className="font-medium">{s.role} · {s.level}</div>
              <div className="text-sm text-[var(--muted)] mt-0.5">
                {s.company} · {s.workflow_type} · {new Date(s.created_at).toLocaleString("zh-CN")}
              </div>
              <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded ${
                s.status === "completed" ? "bg-green-50 text-green-700" :
                s.status === "active" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-600"
              }`}>
                {s.status === "completed" ? "已完成" : s.status === "active" ? "进行中" : "待开始"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {s.overall_score != null && (
                <span className="text-2xl font-bold text-brand-600">{s.overall_score}</span>
              )}
              {s.status === "completed" ? (
                <Link href={`/report/${s.id}`} className="text-brand-600 hover:underline text-sm flex items-center gap-1">
                  查看报告 <ExternalLink size={14} />
                </Link>
              ) : s.status === "active" ? (
                <Link href={`/interview/${s.id}`} className="text-brand-600 hover:underline text-sm">
                  继续面试
                </Link>
              ) : null}
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="text-center text-[var(--muted)] py-12">暂无面试记录</p>
        )}
      </div>
    </div>
  );
}
