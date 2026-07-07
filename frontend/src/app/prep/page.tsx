"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Resume } from "@/types";
import { Send, Loader2, BookOpen, Sparkles, User, Bot } from "lucide-react";

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
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <BookOpen className="text-white" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">面试准备</h1>
          <p className="text-sm text-[var(--muted)]">ReAct 辅导 Agent — 简历分析、面经搜索、主动出题</p>
        </div>
      </div>

      {!prepSessionId ? (
        <div className="mt-6 space-y-4">
            {resumes.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">选择简历</label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  value={resumeId ?? ""}
                  onChange={(e) => setResumeId(Number(e.target.value))}
                >
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>{r.filename}{r.is_active ? " (投递)" : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <motion.button
              onClick={startPrep}
              className="px-6 py-3 rounded-xl bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand-500/25 flex items-center gap-2"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Sparkles size={16} />
            开始辅导
          </motion.button>
        </div>
      ) : (
        <>
          <div className="text-xs text-[var(--muted)] mb-2">Token 约：{tokenUsage}</div>
          <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl p-4 space-y-4 mb-4 min-h-[400px] bg-[var(--card)]">
            <AnimatePresence>
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    m.role === "user" ? "bg-brand-600" : "bg-gray-200"
                  }`}>
                    {m.role === "user" ? <User size={14} className="text-white" /> : <Bot size={14} className="text-gray-600" />}
                  </div>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                    m.role === "user"
                      ? "bg-brand-600 text-white rounded-br-md"
                      : "bg-gray-100 text-gray-800 rounded-bl-md"
                  }`}>
                    {m.content}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {loading && (
              <motion.div
                className="flex items-center gap-2 text-[var(--muted)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Loader2 className="animate-spin" size={18} />
                <span className="text-sm">思考中...</span>
              </motion.div>
            )}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="问我任何面试相关问题..."
            />
            <motion.button
              onClick={handleSend}
              disabled={loading}
              className="px-5 py-3 rounded-xl bg-brand-600 text-white disabled:opacity-50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Send size={16} />
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
}
