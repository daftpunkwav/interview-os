"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { InterviewSession } from "@/types";
import { Loader2, ExternalLink, BarChart3, Clock, CheckCircle2, Circle } from "lucide-react";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listSessions().then(setSessions).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-3xl">
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
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <motion.div
              key={s.id}
              className="border border-[var(--border)] rounded-xl p-4 bg-[var(--card)] flex items-center justify-between group"
              whileHover={{ y: -2, scale: 1.005 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.role} · {s.level}</span>
                  <StatusBadge status={s.status} />
                </div>
                <div className="text-sm text-[var(--muted)] mt-0.5">
                  {s.company} · {s.workflow_type} · {new Date(s.created_at).toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {s.overall_score != null && (
                  <span className="text-2xl font-bold text-brand-600">{s.overall_score}</span>
                )}
                {s.status === "completed" ? (
                  <Link href={`/report/${s.id}`} className="text-brand-600 hover:text-brand-700 text-sm flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    查看报告 <ExternalLink size={14} />
                  </Link>
                ) : s.status === "active" ? (
                  <Link href={`/interview/${s.id}`} className="text-brand-600 hover:text-brand-700 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    继续面试
                  </Link>
                ) : null}
              </div>
            </motion.div>
          ))}
          {sessions.length === 0 && (
            <p className="text-center text-[var(--muted)] py-12">
              暂无面试记录，开始你的第一次模拟面试吧
            </p>
          )}
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
