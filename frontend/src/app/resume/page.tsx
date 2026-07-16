"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import type { Resume, ResumeAnalysis } from "@/types";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  Sparkles,
  ChevronDown,
  Star,
  Lightbulb,
  FolderOpen,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { LoadError } from "@/components/LoadError";

const DIM_LABELS: Record<string, string> = {
  structure_clarity: "结构清晰度",
  impact_quantification: "成果量化",
  tech_depth: "技术深度",
  project_narrative: "项目叙事",
  role_fit: "岗位匹配",
  keyword_ats: "ATS 关键词",
  credibility: "可信度",
  seniority_signal: "职级信号",
};

function asAnalysis(raw: Resume["analysis"]): ResumeAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  if (!("score" in raw)) return null;
  return raw as ResumeAnalysis;
}

function dimScore(v: ResumeAnalysis["dimension_scores"] extends infer D
  ? D extends Record<string, infer V> ? V : never
  : never): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "score" in v) return Number((v as { score: number }).score) || 0;
  return 0;
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    setLoadError("");
    return api.listResumes()
      .then((list) => {
        setResumes(list);
        setPreviewId((prev) => {
          if (prev && list.some((r) => r.id === prev)) return prev;
          const active = list.find((r) => r.is_active);
          return active?.id ?? list[0]?.id ?? null;
        });
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const previewResume = useMemo(
    () => resumes.find((r) => r.id === previewId) ?? null,
    [resumes, previewId],
  );

  const activeResume = resumes.find((r) => r.is_active);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await api.uploadResume(file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleSelect = (id: number) => {
    setPreviewId(id);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <FileText className="text-white" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">简历管理</h1>
          <p className="text-sm text-[var(--muted)]">
            支持 PDF、Word、Markdown 格式。AI 将自动解析为职业知识档案。
          </p>
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
        {/* 左侧：上传与列表 */}
        <div>
          <motion.div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors mb-6"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            {uploading ? (
              <Loader2 className="animate-spin mx-auto text-brand-600" size={32} />
            ) : (
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Upload className="mx-auto text-[var(--muted)]" size={32} />
              </motion.div>
            )}
            <p className="mt-2 text-sm font-medium">
              {uploading ? "正在解析简历..." : "点击上传简历"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">PDF · DOCX · MD · TXT</p>
            <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.md,.txt" className="hidden" onChange={handleUpload} />
          </motion.div>

          {error && (
            <motion.p
              className="text-sm text-red-600 mb-4"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          <div className="space-y-3">
            {resumes.map((r) => (
              <motion.div
                key={r.id}
                className={`border rounded-xl bg-[var(--card)] overflow-hidden transition-colors ${
                  r.id === previewId
                    ? "border-brand-500 ring-2 ring-brand-500/15"
                    : r.is_active
                      ? "border-brand-400"
                      : "border-[var(--border)]"
                }`}
                layout
              >
                <div
                  className="p-4 flex items-center justify-between cursor-pointer"
                  onClick={() => handleSelect(r.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-brand-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.filename}</span>
                        {r.is_active && (
                          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            投递简历
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--muted)] mt-0.5">
                        {r.score != null && <span>评分 {r.score}</span>}
                        <span>{r.file_type.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  <motion.div
                    animate={{ rotate: expandedId === r.id ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0"
                  >
                    <ChevronDown size={18} className="text-[var(--muted)]" />
                  </motion.div>
                </div>

                <AnimatePresence>
                  {expandedId === r.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                      <div className="px-4 pb-4 border-t border-[var(--border)] pt-4">
                        <div className="flex gap-2 mb-4">
                          <motion.button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await api.activateResume(r.id);
                              await load();
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-brand-50 transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            设为投递
                          </motion.button>
                          <motion.button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`确定删除简历「${r.filename}」？`)) return;
                              try {
                                await api.deleteResume(r.id);
                                toast.success("已删除");
                                await load();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "删除失败");
                              }
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Trash2 size={12} />
                            删除
                          </motion.button>
                          <motion.button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setError("");
                              setAnalyzingId(r.id);
                              try {
                                const data = await api.analyzeResume(r.id);
                                await load();
                                toast.success(
                                  `综合评分 ${data.score} · 已生成多维度评价与预测题`,
                                );
                                setPreviewId(r.id);
                                setExpandedId(r.id);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "分析失败");
                              } finally {
                                setAnalyzingId(null);
                              }
                            }}
                            disabled={analyzingId === r.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white flex items-center gap-1 disabled:opacity-60"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {analyzingId === r.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Sparkles size={12} />
                            )}
                            {analyzingId === r.id ? "Agent 评价中…" : "AI 深度评价"}
                          </motion.button>
                        </div>

                        <div className="text-sm space-y-2">
                          {r.parsed_profile.name && (
                            <p><span className="text-[var(--muted)]">姓名：</span>{r.parsed_profile.name}</p>
                          )}
                          {r.parsed_profile.summary && (
                            <p className="line-clamp-3"><span className="text-[var(--muted)]">摘要：</span>{r.parsed_profile.summary}</p>
                          )}
                          {r.parsed_profile.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {r.parsed_profile.skills.slice(0, 8).map((s) => (
                                <span key={s} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
            {resumes.length === 0 && (
              <p className="text-sm text-[var(--muted)] text-center py-8">
                暂无简历，请上传一份
              </p>
            )}
          </div>
        </div>

        {/* 右侧：预览与统计 */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <FolderOpen size={16} className="text-brand-600" />
              简历预览
            </h2>
            {previewResume ? (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0">
                    <FileText size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{previewResume.filename}</p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {previewResume.parsed_profile.name || "未解析到姓名"} · {previewResume.file_type.toUpperCase()}
                    </p>
                  </div>
                </div>

                {previewResume.score != null && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-[var(--muted)]">AI 评分</span>
                      <span className="font-bold text-brand-600">{previewResume.score}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.min(previewResume.score, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {previewResume.parsed_profile.summary && (
                  <div className="mb-4">
                    <p className="text-xs text-[var(--muted)] mb-1">摘要</p>
                    <p className="text-sm leading-relaxed line-clamp-4">{previewResume.parsed_profile.summary}</p>
                  </div>
                )}

                {previewResume.parsed_profile.skills.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-[var(--muted)] mb-2">技能标签</p>
                    <div className="flex flex-wrap gap-1.5">
                      {previewResume.parsed_profile.skills.map((s) => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {previewResume.parsed_profile.projects.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-[var(--muted)] mb-1.5">项目经历</p>
                    <ul className="space-y-1">
                      {previewResume.parsed_profile.projects.slice(0, 3).map((p, i) => (
                        <li key={i} className="text-sm flex items-start gap-1.5">
                          <CheckCircle size={12} className="text-green-500 mt-1 shrink-0" />
                          <span className="line-clamp-2">{p.name || p.description || "未命名项目"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(() => {
                  const analysis = asAnalysis(previewResume.analysis);
                  if (!analysis) return null;
                  const dims = analysis.dimension_scores || {};
                  const dimEntries = Object.entries(dims);
                  return (
                    <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
                      <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <Sparkles size={12} className="text-brand-600" />
                        Agent 深度评价
                      </p>
                      {analysis.overall_narrative && (
                        <p className="text-xs leading-relaxed text-slate-600">{analysis.overall_narrative}</p>
                      )}
                      {analysis.seniority_estimate && (
                        <p className="text-xs text-[var(--muted)]">
                          职级估计：<span className="text-slate-800 font-medium">{analysis.seniority_estimate}</span>
                        </p>
                      )}
                      {dimEntries.length > 0 && (
                        <div className="space-y-2">
                          {dimEntries.map(([k, v]) => {
                            const sc = dimScore(v as never);
                            return (
                              <div key={k}>
                                <div className="flex justify-between text-[11px] mb-0.5">
                                  <span className="text-[var(--muted)]">{DIM_LABELS[k] || k}</span>
                                  <span className="font-medium">{sc}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 rounded-full"
                                    style={{ width: `${Math.min(sc, 100)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {analysis.strengths && analysis.strengths.length > 0 && (
                        <div>
                          <p className="text-[11px] text-green-700 font-medium mb-1">优势</p>
                          <ul className="text-xs space-y-0.5 text-slate-600">
                            {analysis.strengths.slice(0, 4).map((s, i) => (
                              <li key={i}>· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.weaknesses && analysis.weaknesses.length > 0 && (
                        <div>
                          <p className="text-[11px] text-amber-700 font-medium mb-1">不足</p>
                          <ul className="text-xs space-y-0.5 text-slate-600">
                            {analysis.weaknesses.slice(0, 4).map((s, i) => (
                              <li key={i}>· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.red_flags && analysis.red_flags.length > 0 && (
                        <div className="rounded-lg bg-red-50 border border-red-100 p-2">
                          <p className="text-[11px] text-red-700 font-medium mb-1 flex items-center gap-1">
                            <AlertTriangle size={11} /> 风险点
                          </p>
                          <ul className="text-xs space-y-0.5 text-red-800/80">
                            {analysis.red_flags.slice(0, 3).map((s, i) => (
                              <li key={i}>· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.predicted_questions && analysis.predicted_questions.length > 0 && (
                        <div>
                          <p className="text-[11px] text-brand-700 font-medium mb-1">预测面试题</p>
                          <ul className="text-xs space-y-1 text-slate-600 max-h-36 overflow-y-auto">
                            {analysis.predicted_questions.slice(0, 8).map((q, i) => (
                              <li key={i} className="leading-snug">Q{i + 1}. {q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.rewrite_examples && analysis.rewrite_examples.length > 0 && (
                        <div>
                          <p className="text-[11px] text-indigo-700 font-medium mb-1">改写示例</p>
                          <ul className="text-xs space-y-1 text-slate-600">
                            {analysis.rewrite_examples.slice(0, 3).map((s, i) => (
                              <li key={i} className="leading-snug bg-slate-50 rounded p-1.5">· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.improvement_suggestions && analysis.improvement_suggestions.length > 0 && (
                        <div>
                          <p className="text-[11px] text-[var(--muted)] font-medium mb-1">改进建议</p>
                          <ul className="text-xs space-y-0.5 text-slate-600">
                            {analysis.improvement_suggestions.slice(0, 5).map((s, i) => (
                              <li key={i}>· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">上传简历后，将在此显示解析预览</p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Star size={16} className="text-amber-500" />
              简历概览
            </h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 py-3">
                <p className="text-2xl font-bold text-brand-600">{resumes.length}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">已上传</p>
              </div>
              <div className="rounded-xl bg-slate-50 py-3">
                <p className="text-2xl font-bold text-brand-600">
                  {resumes.filter((r) => r.score != null).length}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5">已评分</p>
              </div>
            </div>
            {activeResume && (
              <p className="text-xs text-[var(--muted)] mt-3 pt-3 border-t border-[var(--border)]">
                当前投递：<span className="text-slate-700 font-medium">{activeResume.filename}</span>
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Lightbulb size={16} className="text-brand-600" />
              使用提示
            </h2>
            <ul className="text-xs text-[var(--muted)] space-y-2 leading-relaxed">
              <li>· 设为「投递简历」后，模拟面试与面试准备将默认关联该份简历</li>
              <li>· 点击「AI 深度评价」获取多维度评分、风险点、改写示例与预测题</li>
              <li>· 支持多份简历管理，点击列表项可在右侧查看详情</li>
            </ul>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
