"use client";

import { useEffect, useRef, useState } from "react";
import { InterviewerAvatar } from "@/features/avatar/InterviewerAvatar";
import { Loader2 } from "lucide-react";

/** Ready Player Me / TalkingHead 示例 GLB（含口型 morphTargets） */
const MORPH_QS =
  "morphTargets=ARKit,Oculus+Visemes,mouthOpen,mouthSmile,eyesClosed,eyesLookUp,eyesLookDown&textureSizeLimit=1024&textureFormat=png";

const AVATAR_URLS: Record<string, { url: string; body: "M" | "F"; mood: string }> = {
  professional_male: {
    url: `https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?${MORPH_QS}`,
    body: "M",
    mood: "neutral",
  },
  gentle_female: {
    url: "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/avatars/brunette.glb",
    body: "F",
    mood: "happy",
  },
  strict_expert: {
    url: `https://models.readyplayer.me/67ebd62a688cd661ebe09988.glb?${MORPH_QS}`,
    body: "M",
    mood: "neutral",
  },
};

const SCENE_IMG: Record<string, string> = {
  meeting_room: "/scenes/meeting_room.svg",
  glass_office: "/scenes/glass_office.svg",
  online_interview: "/scenes/online_interview.svg",
};

const SCENE_FALLBACK: Record<string, string> = {
  meeting_room: "linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0b1220 100%)",
  glass_office: "linear-gradient(160deg, #111827 0%, #1f2937 50%, #0f172a 100%)",
  online_interview: "linear-gradient(160deg, #020617 0%, #1e293b 60%, #0f172a 100%)",
};

/** 情绪 → TalkingHead mood；避免大量落到 neutral */
const EMOTION_TO_MOOD: Record<string, string> = {
  neutral: "neutral",
  smile: "happy",
  happy: "happy",
  serious: "serious",
  curious: "neutral",
  encouraging: "happy",
  skeptical: "fear",
  concerned: "sad",
  angry: "angry",
  sad: "sad",
};

/** 情绪 → 辅助 morph（眉/眼/嘴角），mood 不够细时补一层 */
const EMOTION_MORPH: Record<
  string,
  { browInnerUp?: number; eyeSquint?: number; mouthSmile?: number; eyesClosed?: number }
> = {
  neutral: {},
  smile: { mouthSmile: 0.45, eyeSquint: 0.15 },
  happy: { mouthSmile: 0.55, eyeSquint: 0.2 },
  serious: { browInnerUp: 0.35, mouthSmile: 0 },
  curious: { browInnerUp: 0.4, mouthSmile: 0.1 },
  encouraging: { mouthSmile: 0.4, eyeSquint: 0.12 },
  skeptical: { browInnerUp: 0.25, mouthSmile: 0 },
  concerned: { browInnerUp: 0.45, mouthSmile: 0, eyesClosed: 0.08 },
  angry: { browInnerUp: 0.55, mouthSmile: 0 },
  sad: { browInnerUp: 0.3, mouthSmile: 0, eyesClosed: 0.12 },
};

interface TalkingHeadAvatarProps {
  avatarId: string;
  sceneId: string;
  emotion?: string;
  speaking?: boolean;
  audioLevel?: number;
}

type HeadInstance = {
  showAvatar: (avatar: Record<string, unknown>, onprogress?: (ev: unknown) => void) => Promise<void>;
  setMood: (mood: string) => void;
  setValue: (mt: string, val: number, ms?: number | null) => void;
  getMoodNames?: () => string[];
  lookAt?: (x: number, y: number, t: number) => void;
  stop?: () => void;
};

/** 音量 → 口型：低电平闭嘴、带攻击/衰减的平滑曲线 */
function mapAudioToMouth(level: number, speaking: boolean): number {
  if (!speaking) return 0;
  if (level < 0.03) return 0;
  // 轻度压缩曲线，避免小噪声大张嘴
  const shaped = Math.pow(Math.min(1, (level - 0.03) / 0.75), 0.85);
  return Math.min(0.95, 0.12 + shaped * 0.88);
}

/**
 * TalkingHead 3D 面试官：Edge TTS 音量驱动口型；WebGL 失败时回退 CSS 矢量人像。
 */
export function TalkingHeadAvatar({
  avatarId,
  sceneId,
  emotion = "neutral",
  speaking = false,
  audioLevel = 0,
}: TalkingHeadAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HeadInstance | null>(null);
  const mouthSmoothRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadPct, setLoadPct] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let head: HeadInstance | null = null;

    const boot = async () => {
      const node = containerRef.current;
      if (!node) return;
      try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) throw new Error("no webgl");
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }

      try {
        const mod = await import("@met4citizen/talkinghead");
        const TalkingHead = (mod as { TalkingHead: new (n: HTMLElement, o?: object) => HeadInstance }).TalkingHead;
        if (cancelled || !containerRef.current) return;

        const profile = AVATAR_URLS[avatarId] || AVATAR_URLS.professional_male!;
        head = new TalkingHead(containerRef.current, {
          ttsEndpoint: "",
          // 不加载 lipsync-*.mjs：Webpack 无法解析库内相对动态 import
          lipsyncModules: [],
          cameraView: "upper",
          avatarMood: profile.mood,
          lightAmbientColor: 0x8899aa,
          lightAmbientIntensity: 1.2,
          lightDirectColor: 0xffe6cc,
          lightDirectIntensity: 8,
          modelFPS: 30,
        });
        headRef.current = head;

        await head.showAvatar(
          {
            url: profile.url,
            body: profile.body,
            avatarMood: profile.mood,
          },
          (ev: unknown) => {
            const e = ev as { lengthComputable?: boolean; loaded?: number; total?: number };
            if (e?.lengthComputable && e.total) {
              setLoadPct(Math.round((100 * (e.loaded || 0)) / e.total));
            }
          },
        );
        if (cancelled) {
          head.stop?.();
          return;
        }
        setLoading(false);
      } catch (err) {
        console.warn("TalkingHead 加载失败，回退 CSS 人像", err);
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
      try {
        headRef.current?.stop?.();
      } catch {
        /* noop */
      }
      headRef.current = null;
    };
  }, [avatarId]);

  // 情绪 → mood + 辅助 morph
  useEffect(() => {
    const head = headRef.current;
    if (!head || failed) return;
    const mood = EMOTION_TO_MOOD[emotion] || "neutral";
    try {
      const names = head.getMoodNames?.() || [];
      if (names.length === 0 || names.includes(mood)) {
        head.setMood(mood);
      } else if (mood === "serious" && names.includes("neutral")) {
        head.setMood("neutral");
      } else {
        head.setMood("neutral");
      }
    } catch {
      try {
        head.setMood("neutral");
      } catch {
        /* ignore */
      }
    }

    const morph = EMOTION_MORPH[emotion] || {};
    const trySet = (name: string, val: number) => {
      try {
        head.setValue(name, val, 180);
      } catch {
        /* morph 可能不存在 */
      }
    };
    trySet("browInnerUp", morph.browInnerUp ?? 0);
    trySet("eyeSquintLeft", morph.eyeSquint ?? 0);
    trySet("eyeSquintRight", morph.eyeSquint ?? 0);
    trySet("mouthSmile", morph.mouthSmile ?? 0);
    trySet("eyesClosed", morph.eyesClosed ?? 0);
  }, [emotion, failed]);

  // 音量 → 平滑口型（攻击快、衰减慢）
  useEffect(() => {
    const head = headRef.current;
    if (!head || failed || loading) return;

    const target = mapAudioToMouth(audioLevel, speaking);
    const tick = () => {
      const cur = mouthSmoothRef.current;
      const attack = 0.45;
      const release = 0.18;
      const k = target > cur ? attack : release;
      const next = cur + (target - cur) * k;
      mouthSmoothRef.current = Math.abs(next - target) < 0.008 ? target : next;
      try {
        const open = mouthSmoothRef.current;
        head.setValue("mouthOpen", open, 30);
        head.setValue("jawOpen", open * 0.55, 30);
        // 说话时略压嘴角微笑，避免僵硬露齿
        if (speaking && open > 0.2) {
          head.setValue("mouthSmile", Math.min(0.25, open * 0.2), 40);
        }
      } catch {
        /* morph 可能尚未就绪 */
      }
      if (speaking || mouthSmoothRef.current > 0.01) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioLevel, speaking, failed, loading]);

  if (failed) {
    return (
      <InterviewerAvatar
        avatarId={avatarId}
        sceneId={sceneId}
        emotion={emotion}
        speaking={speaking}
        audioLevel={audioLevel}
      />
    );
  }

  const bg = SCENE_FALLBACK[sceneId] || SCENE_FALLBACK.meeting_room;
  const sceneImg = SCENE_IMG[sceneId] || SCENE_IMG.meeting_room;

  return (
    <div
      className="relative w-full h-full min-h-[180px] rounded-xl overflow-hidden border border-white/10"
      style={{ background: bg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sceneImg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-85 pointer-events-none"
      />
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 text-white/80 text-xs">
          <Loader2 className="animate-spin text-brand-400" size={22} />
          <span>加载 3D 面试官…{loadPct > 0 ? ` ${loadPct}%` : ""}</span>
          <span className="text-white/40">不阻塞进房与麦克风</span>
        </div>
      )}
    </div>
  );
}
