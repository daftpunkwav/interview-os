"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Resume } from "@/types";
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
} from "lucide-react";

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api.listResumes().then((list) => {
      setResumes(list);
      setPreviewId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        const active = list.find((r) => r.is_active);
        return active?.id ?? list[0]?.id ?? null;
      });
    }).catch(console.error);

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
                              setError("");
                              try {
                                const data = await api.analyzeResume(r.id);
                                await load();
                                alert(`评分：${data.score}\n预测问题：\n${data.predicted_questions?.join("\n") || "—"}`);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "分析失败");
                              }
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white flex items-center gap-1"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Sparkles size={12} />
                            AI 分析
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
                  <div>
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
              <li>· 点击「AI 分析」可获取评分与预测面试题</li>
              <li>· 支持多份简历管理，点击列表项可在右侧查看详情</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
