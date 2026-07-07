"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MarkdownContent } from "./MarkdownContent";

interface StreamingRevealProps {
  content: string;
  streaming: boolean;
  /** 相对 LLM 真实进度落后的字符数 */
  lag?: number;
  /** 每次追赶的字符数 */
  charsPerTick?: number;
  /** 追赶间隔（毫秒） */
  tickMs?: number;
}

/** 单字渐显 */
function FadeChar({ char }: { char: string }) {
  if (char === "\n") {
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        className="block"
      >
        <br />
      </motion.span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, y: 1 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="inline"
    >
      {char}
    </motion.span>
  );
}

/**
 * 流式输出渐显：显示进度略落后于真实内容，逐字淡入；
 * 结束后切换为 Markdown 渲染。
 */
export function StreamingReveal({
  content,
  streaming,
  lag = 2,
  charsPerTick = 1,
  tickMs = 16,
}: StreamingRevealProps) {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    if (!streaming) {
      setVisibleLength(content.length);
      return;
    }

    let raf = 0;
    let lastTick = 0;

    const step = (now: number) => {
      if (now - lastTick >= tickMs) {
        lastTick = now;
        setVisibleLength((prev) => {
          const target = Math.max(0, content.length - lag);
          if (prev >= target) return prev;
          return Math.min(prev + charsPerTick, target);
        });
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [content.length, streaming, lag, charsPerTick, tickMs]);

  useEffect(() => {
    if (content.length < visibleLength) {
      setVisibleLength(content.length);
    }
  }, [content.length, visibleLength]);

  if (!streaming) {
    return <MarkdownContent content={content} />;
  }

  const visible = content.slice(0, visibleLength);
  if (!visible) return null;

  return (
    <div className="leading-relaxed break-words">
      {visible.split("").map((ch, i) => (
        <FadeChar key={i} char={ch} />
      ))}
      <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-500 animate-pulse align-middle rounded-sm" />
    </div>
  );
}
