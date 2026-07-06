"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/types";
import { VideoPanel } from "@/components/interview/VideoPanel";
import { Send, Loader2, Flag } from "lucide-react";

const PHASE_LABELS: Record<string, string> = {
  identity_check: "身份确认",
  self_intro: "自我介绍",
  basic_knowledge: "基础知识",
  project_deep_dive: "项目深挖",
  technical_deep: "技术深挖",
  system_design: "系统设计",
  scenario: "情景问题",
  reverse_qa: "反问环节",
  summary: "总结评价",
  career_plan: "职业规划",
  teamwork: "团队合作",
  pressure: "压力问题",
  salary: "薪资沟通",
  leadership: "领导经验",
  decision_making: "决策能力",
  conflict: "冲突处理",
  business: "业务理解",
};

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);
  const [currentPhase, setCurrentPhase] = useState("");
  const [faceAnalysis, setFaceAnalysis] = useState<Record<string, unknown> | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    const start = async () => {
      try {
        const result = await api.startInterview(sessionId);
        setMessages([result.message]);
        setCurrentPhase(result.current_phase);
      } catch (e) {
        alert(e instanceof Error ? e.message : "启动失败");
        router.push("/interview");
      } finally {
        setStarting(false);
      }
    };
    start();
  }, [sessionId, router]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleFinish = async () => {
    try {
      await api.finishInterview(sessionId);
    } catch {
      // 报告可能已存在
    }
    router.push(`/report/${sessionId}`);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const result = await api.sendMessage(sessionId, userMsg.content, faceAnalysis);
      setMessages((prev) => [...prev, result.message]);
      setCurrentPhase(result.current_phase);

      if (result.is_complete) {
        setTimeout(() => router.push(`/report/${sessionId}`), 2000);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `错误：${e instanceof Error ? e.message : "发送失败"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFaceAnalysis = useCallback((analysis: { looking_away: boolean; nervousness: number }) => {
    setFaceAnalysis(analysis);
  }, []);

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 1.0;
      speechSynthesis.speak(utterance);
    }
  };

  // AI 回复时语音朗读
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      speak(last.content);
    }
  }, [messages]);

  if (starting) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-[var(--muted)]">
        <Loader2 className="animate-spin" size={20} />
        面试官正在准备...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <div>
          <span className="text-sm font-medium">模拟面试 #{sessionId}</span>
          {currentPhase && (
            <span className="ml-3 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
              {PHASE_LABELS[currentPhase] || currentPhase}
            </span>
          )}
        </div>
        <button
          onClick={handleFinish}
          className="text-sm text-[var(--muted)] hover:text-red-600 flex items-center gap-1"
        >
          <Flag size={14} /> 结束面试
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 视频面板 */}
        <div className="w-80 p-4 border-r border-[var(--border)] hidden lg:block">
          <VideoPanel enabled={videoEnabled} onFaceAnalysis={handleFaceAnalysis} />
          <label className="flex items-center gap-2 mt-3 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={videoEnabled} onChange={(e) => setVideoEnabled(e.target.checked)} />
            启用视频分析
          </label>
        </div>

        {/* 对话区 */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white rounded-br-md"
                      : "bg-gray-100 text-[var(--foreground)] rounded-bl-md"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <span className="text-xs font-medium text-brand-600 block mb-1">面试官</span>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                  <Loader2 className="animate-spin text-[var(--muted)]" size={18} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 输入区 */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--card)]">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="输入你的回答... (Enter 发送)"
                rows={2}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-4 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
