"use client";

import { useEffect, useRef, useState } from "react";

const SCENES: Record<string, string> = {
  meeting_room: "/scenes/meeting_room.svg",
  glass_office: "/scenes/glass_office.svg",
  online_interview: "/scenes/online_interview.svg",
};

const SCENE_FALLBACK: Record<string, string> = {
  meeting_room: "linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #1a2f4a 100%)",
  glass_office: "linear-gradient(135deg, #2c3e50 0%, #4a6741 100%)",
  online_interview: "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
};

const AVATAR_EMOJI: Record<string, string> = {
  professional_male: "👨‍💼",
  gentle_female: "👩‍💼",
  strict_expert: "🧑‍🏫",
};

interface InterviewerAvatarProps {
  avatarId: string;
  sceneId: string;
  emotion?: string;
  speaking?: boolean;
  onAudioLevel?: (level: number) => void;
}

/** Live2D 占位实现：场景背景 + 动态口型角色（可替换为 pixi-live2d-display） */
export function InterviewerAvatar({
  avatarId,
  sceneId,
  emotion = "neutral",
  speaking = false,
}: InterviewerAvatarProps) {
  const [mouthOpen, setMouthOpen] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!speaking) {
      setMouthOpen(0);
      return;
    }
    const tick = () => {
      setMouthOpen(0.3 + Math.random() * 0.7);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [speaking]);

  const sceneBg = SCENE_FALLBACK[sceneId] || SCENE_FALLBACK.meeting_room;
  const sceneImg = SCENES[sceneId] || SCENES.meeting_room;
  const emoji = AVATAR_EMOJI[avatarId] || "👨‍💼";

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl" style={{ background: sceneBg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sceneImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      <div className="absolute inset-0 opacity-20 bg-[url('/scenes/pattern.svg')] bg-cover" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div
          className="text-[120px] leading-none transition-transform duration-150"
          style={{
            transform: `scaleY(${1 + mouthOpen * 0.08})`,
            filter: emotion === "serious" ? "saturate(0.8)" : undefined,
          }}
        >
          {emoji}
        </div>
        <div
          className="w-16 h-3 bg-red-400/60 rounded-full mb-8 transition-all duration-75"
          style={{
            height: `${8 + mouthOpen * 20}px`,
            opacity: speaking ? 0.8 : 0,
          }}
        />
      </div>
      <div className="absolute top-4 left-4 text-white/80 text-sm font-medium">
        AI 面试官
      </div>
    </div>
  );
}
