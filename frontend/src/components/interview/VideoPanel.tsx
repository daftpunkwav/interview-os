"use client";

import { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { Video, VideoOff } from "lucide-react";
import type { FaceAnalysis as BaseFaceAnalysis } from "@/types";

/** VideoPanel 内部使用的扩展版人脸分析字段，保持向后兼容。 */
export interface FaceAnalysis extends BaseFaceAnalysis {
  face_detected: boolean;
  looking_away: boolean;
  nervousness: number;
  face_count: number;
}

export interface VideoPanelHandle {
  /** 截取当前视频帧，返回 JPEG base64（不含 data URL 前缀） */
  captureFrame: () => string | null;
}

interface VideoPanelProps {
  onFaceAnalysis?: (analysis: FaceAnalysis) => void;
  enabled: boolean;
  micActive?: boolean;
  voiceStatus?: string;
}

export const VideoPanel = forwardRef<VideoPanelHandle, VideoPanelProps>(
  function VideoPanel({ onFaceAnalysis, enabled, micActive = false, voiceStatus = "未开启" }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [cameraOn, setCameraOn] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);
    const faceDetectorRef = useRef<BrowserFaceDetector | null>(null);
    const [faceStatus, setFaceStatus] = useState<string>("未检测");
    const jitterHistory = useRef<number[]>([]);

    useImperativeHandle(ref, () => ({
      captureFrame: () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !cameraOn || video.readyState < 2) return null;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        return dataUrl.split(",")[1] || null;
      },
    }));

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraOn(true);

        // 初始化浏览器原生人脸检测（Chrome / Edge 支持）
        if ("FaceDetector" in window) {
          try {
            faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          } catch {
            faceDetectorRef.current = null;
          }
        }
      } catch {
        setFaceStatus("摄像头权限被拒绝");
      }
    };

    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      faceDetectorRef.current = null;
      setCameraOn(false);
      setFaceStatus("未检测");
    };

    const toggleCamera = () => {
      if (cameraOn) stopCamera();
      else void startCamera();
    };

    useEffect(() => {
      if (enabled) void startCamera();
      return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    // 真实面部分析：FaceDetector API + 面部位置抖动估计紧张度
    const analyzeFace = useCallback(async () => {
      const video = videoRef.current;
      if (!video || !cameraOn || video.readyState < 2) return;

      let analysis: FaceAnalysis = {
        face_detected: false,
        looking_away: true,
        nervousness: 0,
        face_count: 0,
      };

      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          analysis.face_count = faces.length;
          analysis.face_detected = faces.length > 0;

          if (faces.length > 0) {
            const face = faces[0]?.boundingBox;
            if (face) {
              const cx = face.x + face.width / 2;
              const cy = face.y + face.height / 2;
              const vcx = video.videoWidth / 2;
              const vcy = video.videoHeight / 2;
              const offset = Math.hypot(cx - vcx, cy - vcy) / Math.hypot(vcx, vcy);
              analysis.looking_away = offset > 0.35;
              jitterHistory.current.push(offset);
              if (jitterHistory.current.length > 8) jitterHistory.current.shift();
              if (jitterHistory.current.length >= 3) {
                const avg =
                  jitterHistory.current.reduce((a, b) => a + b, 0) /
                  jitterHistory.current.length;
                const variance =
                  jitterHistory.current.reduce((s, v) => s + (v - avg) ** 2, 0) /
                  jitterHistory.current.length;
                analysis.nervousness = Math.min(1, variance * 20);
              }
            } else {
              jitterHistory.current.push(0);
              if (jitterHistory.current.length > 8) jitterHistory.current.shift();
            }
            setFaceStatus(
              analysis.looking_away
                ? "已检测人脸 · 未看镜头"
                : analysis.nervousness > 0.5
                  ? "已检测人脸 · 略显紧张"
                  : "已检测人脸 · 状态正常"
            );
          } else {
            setFaceStatus("未检测到人脸");
          }
        } catch {
          setFaceStatus("面部分析暂时不可用");
        }
      } else {
        // 无 FaceDetector 时仅标记摄像头已开启
        analysis.face_detected = true;
        analysis.looking_away = false;
        setFaceStatus("摄像头已开启（浏览器不支持人脸检测 API）");
      }

      onFaceAnalysis?.(analysis);
    }, [cameraOn, onFaceAnalysis]);

    useEffect(() => {
      if (!cameraOn || !enabled) return;
      const interval = setInterval(() => {
        analyzeFace();
      }, 3000);
      return () => clearInterval(interval);
    }, [cameraOn, enabled, analyzeFace]);

    useEffect(() => {
      return () => {
        stopCamera();
      };
    }, []);

    if (!enabled) return null;

    return (
      <div className="rounded-xl border border-[var(--border)] bg-black/5 overflow-hidden">
        <div className="relative aspect-video bg-gray-900">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover mirror ${cameraOn ? "" : "hidden"}`}
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              摄像头未开启
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex items-center justify-center gap-3 p-3 bg-[var(--card)]">
          <button
            onClick={toggleCamera}
            className={`p-2.5 rounded-full transition-colors ${cameraOn ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"}`}
            title={cameraOn ? "关闭摄像头" : "开启摄像头"}
          >
            {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
        </div>
        <div className="px-3 pb-3 space-y-1 text-xs text-[var(--muted)]">
          <p>视频：{faceStatus}</p>
          <p className={micActive ? "text-green-400" : ""}>
            语音：{micActive ? voiceStatus : "等待你的回合…"}
          </p>
        </div>
        <style jsx>{`
          .mirror {
            transform: scaleX(-1);
          }
        `}</style>
      </div>
    );
  }
);

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface BrowserFaceDetector {
  detect(source: HTMLVideoElement): Promise<DetectedFace[]>;
}

interface FaceDetectorOptions {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}

declare global {
  interface Window {
    FaceDetector: new (options?: FaceDetectorOptions) => BrowserFaceDetector;
  }
}
