"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { GrowthRecord } from "@/types";
import { Loader2, TrendingUp, Target, Award } from "lucide-react";
import { FadeInView, StaggerContainer, StaggerItem, AnimatedCounter } from "@/components/effects";

export default function GrowthPage() {
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGrowthHistory().then(setRecords).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-[var(--muted)]">
        <Loader2 className="animate-spin" size={18} /> 加载中...
      </div>
    );
  }

  // 汇总所有薄弱技能
  const allWeaknesses = records.flatMap((r) => r.weak_skills);
  const weaknessCount: Record<string, number> = {};
  allWeaknesses.forEach((w) => { weaknessCount[w] = (weaknessCount[w] || 0) + 1; });
  const topWeaknesses = Object.entries(weaknessCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalInterviews = records.length;
  const totalPlans = records.reduce((sum, r) => sum + r.training_plan.length, 0);

  return (
    <div className="p-8 max-w-3xl">
      <FadeInView>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <TrendingUp className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">成长追踪</h1>
            <p className="text-sm text-[var(--muted)]">
              系统记录你的面试表现，识别薄弱项并生成个性化训练计划。
            </p>
          </div>
        </div>
      </FadeInView>

      {/* 统计卡片 */}
      <StaggerContainer className="grid grid-cols-2 gap-4 mt-6 mb-6">
        <StaggerItem>
          <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-center">
            <div className="text-3xl font-bold text-brand-600">
              <AnimatedCounter value={totalInterviews} />
            </div>
            <div className="text-sm text-[var(--muted)] mt-1">已完成面试</div>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-center">
            <div className="text-3xl font-bold text-brand-600">
              <AnimatedCounter value={totalPlans} />
            </div>
            <div className="text-sm text-[var(--muted)] mt-1">训练计划</div>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {topWeaknesses.length > 0 && (
        <FadeInView>
          <div className="border border-[var(--border)] rounded-xl p-5 bg-[var(--card)] mb-6">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <Target size={18} className="text-brand-600" /> 高频薄弱项
            </h2>
            <div className="space-y-3">
              {topWeaknesses.map(([skill, count], index) => (
                <motion.div
                  key={skill}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600 text-sm font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{skill}</span>
                      <span className="text-xs text-[var(--muted)]">出现 {count} 次</span>
                    </div>
                    <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-red-400 to-orange-400 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((count / totalInterviews) * 100, 100)}%` }}
                        transition={{ duration: 0.8, delay: index * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeInView>
      )}

      <FadeInView>
        <h2 className="font-semibold flex items-center gap-2 mb-4">
          <Award size={18} className="text-brand-600" /> 训练历史
        </h2>
      </FadeInView>

      <StaggerContainer className="space-y-3">
        {records.map((r) => (
          <StaggerItem key={r.id}>
            <motion.div
              className="border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-xs text-[var(--muted)] mb-2">
                面试 #{r.session_id} · {new Date(r.created_at).toLocaleString("zh-CN")}
              </div>
              {r.weak_skills.length > 0 && (
                <div className="mb-2">
                  <span className="text-sm font-medium">薄弱项：</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {r.weak_skills.map((s) => (
                      <motion.span
                        key={s}
                        className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full"
                        whileHover={{ scale: 1.1 }}
                      >
                        {s}
                      </motion.span>
                    ))}
                  </div>
                </div>
              )}
              {r.training_plan.length > 0 && (
                <div>
                  <span className="text-sm font-medium">训练计划：</span>
                  <ul className="mt-1 space-y-0.5">
                    {r.training_plan.map((t, i) => (
                      <motion.li
                        key={i}
                        className="text-sm text-[var(--muted)] flex items-start gap-2"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <span className="text-brand-400 mt-1">•</span>
                        {t}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          </StaggerItem>
        ))}
        {records.length === 0 && (
          <motion.p
            className="text-center text-[var(--muted)] py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            完成面试后将自动生成成长记录
          </motion.p>
        )}
      </StaggerContainer>
    </div>
  );
}
