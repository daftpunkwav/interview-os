"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Resume } from "@/types";
import { Upload, FileText, Loader2, CheckCircle, Sparkles, ChevronDown } from "lucide-react";

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => api.listResumes().then(setResumes).catch(console.error);
  useEffect(() => { load(); }, []);

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

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
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

      <motion.div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors mb-6 mt-6"
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
            className={`border rounded-xl bg-[var(--card)] overflow-hidden ${r.is_active ? "border-brand-500" : "border-[var(--border)]"}`}
            layout
          >
              {/* 头部 */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
                    <FileText size={18} className="text-brand-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.filename}</span>
                      {r.is_active && (
                        <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
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
                >
                  <ChevronDown size={18} className="text-[var(--muted)]" />
                </motion.div>
              </div>

              {/* 展开内容 */}
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
                          <p><span className="text-[var(--muted)]">摘要：</span>{r.parsed_profile.summary}</p>
                        )}
                        {r.parsed_profile.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {r.parsed_profile.skills.map((s) => (
                              <motion.span
                                key={s}
                                className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full"
                                whileHover={{ scale: 1.1 }}
                              >
                                {s}
                              </motion.span>
                            ))}
                          </div>
                        )}
                        {r.parsed_profile.projects.length > 0 && (
                          <div>
                            <p className="text-[var(--muted)] mb-1">项目经历：</p>
                            {r.parsed_profile.projects.map((p, i) => (
                              <div key={i} className="flex items-start gap-1 text-xs">
                                <CheckCircle size={12} className="text-green-500 mt-0.5" />
                                <span>{p.name || p.description || JSON.stringify(p)}</span>
                              </div>
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
  );
}
