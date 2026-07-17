"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import type { Resume, ResumeAnalysis } from "@/types";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  Sparkles,
  Star,
  Lightbulb,
  FolderOpen,
  AlertTriangle,
  Trash2,
  ChevronRight,
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

function dimScore(
  v: ResumeAnalysis["dimension_scores"] extends infer D
    ? D extends Record<string, infer V>
      ? V
      : never
    : never,
): number {
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
  const [previewId, setPreviewId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    setLoadError("");
    return api
      .listResumes()
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

  useEffect(() => {
    load();
  }, []);

  const previewResume = useMemo(
    () => resumes.find((r) => r.id === previewId) ?? null,
    [resumes, previewId],
  );

  const analysis = useMemo(
    () => (previewResume ? asAnalysis(previewResume.analysis) : null),
    [previewResume],
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
      toast.success("简历已上传并解析");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleAnalyze = async (id: number) => {
    setError("");
    setAnalyzingId(id);
    try {
      const data = await api.analyzeResume(id);
      await load();
      toast.success(`综合评分 ${data.score} · 已生成多维度评价`);
      setPreviewId(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分析失败");
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="icon-badge !bg-[#e6f4ea] !text-[#137333]">
          <FileText size={20} />
        </div>
        <div>
          <h1 className="page-title">简历管理</h1>
          <p className="page-desc">PDF · Word · Markdown · TXT。AI 解析为职业知识档案并给出深度评价。</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)] py-16 justify-center">
          <Loader2 className="animate-spin text-[var(--brand)]" size={18} /> 加载中…
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={load} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          {/* ===== 左侧：上传 + 列表 + 深度评价 ===== */}
          <div className="space-y-4 min-w-0">
            {/* 上传区 */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full surface-card border-dashed !border-2 hover:border-[var(--brand)] hover:bg-[var(--brand-softer)]/40 transition-colors p-6 sm:p-8 text-center cursor-pointer disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="animate-spin mx-auto text-[var(--brand)]" size={28} />
              ) : (
                <Upload className="mx-auto text-[var(--muted)]" size={28} strokeWidth={1.5} />
              )}
              <p className="mt-2.5 text-sm font-medium text-[var(--foreground)]">
                {uploading ? "正在解析简历…" : "点击或拖拽上传简历"}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">PDF · DOCX · MD · TXT · 最大 10MB</p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.doc,.md,.txt"
                className="hidden"
                onChange={handleUpload}
              />
            </button>

            {error && <div className="alert alert-error">{error}</div>}

            {/* 简历列表 */}
            <div className="surface-card overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">我的简历</h2>
                <span className="chip chip-gray">{resumes.length} 份</span>
              </div>

              {resumes.length === 0 ? (
                <div className="empty-state !py-12">
                  <div className="empty-state-icon">
                    <FileText size={24} />
                  </div>
                  <p className="text-sm">暂无简历，请先上传一份</p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {resumes.map((r) => {
                    const selected = r.id === previewId;
                    return (
                      <li key={r.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setPreviewId(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") setPreviewId(r.id);
                          }}
                          className={`px-4 py-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                            selected ? "bg-[var(--brand-softer)]" : "hover:bg-[#fafbfc]"
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              selected
                                ? "bg-[var(--brand-soft)] text-[var(--brand-deep)]"
                                : "bg-[var(--popover)] text-[var(--muted)]"
                            }`}
                          >
                            <FileText size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate text-[var(--foreground)]">
                                {r.filename}
                              </span>
                              {r.is_active && <span className="chip chip-blue">投递</span>}
                              {r.score != null && (
                                <span className="chip chip-green">评分 {r.score}</span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--muted)] mt-0.5">
                              {r.file_type.toUpperCase()}
                              {r.parsed_profile.name ? ` · ${r.parsed_profile.name}` : ""}
                            </p>
                          </div>
                          <ChevronRight
                            size={16}
                            className={`shrink-0 ${selected ? "text-[var(--brand)]" : "text-[var(--muted-soft)]"}`}
                          />
                        </div>

                        {/* 选中项操作条 */}
                        {selected && (
                          <div className="px-4 pb-3.5 flex flex-wrap gap-2 bg-[var(--brand-softer)] border-t border-[var(--brand-soft)]/60">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await api.activateResume(r.id);
                                await load();
                                toast.success("已设为投递简历");
                              }}
                              className="btn-secondary !h-8 !px-3 !text-xs"
                            >
                              设为投递
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleAnalyze(r.id);
                              }}
                              disabled={analyzingId === r.id}
                              className="btn-primary !h-8 !px-3 !text-xs"
                            >
                              {analyzingId === r.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Sparkles size={12} />
                              )}
                              {analyzingId === r.id ? "评价中…" : "AI 深度评价"}
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`确定删除「${r.filename}」？`)) return;
                                try {
                                  await api.deleteResume(r.id);
                                  toast.success("已删除");
                                  await load();
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "删除失败");
                                }
                              }}
                              className="btn-tertiary !h-8 !px-3 !text-xs text-[var(--danger-ink)] hover:!bg-[var(--danger-soft)]"
                            >
                              <Trash2 size={12} />
                              删除
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Agent 深度评价 · 左侧下方全宽 */}
            <section className="surface-card overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles size={16} className="text-[var(--brand)] shrink-0" />
                  <h2 className="text-sm font-semibold tracking-tight">Agent 深度评价</h2>
                </div>
                {previewResume && analysis && (
                  <span className="chip chip-blue shrink-0">综合 {analysis.score}</span>
                )}
              </div>

              <div className="p-4 sm:p-5">
                {!previewResume ? (
                  <div className="empty-state !py-10">
                    <p className="text-sm">选择一份简历后查看评价</p>
                  </div>
                ) : !analysis ? (
                  <div className="text-center py-10">
                    <div className="empty-state-icon mb-3">
                      <Sparkles size={22} />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mb-1">尚未生成深度评价</p>
                    <p className="text-xs text-[var(--muted)] mb-4">
                      点击「AI 深度评价」获取多维度评分、风险点与预测题
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleAnalyze(previewResume.id)}
                      disabled={analyzingId === previewResume.id}
                      className="btn-primary !h-9"
                    >
                      {analyzingId === previewResume.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      开始评价
                    </button>
                  </div>
                ) : (
                  <AnalysisPanel analysis={analysis} />
                )}
              </div>
            </section>
          </div>

          {/* ===== 右侧：紧凑 sticky 预览 ===== */}
          <aside className="xl:sticky xl:top-6 space-y-3">
            <div className="surface-card p-4 sm:p-5">
              <h2 className="text-sm font-semibold mb-3.5 flex items-center gap-2 tracking-tight">
                <FolderOpen size={15} className="text-[var(--brand)]" />
                简历预览
              </h2>
              {previewResume ? (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-deep)] flex items-center justify-center shrink-0">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{previewResume.filename}</p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {previewResume.parsed_profile.name || "未解析姓名"} ·{" "}
                        {previewResume.file_type.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  {previewResume.score != null && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--muted)]">AI 评分</span>
                        <span className="font-semibold text-[var(--brand)] tabular-nums">
                          {previewResume.score}
                        </span>
                      </div>
                      <div className="progress">
                        <div
                          className="progress-bar !bg-[var(--g-green)]"
                          style={{ width: `${Math.min(previewResume.score, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {previewResume.parsed_profile.summary && (
                    <div className="mb-3">
                      <p className="text-[11px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">
                        摘要
                      </p>
                      <p className="text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-4">
                        {previewResume.parsed_profile.summary}
                      </p>
                    </div>
                  )}

                  {previewResume.parsed_profile.skills.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[11px] font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                        技能
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {previewResume.parsed_profile.skills.slice(0, 12).map((s) => (
                          <span key={s} className="chip chip-blue !text-[11px]">
                            {s}
                          </span>
                        ))}
                        {previewResume.parsed_profile.skills.length > 12 && (
                          <span className="chip chip-gray !text-[11px]">
                            +{previewResume.parsed_profile.skills.length - 12}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {previewResume.parsed_profile.projects.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                        项目
                      </p>
                      <ul className="space-y-1.5">
                        {previewResume.parsed_profile.projects.slice(0, 3).map((p, i) => (
                          <li key={i} className="text-xs flex items-start gap-1.5 text-[var(--text-secondary)]">
                            <CheckCircle size={12} className="text-[var(--g-green)] mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{p.name || p.description || "未命名项目"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--muted)] py-4 text-center">上传后显示预览</p>
              )}
            </div>

            <div className="surface-card p-4 sm:p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 tracking-tight">
                <Star size={15} className="text-[var(--g-yellow)]" />
                概览
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[var(--popover)] py-3 text-center">
                  <p className="text-xl font-semibold text-[var(--brand)] tabular-nums">{resumes.length}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">已上传</p>
                </div>
                <div className="rounded-lg bg-[var(--popover)] py-3 text-center">
                  <p className="text-xl font-semibold text-[var(--brand)] tabular-nums">
                    {resumes.filter((r) => r.score != null).length}
                  </p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">已评分</p>
                </div>
              </div>
              {activeResume && (
                <p className="text-xs text-[var(--muted)] mt-3 pt-3 border-t border-[var(--border)] leading-relaxed">
                  当前投递：
                  <span className="text-[var(--foreground)] font-medium">{activeResume.filename}</span>
                </p>
              )}
            </div>

            <div className="surface-card p-4 sm:p-5">
              <h2 className="text-sm font-semibold mb-2.5 flex items-center gap-2 tracking-tight">
                <Lightbulb size={15} className="text-[var(--brand)]" />
                提示
              </h2>
              <ul className="text-xs text-[var(--muted)] space-y-2 leading-relaxed">
                <li>· 「投递简历」会关联到模拟面试与面试准备</li>
                <li>· 深度评价在左侧下方展开，右侧仅作速览</li>
                <li>· 支持多份简历切换对比</li>
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** 深度评价正文 · 两栏网格，避免单列过长 */
function AnalysisPanel({ analysis }: { analysis: ResumeAnalysis }) {
  const dims = analysis.dimension_scores || {};
  const dimEntries = Object.entries(dims);

  return (
    <div className="space-y-5">
      {analysis.overall_narrative && (
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {analysis.overall_narrative}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {analysis.seniority_estimate && (
          <span className="chip chip-blue">职级 · {analysis.seniority_estimate}</span>
        )}
        {analysis.role_fit_summary && (
          <span className="chip chip-gray line-clamp-1 max-w-full">{analysis.role_fit_summary}</span>
        )}
      </div>

      {dimEntries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--foreground)] mb-3">维度评分</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {dimEntries.map(([k, v]) => {
              const sc = dimScore(v as never);
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--muted)]">{DIM_LABELS[k] || k}</span>
                    <span className="font-medium tabular-nums text-[var(--foreground)]">{sc}</span>
                  </div>
                  <div className="progress !h-1.5">
                    <div className="progress-bar" style={{ width: `${Math.min(sc, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {analysis.strengths && analysis.strengths.length > 0 && (
          <ListBlock title="优势" tone="green" items={analysis.strengths} />
        )}
        {analysis.weaknesses && analysis.weaknesses.length > 0 && (
          <ListBlock title="不足" tone="yellow" items={analysis.weaknesses} />
        )}
      </div>

      {analysis.red_flags && analysis.red_flags.length > 0 && (
        <div className="alert alert-error">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm mb-1">风险点</p>
            <ul className="text-xs space-y-1 opacity-90">
              {analysis.red_flags.map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {analysis.improvement_suggestions && analysis.improvement_suggestions.length > 0 && (
          <ListBlock title="改进建议" tone="gray" items={analysis.improvement_suggestions} />
        )}
        {analysis.rewrite_examples && analysis.rewrite_examples.length > 0 && (
          <ListBlock title="改写示例" tone="blue" items={analysis.rewrite_examples} />
        )}
      </div>

      {analysis.predicted_questions && analysis.predicted_questions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--foreground)] mb-2.5">预测面试题</p>
          <ol className="space-y-2">
            {analysis.predicted_questions.map((q, i) => (
              <li
                key={i}
                className="text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)] flex gap-2.5 p-2.5 rounded-lg bg-[var(--popover)]"
              >
                <span className="font-mono text-[10px] text-[var(--brand)] font-semibold shrink-0 mt-0.5">
                  Q{i + 1}
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "green" | "yellow" | "blue" | "gray";
}) {
  const chip =
    tone === "green"
      ? "chip-green"
      : tone === "yellow"
        ? "chip-yellow"
        : tone === "blue"
          ? "chip-blue"
          : "chip-gray";
  return (
    <div>
      <span className={`chip ${chip} mb-2`}>{title}</span>
      <ul className="text-xs space-y-1.5 text-[var(--text-secondary)] leading-relaxed mt-2">
        {items.slice(0, 6).map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-[var(--muted-soft)]">·</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
