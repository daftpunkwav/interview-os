"use client";

import { useEffect, useState } from "react";

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

/** 拟真面试官形象配置（CSS 矢量人像，无外部资源依赖） */
const AVATAR_PROFILES: Record<
  string,
  {
    label: string;
    hair: string;
    skin: string;
    suit: string;
    shirt: string;
    accent: string;
    gender: "male" | "female";
  }
> = {
  professional_male: {
    label: "专业男面试官",
    hair: "#2c1810",
    skin: "#e8b896",
    suit: "#1e3a5f",
    shirt: "#f1f5f9",
    accent: "#3b82f6",
    gender: "male",
  },
  gentle_female: {
    label: "亲和女面试官",
    hair: "#4a3728",
    skin: "#f0c4a8",
    suit: "#4c1d95",
    shirt: "#faf5ff",
    accent: "#a78bfa",
    gender: "female",
  },
  strict_expert: {
    label: "严厉专家",
    hair: "#1a1a1a",
    skin: "#d4a574",
    suit: "#1c1917",
    shirt: "#e7e5e4",
    accent: "#ef4444",
    gender: "male",
  },
};

interface InterviewerAvatarProps {
  avatarId: string;
  sceneId: string;
  emotion?: string;
  speaking?: boolean;
  onAudioLevel?: (level: number) => void;
}

/**
 * 拟真面试官人像：场景背景 + CSS 绘制半身像 + 口型/眨眼/情绪联动。
 * 不引入 Live2D 重依赖；后续可替换为 pixi-live2d 模型而保持同一 props。
 */
export function InterviewerAvatar({
  avatarId,
  sceneId,
  emotion = "neutral",
  speaking = false,
}: InterviewerAvatarProps) {
  const [mouthOpen, setMouthOpen] = useState(0);
  const [blink, setBlink] = useState(1);
  const profile = AVATAR_PROFILES[avatarId] || AVATAR_PROFILES.professional_male!;

  useEffect(() => {
    if (!speaking) {
      setMouthOpen(0);
      return;
    }
    // 约 12fps 更新口型，避免每帧 setState 造成整卡闪烁感
    const id = window.setInterval(() => {
      setMouthOpen(0.15 + Math.random() * 0.85);
    }, 80);
    return () => {
      window.clearInterval(id);
      setMouthOpen(0);
    };
  }, [speaking]);

  // 自然眨眼
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        setBlink(0.08);
        setTimeout(() => {
          setBlink(1);
          schedule();
        }, 120);
      }, 2800 + Math.random() * 3200);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  const sceneBg = SCENE_FALLBACK[sceneId] || SCENE_FALLBACK.meeting_room;
  const sceneImg = SCENES[sceneId] || SCENES.meeting_room;

  const browY = emotion === "serious" ? 2 : emotion === "smile" ? -1 : 0;
  const mouthBase = emotion === "smile" ? 0.35 : emotion === "serious" ? 0.05 : 0.12;
  const mouthH = speaking ? 6 + mouthOpen * 14 : 4 + mouthBase * 8;
  const mouthW = speaking ? 22 + mouthOpen * 6 : 20;
  const cheekOpacity = emotion === "smile" ? 0.35 : 0.12;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl" style={{ background: sceneBg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sceneImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      <div className="absolute inset-0 opacity-15 bg-[url('/scenes/pattern.svg')] bg-cover" />
      {/* 柔光 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 70%, rgba(255,255,255,0.12) 0%, transparent 70%)",
        }}
      />

      {/* 半身像区域 */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[min(100%,340px)] h-[88%] flex flex-col items-center justify-end">
        <svg
          viewBox="0 0 200 260"
          className="w-full h-full drop-shadow-2xl"
          style={{
            filter: emotion === "serious" ? "saturate(0.85) contrast(1.05)" : undefined,
          }}
          aria-label={profile.label}
        >
          {/* 肩膀/西装 */}
          <ellipse cx="100" cy="250" rx="88" ry="48" fill={profile.suit} />
          <path
            d="M40 220 Q100 200 160 220 L170 260 L30 260 Z"
            fill={profile.suit}
          />
          {/* 衬衫领 */}
          <path d="M78 210 L100 235 L122 210 L115 248 L85 248 Z" fill={profile.shirt} />
          <rect x="96" y="220" width="8" height="30" rx="1" fill={profile.accent} opacity={0.85} />

          {/* 脖子 */}
          <rect x="88" y="145" width="24" height="32" rx="6" fill={profile.skin} />

          {/* 头部 */}
          <ellipse cx="100" cy="100" rx="52" ry="58" fill={profile.skin} />

          {/* 头发 */}
          {profile.gender === "female" ? (
            <>
              <ellipse cx="100" cy="72" rx="54" ry="42" fill={profile.hair} />
              <path d="M48 90 Q40 140 55 180 Q70 150 72 100 Z" fill={profile.hair} />
              <path d="M152 90 Q160 140 145 180 Q130 150 128 100 Z" fill={profile.hair} />
              <path d="M55 55 Q100 30 145 55 Q140 85 100 78 Q60 85 55 55 Z" fill={profile.hair} />
            </>
          ) : (
            <>
              <path
                d="M48 95 Q48 45 100 40 Q152 45 152 95 Q148 70 100 68 Q52 70 48 95 Z"
                fill={profile.hair}
              />
              <ellipse cx="100" cy="62" rx="50" ry="28" fill={profile.hair} />
            </>
          )}

          {/* 眉毛 */}
          <path
            d={`M68 ${78 + browY} Q80 ${74 + browY} 90 ${78 + browY}`}
            stroke={profile.hair}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M110 ${78 + browY} Q120 ${74 + browY} 132 ${78 + browY}`}
            stroke={profile.hair}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />

          {/* 眼睛 */}
          <ellipse cx="80" cy="95" rx="9" ry={7 * blink} fill="#fff" />
          <ellipse cx="120" cy="95" rx="9" ry={7 * blink} fill="#fff" />
          <ellipse cx="80" cy="95" rx="4.5" ry={4.5 * blink} fill="#2d3748" />
          <ellipse cx="120" cy="95" rx="4.5" ry={4.5 * blink} fill="#2d3748" />
          <circle cx="81.5" cy={93.5} r={1.5 * blink} fill="#fff" opacity={0.9} />
          <circle cx="121.5" cy={93.5} r={1.5 * blink} fill="#fff" opacity={0.9} />

          {/* 鼻子 */}
          <path d="M100 100 L96 118 Q100 122 104 118 Z" fill={profile.skin} stroke="#c9956c" strokeWidth="0.8" opacity={0.7} />

          {/* 脸颊 */}
          <ellipse cx="62" cy="115" rx="10" ry="6" fill="#e07a5f" opacity={cheekOpacity} />
          <ellipse cx="138" cy="115" rx="10" ry="6" fill="#e07a5f" opacity={cheekOpacity} />

          {/* 嘴 */}
          {emotion === "smile" && !speaking ? (
            <path
              d="M85 132 Q100 145 115 132"
              stroke="#b85c48"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <ellipse
              cx="100"
              cy="134"
              rx={mouthW / 2}
              ry={mouthH / 2}
              fill={speaking ? "#5c2a2a" : "#c47868"}
            />
          )}
          {speaking && mouthOpen > 0.4 && (
            <ellipse cx="100" cy="136" rx={mouthW / 4} ry={mouthH / 4} fill="#e8a0a0" opacity={0.6} />
          )}
        </svg>
      </div>

      {/* 说话波纹 */}
      {speaking && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1 items-end h-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-white/70 animate-pulse"
              style={{
                height: `${8 + ((i + mouthOpen * 5) % 5) * 4}px`,
                animationDelay: `${i * 80}ms`,
              }}
            />
          ))}
        </div>
      )}

      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: speaking ? "#22c55e" : profile.accent }}
        />
        <span className="text-white/90 text-sm font-medium drop-shadow">
          {profile.label}
        </span>
      </div>
      {emotion !== "neutral" && (
        <div className="absolute top-4 right-4 text-xs text-white/70 bg-black/30 px-2 py-0.5 rounded-full">
          {emotion === "smile" ? "友好" : emotion === "serious" ? "严肃" : emotion}
        </div>
      )}
    </div>
  );
}
