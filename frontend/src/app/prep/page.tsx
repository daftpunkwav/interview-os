"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { PREP_QUICK_PROMPTS } from "@/config/prepPrompts";
import type { Resume } from "@/types";
import { ThinkAnswerMessage } from "@/components/ThinkAnswerMessage";
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

const QUICK_PROMPTS = PREP_QUICK_PROMPTS;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export default function PrepPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [prepSessionId, setPrepSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [prepError, setPrepError] = useState("");
  const [tokenUsage, setTokenUsage] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const msgSeqRef = useRef(0);

  function nextMsgId(prefix: string) {
    msgSeqRef.current += 1;
    return `${prefix}-${msgSeqRef.current}`;
  }

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
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const startPrep = async () => {
    setStarting(true);
    setPrepError("");
    try {
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
    } catch (e) {
      setPrepError(e instanceof Error ? e.message : "创建辅导会话失败");
      return null;
    } finally {
      setStarting(false);
    }
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
      if (!id) return;
      await sendMessage(prompt, id);
      return;
    }
    sendMessage(prompt);
  };

  return (
    <div className="page-shell !max-w-6xl h-full flex flex-col min-h-0 overflow-hidden !pb-4">
      <div className="page-header !mb-4 shrink-0">
        <div className="icon-badge">
          <BookOpen size={20} />
        </div>
        <div>
          <h1 className="page-title">面试准备</h1>
          <p className="page-desc">ReAct 辅导 Agent — 简历分析、面经搜索、主动出题</p>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 overflow-hidden">
        {/* 左侧：对话主区 */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          {!prepSessionId ? (
            <div className="flex-1 min-h-0 surface-card p-8 flex flex-col justify-center overflow-hidden">
              <div className="max-w-md mx-auto w-full space-y-5">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-[var(--brand-soft)] text-[var(--brand-deep)] flex items-center justify-center mx-auto mb-4">
                    <Sparkles size={28} />
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight">开始你的面试辅导</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    关联简历后，AI 教练将基于你的背景进行针对性辅导
                  </p>
                </div>

                {resumes.length > 0 ? (
                  <div>
                    <label className="field-label">关联简历</label>
                    <select
                      className="field-input !h-11"
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
                  <div className="alert alert-warning text-center !block">
                    暂无简历，可先去「简历管理」上传，也可直接开始通用辅导
                  </div>
                )}

                {prepError && (
                  <div className="alert alert-error text-center !block">
                    {prepError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={startPrep}
                  disabled={starting}
                  className="btn-primary w-full !h-11"
                >
                  {starting ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  {starting ? "正在连接…" : "开始辅导"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2 px-1 shrink-0">
                <span className="chip chip-green !text-[11px]">辅导中 · {messages.length} 条</span>
                <span className="font-mono tabular-nums">Token ≈ {tokenUsage || 0}</span>
              </div>
              <div
                ref={chatScrollRef}
                className="flex-1 min-h-0 overflow-y-auto surface-card p-4 space-y-3.5 mb-3"
              >
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        m.role === "user"
                          ? "bg-[var(--brand)] text-white"
                          : "bg-[var(--brand-soft)] text-[var(--brand-deep)]"
                      }`}
                    >
                      {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                    </div>
                    <div
                      className={`max-w-[88%] px-3.5 py-2.5 rounded-[var(--radius-lg)] text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-[var(--brand)] text-white rounded-br-sm"
                          : "bg-[var(--popover)] text-[var(--foreground)] border border-[var(--border)] rounded-bl-sm"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        m.content || m.streaming ? (
                          <ThinkAnswerMessage
                            content={m.content}
                            streaming={!!m.streaming}
                          />
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
                  className="field-input !h-11 flex-1"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="问我任何面试相关问题…"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading}
                  className="btn-primary !w-11 !px-0 shrink-0"
                  aria-label="发送"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>

        {/* 右侧：上下文与快捷操作 */}
        <div className="hidden lg:flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5">
          <div className="surface-card p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 tracking-tight">
              <FileText size={15} className="text-[var(--brand)]" />
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
                  <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-3">
                    {selectedResume.parsed_profile.summary}
                  </p>
                )}
                {selectedResume.parsed_profile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {selectedResume.parsed_profile.skills.slice(0, 8).map((s) => (
                      <span key={s} className="chip chip-blue !text-[11px]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">未关联简历，将进行通用辅导</p>
            )}
          </div>

          <div className="surface-card p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 tracking-tight">
              <Zap size={15} className="text-[var(--g-yellow)]" />
              快捷提问
            </h2>
            <div className="space-y-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleQuickPrompt(prompt)}
                  disabled={loading}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-[var(--radius)] border border-[var(--border)] hover:border-[var(--brand)]/40 hover:bg-[var(--brand-softer)] transition-colors disabled:opacity-50 leading-relaxed text-[var(--text-secondary)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 tracking-tight">
              <MessageSquare size={15} className="text-[var(--brand)]" />
              会话状态
            </h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-[var(--popover)] py-3">
                <p className="text-xl font-semibold text-[var(--brand)] tabular-nums">
                  {prepSessionId ? messages.length : 0}
                </p>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">消息数</p>
              </div>
              <div className="rounded-lg bg-[var(--popover)] py-3">
                <p className="text-xl font-semibold text-[var(--brand)] tabular-nums">
                  {tokenUsage || "—"}
                </p>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Token</p>
              </div>
            </div>
          </div>

          <div className="surface-card p-4">
            <h2 className="text-sm font-semibold mb-2.5 flex items-center gap-2 tracking-tight">
              <Lightbulb size={15} className="text-[var(--brand)]" />
              使用提示
            </h2>
            <ul className="text-xs text-[var(--muted)] space-y-2 leading-relaxed">
              <li>· 可要求 Agent 搜索真实面经并提炼考点</li>
              <li>· 描述目标公司与岗位，获得针对性模拟题</li>
              <li>· 回答后请教练点评，识别表达漏洞</li>
              <li>· 支持 Markdown 流式回复</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
