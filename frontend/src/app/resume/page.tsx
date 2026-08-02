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
import { normalizeCnPunctuation, parseRewriteExample, tokenizeEvalText } from "@/lib/cnText";
import type { EvalTextPart } from "@/lib/cnText";

const DIM_LABELS: Record<string, string> = {
  structure_clarity: "结构清晰度",
  visual_layout: "版式布局",
  typography: "字体可读性",
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

function dimComment(
  v: ResumeAnalysis["dimension_scores"] extends infer D
    ? D extends Record<string, infer V>
      ? V
      : never
    : never,
): string {
  if (v && typeof v === "object" && "comment" in v) {
    return String((v as { comment?: string }).comment || "").trim();
  }
  return "";
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
    setPreviewId(id);
    toast.clear();
    toast.info("正在生成深度评价（含联网检索），约需 1–3 分钟，请勿关闭页面…", {
      persist: true,
    });
    try {
      const data = await api.analyzeResume(id);
      await load();
      toast.clear();
      toast.success(`评价完成 · 综合评分 ${data.score}`, { durationMs: 8000 });
    } catch (err) {
      // 可能已写入库但响应失败：刷新列表，避免界面与数据不一致
      try {
        await load();
      } catch {
        /* ignore */
      }
      toast.clear();
      const msg = err instanceof Error ? err.message : "分析失败";
      toast.error(msg, { durationMs: 10000 });
      setError(msg);
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
                            selected ? "bg-[var(--brand-softer)]" : "hover:bg-[var(--surface-muted)]"
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
                          <div className="px-4 pb-3.5 pt-1 flex flex-wrap items-center gap-2 bg-[var(--brand-softer)] border-t border-[var(--border)]">
                            <button
                              type="button"
                              disabled={r.is_active}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await api.activateResume(r.id);
                                await load();
                                toast.success("已设为投递简历");
                              }}
                              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius)] text-xs font-medium border transition-colors ${
                                r.is_active
                                  ? "border-transparent bg-[var(--brand-soft)] text-[var(--brand-ink)] cursor-default"
                                  : "border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-[var(--brand)]/40 hover:text-[var(--brand-ink)] hover:bg-[var(--card)]"
                              }`}
                            >
                              {r.is_active ? "当前投递" : "设为投递"}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleAnalyze(r.id);
                              }}
                              disabled={analyzingId === r.id}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius)] text-xs font-medium border border-transparent bg-[var(--brand-soft)] text-[var(--brand-ink)] hover:bg-[var(--brand)]/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius)] text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] transition-colors ml-auto"
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

            {/* Agent 深度评价 · 审阅笺 */}
            <section className="surface-card overflow-hidden">
              {analyzingId != null && analyzingId === previewId && (
                <div className="px-5 sm:px-7 py-3 border-b border-[var(--border)] bg-[var(--brand-softer)] flex items-center gap-2.5 text-sm text-[var(--brand-ink)]">
                  <Loader2 size={15} className="animate-spin shrink-0" />
                  <span className="tracking-[0.02em]">
                    Agent 正在深度评价与联网检索，完成后将自动刷新…
                  </span>
                </div>
              )}
              <div className="px-5 sm:px-8 pt-6 sm:pt-7 pb-6 sm:pb-8">
                {!previewResume ? (
                  <div className="empty-state !py-10">
                    <p className="text-sm tracking-[0.04em]">选择一份简历后查看评价</p>
                  </div>
                ) : analyzingId === previewResume.id ? (
                  <div className="text-center py-14">
                    <Loader2 className="animate-spin mx-auto text-[var(--brand)] mb-4" size={28} />
                    <p className="text-sm text-[var(--foreground)] tracking-[0.04em] mb-1.5">
                      正在生成深度评价
                    </p>
                    <p className="text-xs text-[var(--muted)] tracking-[0.03em] leading-relaxed max-w-sm mx-auto">
                      包含排版、字体、内容审阅与联网岗位参考，通常需要 1–3 分钟
                    </p>
                  </div>
                ) : !analysis ? (
                  <div className="text-center py-12">
                    <div className="empty-state-icon mb-4">
                      <Sparkles size={22} />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mb-1.5 tracking-[0.04em]">
                      尚未生成深度评价
                    </p>
                    <p className="text-xs text-[var(--muted)] mb-5 tracking-[0.03em] leading-relaxed">
                      生成后将给出排版、字体与内容的完整审阅
                    </p>
                    {error && (
                      <p className="text-xs text-[var(--danger-ink)] mb-4 max-w-md mx-auto leading-relaxed">
                        {error}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleAnalyze(previewResume.id)}
                      disabled={analyzingId === previewResume.id}
                      className="btn-primary !h-9"
                    >
                      <Sparkles size={14} />
                      开始评价
                    </button>
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="alert alert-warning mb-4 text-xs">{error}</div>
                    )}
                    <AnalysisPanel analysis={analysis} />
                  </>
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
                <li>· 深度评价会联网检索岗位要求，并点评排版、字体与内容</li>
                <li>· 旧评价需重新点击「AI 深度评价」才会刷新新结构</li>
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** 深度评价 · 审阅笺 */
function AnalysisPanel({ analysis }: { analysis: ResumeAnalysis }) {
  const dims = analysis.dimension_scores || {};
  const dimEntries = Object.entries(dims);
  const t = normalizeCnPunctuation;

  return (
    <article className="eval-sheet">
      <header className="eval-masthead">
        <div className="min-w-0">
          <h2 className="eval-masthead-title">Agent 深度评价</h2>
          <p className="eval-masthead-sub">简历审阅意见</p>
        </div>
        <div className="eval-score" aria-label={`综合得分 ${analysis.score}`}>
          <div className="eval-score-num">{analysis.score}</div>
          <div className="eval-score-label">综合</div>
        </div>
      </header>

      {analysis.overall_narrative && (
        <section className="eval-section">
          <span className="eval-label">总评</span>
          <p className="eval-prose">
            <EvalRichText text={t(analysis.overall_narrative)} />
          </p>
          {analysis.seniority_estimate && (
            <p className="eval-meta">
              职级判断 · <strong>{t(analysis.seniority_estimate)}</strong>
            </p>
          )}
        </section>
      )}

      {analysis.role_fit_summary && (
        <section className="eval-callout">
          <span className="eval-label">岗位匹配</span>
          <p className="eval-prose eval-prose-sm">
            <EvalRichText text={t(analysis.role_fit_summary)} />
          </p>
        </section>
      )}

      {(analysis.layout_review || analysis.typography_review || analysis.content_review) && (
        <div className="flex flex-col gap-6">
          {analysis.layout_review && (
            <section className="eval-section">
              <span className="eval-label">排版与结构</span>
              <p className="eval-prose eval-prose-sm">
                <EvalRichText text={t(analysis.layout_review)} />
              </p>
            </section>
          )}
          {analysis.typography_review && (
            <section className="eval-section">
              <span className="eval-label">字体与可读性</span>
              <p className="eval-prose eval-prose-sm">
                <EvalRichText text={t(analysis.typography_review)} />
              </p>
            </section>
          )}
          {analysis.content_review && (
            <section className="eval-section">
              <span className="eval-label">内容深度</span>
              <p className="eval-prose eval-prose-sm">
                <EvalRichText text={t(analysis.content_review)} />
              </p>
            </section>
          )}
        </div>
      )}

      {dimEntries.length > 0 && (
        <section className="eval-section">
          <span className="eval-label">维度评分</span>
          <div className="eval-dim-grid">
            {dimEntries.map(([k, v]) => {
              const sc = dimScore(v as never);
              const comment = dimComment(v as never);
              return (
                <div key={k} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="eval-dim-name">{DIM_LABELS[k] || k}</span>
                    <span className="eval-dim-score">{sc}</span>
                  </div>
                  <div className="progress !h-1">
                    <div className="progress-bar" style={{ width: `${Math.min(sc, 100)}%` }} />
                  </div>
                  {comment ? (
                    <p className="eval-dim-comment">
                      <EvalRichText text={t(comment)} />
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="eval-pair">
        {analysis.strengths && analysis.strengths.length > 0 && (
          <EvalList title="优势" items={analysis.strengths.map(t)} />
        )}
        {analysis.weaknesses && analysis.weaknesses.length > 0 && (
          <EvalList title="不足" items={analysis.weaknesses.map(t)} />
        )}
      </div>

      {analysis.red_flags && analysis.red_flags.length > 0 && (
        <div className="alert alert-error !py-4">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-sm mb-2.5 tracking-[0.06em]">风险点</p>
            <ul className="eval-list">
              {analysis.red_flags.map((s, i) => (
                <li key={i}>
                  <span className="eval-list-mark">·</span>
                  <span className="eval-list-body">
                    <EvalRichText text={t(s)} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="eval-pair">
        {analysis.improvement_suggestions && analysis.improvement_suggestions.length > 0 && (
          <EvalList title="改进建议" items={analysis.improvement_suggestions.map(t)} />
        )}
        {analysis.interview_risk_areas && analysis.interview_risk_areas.length > 0 && (
          <EvalList title="面试易被打穿" items={analysis.interview_risk_areas.map(t)} />
        )}
      </div>

      {analysis.rewrite_examples && analysis.rewrite_examples.length > 0 && (
        <RewriteGallery items={analysis.rewrite_examples} />
      )}

      {analysis.market_insights && analysis.market_insights.length > 0 && (
        <EvalList title="市场参考" items={analysis.market_insights.map(t)} />
      )}

      {(analysis.ats_keywords?.length || analysis.missing_keywords?.length) ? (
        <div className="eval-kw-grid">
          {!!analysis.ats_keywords?.length && (
            <section className="eval-section min-w-0">
              <span className="eval-label">已覆盖关键词</span>
              <div className="eval-kw is-covered">
                {analysis.ats_keywords.map((k) => (
                  <span key={k}>{k}</span>
                ))}
              </div>
            </section>
          )}
          {!!analysis.missing_keywords?.length && (
            <section className="eval-section min-w-0">
              <span className="eval-label">建议补充</span>
              <ul className="eval-kw-suggest">
                {analysis.missing_keywords.map((k) => (
                  <li key={k}>
                    <EvalRichText text={t(k)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}

      {analysis.project_deep_dive && analysis.project_deep_dive.length > 0 && (
        <EvalNumberedStack
          title="项目深挖点"
          prefix="P"
          items={analysis.project_deep_dive.map(t)}
        />
      )}

      {analysis.predicted_questions && analysis.predicted_questions.length > 0 && (
        <EvalNumberedStack
          title="预测面试题"
          prefix="Q"
          items={analysis.predicted_questions.map(t)}
        />
      )}
    </article>
  );
}

/** 评价正文：支持 **强调** / `代码`，旧数据兜底高亮指标 */
function EvalRichText({ text }: { text: string }) {
  const parts = tokenizeEvalText(text);
  return (
    <>
      {parts.map((p, i) => (
        <EvalRichPart key={i} part={p} />
      ))}
    </>
  );
}

function EvalRichPart({ part }: { part: EvalTextPart }) {
  if (part.type === "bold") {
    return <strong className="eval-em">{part.value}</strong>;
  }
  if (part.type === "code") {
    return <code className="eval-code">{part.value}</code>;
  }
  return <>{part.value}</>;
}

function EvalNumberedStack({
  title,
  items,
  prefix,
}: {
  title: string;
  items: string[];
  prefix: string;
}) {
  return (
    <section className="eval-section">
      <span className="eval-label">{title}</span>
      <div className="eval-q-stack">
        {items.map((q, i) => (
          <div key={i} className="eval-q">
            <span className="eval-q-idx">
              {prefix}
              {i + 1}
            </span>
            <p className="eval-prose eval-prose-sm !max-w-none m-0">
              <EvalRichText text={q} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RewriteGallery({
  items,
}: {
  items: NonNullable<ResumeAnalysis["rewrite_examples"]>;
}) {
  const pairs = items
    .map((item) => parseRewriteExample(item))
    .filter((p): p is { before: string; after: string } => Boolean(p));

  if (pairs.length === 0) {
    // 无法解析时降级为普通列表，避免再露出 {'before': ...}
    const fallback = items
      .map((item) => {
        if (typeof item === "string") return normalizeCnPunctuation(item);
        if (item && typeof item === "object") {
          const b = "before" in item ? String(item.before || "") : "";
          const a = "after" in item ? String(item.after || "") : "";
          if (b && a) return null;
          return normalizeCnPunctuation(JSON.stringify(item));
        }
        return null;
      })
      .filter((x): x is string => Boolean(x));
    if (!fallback.length) return null;
    return <EvalList title="改写示例" items={fallback} />;
  }

  return (
    <section className="eval-section">
      <span className="eval-label">改写示例</span>
      <div className="eval-rewrite-stack">
        {pairs.map((pair, i) => (
          <article key={i} className="eval-rewrite-card">
            <div className="eval-rewrite-block is-before">
              <div className="eval-rewrite-meta">
                <span className="eval-rewrite-idx">{String(i + 1).padStart(2, "0")}</span>
                <span className="eval-rewrite-tag">改前</span>
              </div>
              <p className="eval-rewrite-text">
                <EvalRichText text={normalizeCnPunctuation(pair.before)} />
              </p>
            </div>
            <div className="eval-rewrite-block is-after">
              <div className="eval-rewrite-meta">
                <span className="eval-rewrite-tag">改后</span>
              </div>
              <p className="eval-rewrite-text">
                <EvalRichText text={normalizeCnPunctuation(pair.after)} />
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvalList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="eval-section min-w-0">
      <span className="eval-label">{title}</span>
      <ul className="eval-list">
        {items.map((s, i) => (
          <li key={i}>
            <span className="eval-list-mark">·</span>
            <span className="eval-list-body">
              <EvalRichText text={s} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
