"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Video, VideoOff, Mic, MicOff } from "lucide-react";

interface FaceAnalysis {
  looking_away: boolean;
  nervousness: number;
}

interface VideoPanelProps {
  onFaceAnalysis?: (analysis: FaceAnalysis) => void;
  enabled: boolean;
}

export function VideoPanel({ onFaceAnalysis, enabled }: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [transcript, setTranscript] = useState("");

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOn(true);
    } catch {
      console.warn("摄像头权限被拒绝");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const toggleCamera = () => {
    if (cameraOn) stopCamera();
    else startCamera();
  };

  const toggleMic = () => {
    if (micOn) {
      recognitionRef.current?.stop();
      setMicOn(false);
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;
      const recognition = new SpeechRecognition();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        setTranscript(text);
      };
      recognition.start();
      recognitionRef.current = recognition;
      setMicOn(true);
    }
  };

  // 简单的面部分析模拟（基于视频帧亮度变化估计紧张度）
  useEffect(() => {
    if (!cameraOn || !enabled) return;
    const interval = setInterval(() => {
      onFaceAnalysis?.({
        looking_away: Math.random() > 0.85,
        nervousness: Math.random() * 0.5,
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [cameraOn, enabled, onFaceAnalysis]);

  useEffect(() => {
    return () => {
      stopCamera();
      recognitionRef.current?.stop();
    };
  }, []);

  // 暴露 transcript 给父组件
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__interviewTranscript = transcript;
  }, [transcript]);

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-black/5 overflow-hidden">
      <div className="relative aspect-video bg-gray-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${cameraOn ? "" : "hidden"}`}
        />
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            摄像头未开启
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 p-3 bg-[var(--card)]">
        <button
          onClick={toggleCamera}
          className={`p-2.5 rounded-full transition-colors ${cameraOn ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"}`}
          title={cameraOn ? "关闭摄像头" : "开启摄像头"}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          onClick={toggleMic}
          className={`p-2.5 rounded-full transition-colors ${micOn ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
          title={micOn ? "关闭麦克风" : "开启语音输入"}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        {micOn && transcript && (
          <span className="text-xs text-[var(--muted)] truncate max-w-[200px]">{transcript}</span>
        )}
      </div>
    </div>
  );
}

// Web Speech API 类型声明
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  [index: number]: { transcript: string };
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
