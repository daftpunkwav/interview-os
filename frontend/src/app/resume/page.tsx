"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import type { Resume } from "@/types";
import { Upload, FileText, Loader2, CheckCircle } from "lucide-react";

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
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
      <h1 className="text-2xl font-bold mb-2">简历管理</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        支持 PDF、Word、Markdown 格式。AI 将自动解析为职业知识档案。
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors mb-6"
      >
        {uploading ? (
          <Loader2 className="animate-spin mx-auto text-brand-600" size={32} />
        ) : (
          <Upload className="mx-auto text-[var(--muted)]" size={32} />
        )}
        <p className="mt-2 text-sm font-medium">
          {uploading ? "正在解析简历..." : "点击上传简历"}
        </p>
        <p className="text-xs text-[var(--muted)] mt-1">PDF · DOCX · MD · TXT</p>
        <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.md,.txt" className="hidden" onChange={handleUpload} />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="space-y-3">
        {resumes.map((r) => (
          <div key={r.id} className="border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-brand-600" />
              <span className="font-medium">{r.filename}</span>
              <span className="text-xs text-[var(--muted)] ml-auto">{r.file_type.toUpperCase()}</span>
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
                    <span key={s} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{s}</span>
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
        ))}
        {resumes.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center py-8">暂无简历，请上传一份</p>
        )}
      </div>
    </div>
  );
}
