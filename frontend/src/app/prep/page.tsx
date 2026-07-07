"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { Resume } from "@/types";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  Send,
  Loader2,
  BookOpen,
  Sparkles,
  User,
  Bot,
  FileText,
  Lightbulb,
  MessageSquare,
  Zap,
} from "lucide-react";

const QUICK_PROMPTS = [
  "帮我分析简历的亮点与不足",
  "针对目标岗位出 5 道技术面试题",
  "模拟一场行为面试并点评我的回答",
  "搜索近期面经并总结高频考点",
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

let msgSeq = 0;
function nextMsgId(prefix: string) {
  msgSeq += 1;
  return `${prefix}-${msgSeq}`;
}

export default function PrepPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [prepSessionId, setPrepSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  const selectedResume = useMemo(
    () => resumes.find((r) => r.id === resumeId) ?? null,
    [resumes, resumeId],
  );

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const startPrep = async () => {
    const { id } = await api.createPrepSession({ resume_id: resumeId ?? undefined });
    setPrepSessionId(id);
    setMessages([
      {
        id: nextMsgId("a"),
        role: "assistant",
        content: "你好！我是你的面试准备教练。告诉我你的目标岗位，或让我帮你分析简历、出题练习。",
      },
    ]);
    return id;
  };

  const sendMessage = async (text: string, sessionId?: number) => {
    const sid = sessionId ?? prepSessionId;
    if (!text.trim() || !sid || loading) return;

    const userMsg = text.trim();
    const assistantId = nextMsgId("a");
    setInput("");
    setLoading(true);
    setMessages((m) => [
      ...m,
      { id: nextMsgId("u"), role: "user", content: userMsg },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    try {
      const result = await api.prepMessageStream(sid, userMsg, (token) => {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId ? { ...msg, content: msg.content + token } : msg,
          ),
        );
      });
      setTokenUsage(result.token_usage);
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantId ? { ...msg, streaming: false } : msg)),
      );
    } catch (e) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                streaming: false,
                content: msg.content || `错误：${e instanceof Error ? e.message : "失败"}`,
              }
            : msg,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleQuickPrompt = async (prompt: string) => {
    if (!prepSessionId) {
      const id = await startPrep();
      await sendMessage(prompt, id);
      return;
    }
    sendMessage(prompt);
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto w-full flex flex-col min-h-[calc(100vh-1px)]">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <BookOpen className="text-white" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">面试准备</h1>
          <p className="text-sm text-[var(--muted)]">ReAct 辅导 Agent — 简历分析、面经搜索、主动出题</p>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-stretch min-h-0">
        {/* 左侧：对话主区 */}
        <div className="flex flex-col min-h-[calc(100vh-11rem)] lg:min-h-0">
          {!prepSessionId ? (
            <div className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 flex flex-col justify-center min-h-[calc(100vh-14rem)]">
              <div className="max-w-md mx-auto w-full space-y-5">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="text-white" size={28} />
                  </div>
                  <h2 className="text-lg font-semibold">开始你的面试辅导</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    关联简历后，AI 教练将基于你的背景进行针对性辅导
                  </p>
                </div>

                {resumes.length > 0 ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">关联简历</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      value={resumeId ?? ""}
                      onChange={(e) => setResumeId(Number(e.target.value))}
                    >
                      {resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.filename}{r.is_active ? " (投递)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-center">
                    暂无简历，可先去「简历管理」上传，也可直接开始通用辅导
                  </p>
                )}

                <motion.button
                  onClick={startPrep}
                  className="w-full px-6 py-3 rounded-xl bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Sparkles size={16} />
                  开始辅导
                </motion.button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2 px-1 shrink-0">
                <span>辅导进行中 · {messages.length} 条消息</span>
                <span>Token 约 {tokenUsage}</span>
              </div>
              <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl p-4 space-y-4 mb-4 bg-[var(--card)] min-h-0">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        m.role === "user" ? "bg-brand-600" : "bg-gray-200"
                      }`}
                    >
                      {m.role === "user" ? (
                        <User size={14} className="text-white" />
                      ) : (
                        <Bot size={14} className="text-gray-600" />
                      )}
                    </div>
                    <div
                      className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-sm ${
                        m.role === "user"
                          ? "bg-brand-600 text-white rounded-br-md leading-relaxed"
                          : "bg-gray-100 text-gray-800 rounded-bl-md"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        m.content ? (
                          <>
                            <MarkdownContent content={m.content} />
                            {m.streaming && (
                              <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-500 animate-pulse align-middle rounded-sm" />
                            )}
                          </>
                        ) : m.streaming ? (
                          <span className="flex items-center gap-2 text-[var(--muted)]">
                            <Loader2 className="animate-spin" size={14} />
                            思考中...
                          </span>
                        ) : null
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="flex gap-2 shrink-0">
                <input
                  className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all bg-white"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="问我任何面试相关问题..."
                  disabled={loading}
                />
                <motion.button
                  onClick={handleSend}
                  disabled={loading}
                  className="px-5 py-3 rounded-xl bg-brand-600 text-white disabled:opacity-50"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                </motion.button>
              </div>
            </>
          )}
        </div>

        {/* 右侧：上下文与快捷操作 */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <FileText size={16} className="text-brand-600" />
              关联简历
            </h2>
            {selectedResume ? (
              <>
                <p className="font-medium text-sm truncate">{selectedResume.filename}</p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {selectedResume.parsed_profile.name || "未解析姓名"}
                  {selectedResume.score != null && ` · 评分 ${selectedResume.score}`}
                </p>
                {selectedResume.parsed_profile.summary && (
                  <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed line-clamp-3">
                    {selectedResume.parsed_profile.summary}
                  </p>
                )}
                {selectedResume.parsed_profile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {selectedResume.parsed_profile.skills.slice(0, 8).map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">未关联简历，将进行通用面试辅导</p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              快捷提问
            </h2>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleQuickPrompt(prompt)}
                  disabled={loading}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-xl border border-[var(--border)] hover:border-brand-300 hover:bg-brand-50/50 transition-colors disabled:opacity-50 leading-relaxed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <MessageSquare size={16} className="text-brand-600" />
              会话状态
            </h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 py-3">
                <p className="text-xl font-bold text-brand-600">{prepSessionId ? messages.length : 0}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">消息数</p>
              </div>
              <div className="rounded-xl bg-slate-50 py-3">
                <p className="text-xl font-bold text-brand-600">{tokenUsage || "—"}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">Token</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Lightbulb size={16} className="text-brand-600" />
              使用提示
            </h2>
            <ul className="text-xs text-[var(--muted)] space-y-2 leading-relaxed">
              <li>· 可要求 Agent 搜索真实面经并提炼考点</li>
              <li>· 描述目标公司与岗位，获得更有针对性的模拟题</li>
              <li>· 回答练习后请教练点评，识别表达与内容漏洞</li>
              <li>· 支持 Markdown 格式回复，流式输出实时显示</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
