"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import type { Resume } from "@/types";
import { Send, Loader2 } from "lucide-react";

export default function PrepPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [prepSessionId, setPrepSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listResumes().then((list) => {
      setResumes(list);
      const active = list.find((r) => r.is_active) || list[0];
      if (active) setResumeId(active.id);
    });
  }, []);

  const startPrep = async () => {
    const { id } = await api.createPrepSession({ resume_id: resumeId ?? undefined });
    setPrepSessionId(id);
    setMessages([{ role: "assistant", content: "你好！我是你的面试准备教练。告诉我你的目标岗位，或让我帮你分析简历、出题练习。" }]);
  };

  const handleSend = async () => {
    if (!input.trim() || !prepSessionId || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await api.prepMessage(prepSessionId, userMsg);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setTokenUsage(res.token_usage);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `错误：${e instanceof Error ? e.message : "失败"}` }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="p-8 max-w-3xl h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-2">面试准备</h1>
      <p className="text-sm text-[var(--muted)] mb-4">ReAct 辅导 Agent — 简历分析、面经搜索、主动出题</p>

      {!prepSessionId ? (
        <div className="space-y-4">
          {resumes.length > 0 && (
            <select
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)]"
              value={resumeId ?? ""}
              onChange={(e) => setResumeId(Number(e.target.value))}
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>{r.filename}{r.is_active ? " (投递)" : ""}</option>
              ))}
            </select>
          )}
          <button onClick={startPrep} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm">
            开始辅导
          </button>
        </div>
      ) : (
        <>
          <div className="text-xs text-[var(--muted)] mb-2">Token 约：{tokenUsage}</div>
          <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl p-4 space-y-3 mb-4 min-h-[400px]">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : ""}`}>
                <span className={`inline-block px-3 py-2 rounded-xl max-w-[85%] ${m.role === "user" ? "bg-brand-600 text-white" : "bg-gray-100"}`}>
                  {m.content}
                </span>
              </div>
            ))}
            {loading && <Loader2 className="animate-spin text-[var(--muted)]" size={18} />}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="问我任何面试相关问题..."
            />
            <button onClick={handleSend} disabled={loading} className="px-4 py-2 rounded-lg bg-brand-600 text-white">
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
