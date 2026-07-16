"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ChatMessage, ClientEvent, FaceAnalysis } from "@/types";
import { VideoPanel, type VideoPanelHandle } from "@/components/interview/VideoPanel";
import { InterviewerAvatar } from "@/features/avatar/InterviewerAvatar";
import { useInterviewWS } from "@/features/media/useInterviewWS";
import { useAudioRecorder } from "@/features/media/useAudioRecorder";
import { useTTSPlayer } from "@/features/media/useTTSPlayer";
import { api } from "@/lib/api";
import { PHASE_LABELS } from "@/config/phases";
import { Flag, Loader2, Send, WifiOff, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [currentPhase, setCurrentPhase] = useState("");
  const [emotion, setEmotion] = useState("neutral");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  const [tokenUsage, setTokenUsage] = useState(0);
  const [inputText, setInputText] = useState("");
  const [referenceHint, setReferenceHint] = useState("");
  const [hintLoading, setHintLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [sessionMeta, setSessionMeta] = useState({
    avatar_id: "professional_male",
    scene_id: "meeting_room",
    workflow_type: "technical",
  });
  const videoRef = useRef<VideoPanelHandle>(null);
  const faceRef = useRef<FaceAnalysis>({});
  const partialTextRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const showOutlineRef = useRef(showOutline);
  const sendRef = useRef<(p: ClientEvent) => boolean>(() => false);

  const { connected, turnState, connectionState, send, on, retryNow } = useInterviewWS(sessionId);
  const { playBase64Mp3, setOnSpeakingChange } = useTTSPlayer();


  useEffect(() => {
    showOutlineRef.current = showOutline;
  }, [showOutline]);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    setOnSpeakingChange(setAiSpeaking);
  }, [setOnSpeakingChange]);

  useEffect(() => {
    api.getSession(sessionId).then((s) => {
      setSessionMeta({
        avatar_id: s.avatar_id || "professional_male",
        scene_id: s.scene_id || "meeting_room",
        workflow_type: s.workflow_type,
      });
    }).catch(() => {});
  }, [sessionId]);

  const submitUserMessageRef = useRef<(text: string, pcm?: string) => void>(() => {});

  const submitUserMessage = useCallback((text: string, pcmBase64 = "") => {
    const trimmed = text.trim();
    if (!trimmed && !pcmBase64) return;
    const imageBase64 = videoRef.current?.captureFrame() ?? undefined;
    const payload = {
      text: trimmed,
      face_analysis: faceRef.current,
      image_base64: imageBase64,
    };
    if (pcmBase64) {
      send({ type: "user_turn_end", pcm: pcmBase64, sample_rate: 16000, ...payload });
    } else {
      send({ type: "user_text", ...payload });
    }
    partialTextRef.current = "";
  }, [send]);

  useEffect(() => {
    submitUserMessageRef.current = submitUserMessage;
  }, [submitUserMessage]);

  const onSilenceStable = useCallback((pcm: string, partial: string) => {
    partialTextRef.current = partial;
    submitUserMessageRef.current(partial, pcm);
  }, []);

  const onPartialStable = useCallback((text: string) => {
    partialTextRef.current = text;
    sendRef.current({ type: "stt_text", text });
    // 有语音活动时重置静默计时
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        sendRef.current({ type: "silence_timeout" });
      }, 10000);
    }
  }, []);

  const { flush, isRecording, partialText, micError } = useAudioRecorder(
    connected && turnState === "USER_SPEAKING",
    onSilenceStable,
    onPartialStable,
  );

  const requestHint = useCallback((question: string) => {
    if (!showOutlineRef.current || !question.trim()) return;
    setHintLoading(true);
    setReferenceHint("");
    setLastQuestion(question);
    sendRef.current({ type: "request_hint", question });
  }, []);

  // 10s 静默追问（仅随回合切换重置，不随 partialText 变化）
  useEffect(() => {
    if (turnState !== "USER_SPEAKING") {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      return;
    }
    silenceTimerRef.current = setTimeout(() => {
      sendRef.current({ type: "silence_timeout" });
    }, 10000);
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [turnState]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  /* 服务端事件的强类型订阅（on() 风格，handler 中 ``msg`` 已按 ``type`` 收窄）。 */
  useEffect(() => {
    on("assistant_token", (msg) => setStreamingText((prev) => prev + msg.token));
    on("assistant_done", (msg) => {
      setMessages((prev) => [...prev, { role: "assistant", content: msg.content }]);
      setStreamingText("");
      setCurrentPhase(msg.phase);
      setEmotion(msg.emotion || "neutral");
      setTokenUsage((t) => t + msg.content.length);
      requestHint(msg.content);
      if (msg.is_complete) {
        setTimeout(() => router.push(`/report/${sessionId}`), 2000);
      }
    });
    on("stt_final", (msg) => {
      if (msg.text) setMessages((prev) => [...prev, { role: "user", content: msg.text }]);
    });
    on("tts_audio", (msg) => playBase64Mp3(msg.data));
    on("silence_nudge", (msg) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `[追问] ${msg.content}` }]);
    });
    on("reference_hint_loading", () => setHintLoading(true));
    on("reference_hint", (msg) => {
      setReferenceHint(msg.content);
      setLastQuestion(msg.question || "");
      setHintLoading(false);
    });
    on("error", (msg) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg.message}` }]);
    });
  }, [on, playBase64Mp3, router, sessionId, requestHint]);

  const handleFaceAnalysis = useCallback((analysis: FaceAnalysis) => {
    faceRef.current = analysis;
    send({ type: "vision_update", face_analysis: analysis });
  }, [send]);

  const canInput = turnState === "USER_SPEAKING";
  const canSend = canInput && (Boolean(inputText.trim()) || isRecording);

  const handleSend = () => {
    if (!canInput) return;
    if (inputText.trim()) {
      submitUserMessage(inputText.trim());
      setInputText("");
    } else if (isRecording) {
      flush();
    }
  };

  const handleFinish = async () => {
    try {
      await api.finishInterview(sessionId);
    } catch { /* */ }
    router.push(`/report/${sessionId}`);
  };

  const voiceStatus = micError
    ? `错误：${micError}`
    : partialText
      ? `识别中「${partialText}」`
      : "正在聆听，停顿 1.2 秒自动发送";

  const turnLabel: Record<string, string> = {
    AI_SPEAKING: "面试官发言中",
    USER_SPEAKING: "请你回答",
    PROCESSING: "思考中",
    IDLE: "待命",
  };

  if (!connected) {
    if (connectionState === "failed") {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-950 text-gray-200 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <WifiOff className="text-rose-400" size={26} />
          </div>
          <div>
            <p className="text-base font-medium">无法连接到面试服务</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-sm">
              已尝试 5 次仍失败，请确认后端已启动（默认 :8000）或检查网络
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
            <button
              type="button"
              onClick={() => retryNow()}
              className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 shadow-lg shadow-brand-500/20"
            >
              重新连接
            </button>
            <button
              type="button"
              onClick={() => router.push("/interview")}
              className="px-5 py-2.5 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5"
            >
              返回配置
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-gray-950 text-gray-400">
        <Loader2 className="animate-spin text-brand-400" size={28} />
        <p className="text-sm">
          {connectionState === "reconnecting" ? "重新连接中…" : "连接面试服务…"}
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 border-b border-white/10 bg-black/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 text-sm min-w-0">
          <span className="font-medium text-white/90 shrink-0">面试 #{sessionId}</span>
          <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-200 text-xs border border-brand-400/20 truncate">
            {PHASE_LABELS[currentPhase] || currentPhase || "准备中"}
          </span>
          <span
            className={cn(
              "hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border",
              turnState === "USER_SPEAKING"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/20"
                : turnState === "AI_SPEAKING"
                  ? "bg-amber-500/15 text-amber-200 border-amber-400/20"
                  : "bg-white/5 text-gray-400 border-white/10",
            )}
          >
            <Radio size={11} className={turnState === "USER_SPEAKING" ? "animate-pulse" : ""} />
            {turnLabel[turnState] || turnState}
          </span>
        </div>
        <button
          type="button"
          onClick={handleFinish}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-rose-300 hover:border-rose-400/40 hover:bg-rose-500/10 flex items-center gap-1.5 transition-colors"
        >
          <Flag size={13} /> 结束面试
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.8fr)] gap-2 p-2 min-h-0 overflow-hidden">
        {/* 左侧：摄像头 + 对话 */}
        <div className="grid grid-rows-[minmax(140px,0.9fr)_minmax(180px,1.1fr)] lg:grid-rows-[1.2fr_1fr] gap-2 min-h-0 order-2 lg:order-1">
          <VideoPanel
            ref={videoRef}
            enabled
            variant="dark"
            micActive={isRecording}
            voiceStatus={voiceStatus}
            onFaceAnalysis={handleFaceAnalysis}
          />

          <div className="rounded-xl border border-white/10 bg-black/35 flex flex-col min-h-0 backdrop-blur-[2px]">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && !streamingText && (
                <p className="text-xs text-gray-500 text-center py-6">
                  面试即将开始，请保持镜头对准自己
                </p>
              )}
              {messages.map((m, i) => (
                <ChatBubble key={i} role={m.role} content={m.content} />
              ))}
              {streamingText && (
                <ChatBubble role="assistant" content={streamingText} streaming />
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-white/10 p-2 flex gap-2 shrink-0">
              <input
                className="flex-1 px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400/40 disabled:opacity-40"
                placeholder={canInput ? "输入文字回答，或开麦说话…" : "等待面试官…"}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={!canInput}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-500 disabled:bg-white/8 disabled:text-gray-500 transition-colors"
                title={inputText.trim() ? "发送文字" : isRecording ? "发送语音" : "请输入或说话"}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：面试官 + 提纲 */}
        <div className="grid grid-rows-[minmax(180px,1.4fr)_minmax(120px,0.85fr)] lg:grid-rows-[1.618fr_1fr] gap-2 min-h-0 order-1 lg:order-2">
          <InterviewerAvatar
            avatarId={sessionMeta.avatar_id}
            sceneId={sessionMeta.scene_id}
            emotion={emotion}
            speaking={aiSpeaking || turnState === "AI_SPEAKING"}
          />
          <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 sm:p-4 overflow-y-auto flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
              <h3 className="text-sm font-medium text-white/90">参考提纲</h3>
              <label className="text-xs text-gray-400 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-white/20 bg-white/10 text-brand-500 focus:ring-brand-500/40"
                  checked={showOutline}
                  onChange={(e) => {
                    setShowOutline(e.target.checked);
                    if (!e.target.checked) setReferenceHint("");
                    else if (lastQuestion) requestHint(lastQuestion);
                  }}
                />
                显示参考
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 mb-3 shrink-0">
              <div className="rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/5">
                阶段：
                <span className="text-gray-200 ml-1">
                  {PHASE_LABELS[currentPhase] || "—"}
                </span>
              </div>
              <div className="rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/5">
                Token 约：
                <span className="text-gray-200 ml-1">{tokenUsage}</span>
              </div>
            </div>

            {!showOutline && (
              <p className="text-xs text-gray-500 leading-relaxed">
                参考提纲已隐藏 — 高难度模式，靠自己发挥
              </p>
            )}
            {showOutline && hintLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="animate-spin text-brand-400" size={14} />
                AI 正在生成参考回答…
              </div>
            )}
            {showOutline && !hintLoading && referenceHint && (
              <div className="flex-1 overflow-y-auto min-h-0">
                {lastQuestion && (
                  <p className="text-xs text-brand-300/90 mb-2 line-clamp-2 leading-relaxed">
                    针对：{lastQuestion}
                  </p>
                )}
                <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed bg-white/[0.04] rounded-xl p-3 border border-white/10">
                  {referenceHint}
                </div>
              </div>
            )}
            {showOutline && !hintLoading && !referenceHint && (
              <p className="text-xs text-gray-500 leading-relaxed">
                面试官提问后，AI 将根据你的简历生成参考回答要点。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  role,
  content,
  streaming = false,
}: {
  role: string;
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  const isNudge = content.startsWith("[追问]");

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold",
          isUser ? "bg-brand-600 text-white" : "bg-amber-500/90 text-white",
        )}
      >
        {isUser ? "我" : "AI"}
      </div>
      <div className={cn("max-w-[85%] flex flex-col", isUser ? "items-end" : "items-start")}>
        <span className="text-[10px] text-gray-500 mb-0.5 px-0.5">
          {isUser ? "候选人" : isNudge ? "面试官 · 追问" : "面试官"}
          {streaming && " · 输入中"}
        </span>
        <div
          className={cn(
            "px-3 py-2 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-brand-600 text-white rounded-tr-md"
              : isNudge
                ? "bg-amber-900/35 border border-amber-600/30 text-amber-50 rounded-tl-md"
                : "bg-white/10 text-gray-100 rounded-tl-md border border-white/5",
          )}
        >
          {content}
          {streaming && (
            <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-brand-300/80 animate-pulse align-middle rounded-sm" />
          )}
        </div>
      </div>
    </div>
  );
}
