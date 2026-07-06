"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GrowthRecord } from "@/types";
import { Loader2, TrendingUp, Target } from "lucide-react";

export default function GrowthPage() {
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGrowthHistory().then(setRecords).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> 加载中...</div>;
  }

  // 汇总所有薄弱技能
  const allWeaknesses = records.flatMap((r) => r.weak_skills);
  const weaknessCount: Record<string, number> = {};
  allWeaknesses.forEach((w) => { weaknessCount[w] = (weaknessCount[w] || 0) + 1; });
  const topWeaknesses = Object.entries(weaknessCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">成长追踪</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        系统记录你的面试表现，识别薄弱项并生成个性化训练计划。
      </p>

      {topWeaknesses.length > 0 && (
        <div className="border border-[var(--border)] rounded-xl p-5 bg-[var(--card)] mb-6">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <Target size={18} className="text-brand-600" /> 高频薄弱项
          </h2>
          <div className="space-y-2">
            {topWeaknesses.map(([skill, count]) => (
              <div key={skill} className="flex items-center justify-between text-sm">
                <span>{skill}</span>
                <span className="text-xs text-[var(--muted)]">出现 {count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-brand-600" /> 训练历史
      </h2>

      <div className="space-y-3">
        {records.map((r) => (
          <div key={r.id} className="border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]">
            <div className="text-xs text-[var(--muted)] mb-2">
              面试 #{r.session_id} · {new Date(r.created_at).toLocaleString("zh-CN")}
            </div>
            {r.weak_skills.length > 0 && (
              <div className="mb-2">
                <span className="text-sm font-medium">薄弱项：</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {r.weak_skills.map((s) => (
                    <span key={s} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {r.training_plan.length > 0 && (
              <div>
                <span className="text-sm font-medium">训练计划：</span>
                <ul className="mt-1 space-y-0.5">
                  {r.training_plan.map((t, i) => (
                    <li key={i} className="text-sm text-[var(--muted)]">• {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {records.length === 0 && (
          <p className="text-center text-[var(--muted)] py-12">完成面试后将自动生成成长记录</p>
        )}
      </div>
    </div>
  );
}
