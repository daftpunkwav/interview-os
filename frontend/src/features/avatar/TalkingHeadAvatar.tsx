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

const SCENE_BG: Record<string, string> = {
  meeting_room: "linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0b1220 100%)",
  glass_office: "linear-gradient(160deg, #111827 0%, #1f2937 50%, #0f172a 100%)",
  online_interview: "linear-gradient(160deg, #020617 0%, #1e293b 60%, #0f172a 100%)",
};

const EMOTION_TO_MOOD: Record<string, string> = {
  neutral: "neutral",
  smile: "happy",
  happy: "happy",
  serious: "neutral",
  curious: "neutral",
  encouraging: "happy",
  skeptical: "fear",
  concerned: "sad",
  angry: "angry",
  sad: "sad",
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
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadPct, setLoadPct] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let head: HeadInstance | null = null;

    const boot = async () => {
      const node = containerRef.current;
      if (!node) return;
      // WebGL 探测
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
          lipsyncModules: ["en"],
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
            lipsyncLang: "en",
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

  // 情绪映射
  useEffect(() => {
    const head = headRef.current;
    if (!head || failed) return;
    const mood = EMOTION_TO_MOOD[emotion] || "neutral";
    try {
      const names = head.getMoodNames?.() || [];
      if (names.length === 0 || names.includes(mood)) {
        head.setMood(mood);
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
  }, [emotion, failed]);

  // 音量 → mouthOpen / jawOpen
  useEffect(() => {
    const head = headRef.current;
    if (!head || failed || loading) return;
    const open = speaking ? Math.min(1, Math.max(0, audioLevel > 0.02 ? 0.15 + audioLevel * 1.1 : 0.08)) : 0;
    try {
      head.setValue("mouthOpen", open, 40);
      head.setValue("jawOpen", open * 0.6, 40);
    } catch {
      /* morph 可能尚未就绪 */
    }
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

  const bg = SCENE_BG[sceneId] || SCENE_BG.meeting_room;

  return (
    <div
      className="relative w-full h-full min-h-[180px] rounded-xl overflow-hidden border border-white/10"
      style={{ background: bg }}
    >
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
