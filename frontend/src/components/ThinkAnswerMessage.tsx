"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { StreamingReveal } from "@/components/StreamingReveal";
import { splitThinkAnswer } from "@/lib/thinkStream";
import { cn } from "@/lib/utils";

interface ThinkAnswerMessageProps {
  /** 原始流式/完整内容（可含 think 标签） */
  content: string;
  streaming?: boolean;
  className?: string;
}

/**
 * 准备页助手气泡：
 * - 思考过程默认折叠，可展开
 * - 正式回答走 StreamingReveal 流式渲染
 */
export function ThinkAnswerMessage({
  content,
  streaming = false,
  className,
}: ThinkAnswerMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const { thinking, answer, inThinking, hasThinking } = useMemo(
    () => splitThinkAnswer(content),
    [content],
  );

  const showThinking = hasThinking || inThinking || thinking.length > 0;
  // 仍在思考且尚无正式回答时，给用户可见反馈
  const thinkingOnly = showThinking && !answer && (streaming || inThinking);

  return (
    <div className={cn("space-y-2 min-w-0", className)}>
      {showThinking && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs text-[var(--muted)] hover:bg-white/60 transition-colors"
            aria-expanded={expanded}
          >
            <ChevronRight
              size={14}
              className={cn(
                "shrink-0 transition-transform text-[var(--muted-soft)]",
                expanded && "rotate-90",
              )}
            />
            <Brain size={13} className="shrink-0 text-[var(--brand)]" />
            <span className="font-medium text-[var(--text-secondary)]">
              {inThinking && streaming ? "思考中…" : "思考过程"}
            </span>
            {!expanded && thinking && (
              <span className="truncate text-[var(--muted-soft)] flex-1 min-w-0">
                {thinking.slice(0, 48)}
                {thinking.length > 48 ? "…" : ""}
              </span>
            )}
            {inThinking && streaming && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse shrink-0" />
            )}
          </button>
          {expanded && (
            <div className="px-3 pb-2.5 pt-0 border-t border-[var(--border)]">
              <pre className="mt-2 text-[11px] leading-relaxed text-[var(--muted)] whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {thinking || (streaming ? "…" : "（无内容）")}
                {inThinking && streaming && (
                  <span className="inline-block w-1 h-3 ml-0.5 bg-[var(--muted-soft)] animate-pulse align-middle" />
                )}
              </pre>
            </div>
          )}
        </div>
      )}

      {thinkingOnly && !expanded && (
        <p className="text-xs text-[var(--muted)] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
          模型思考中，正式回答即将开始…
        </p>
      )}

      {answer ? (
        <StreamingReveal content={answer} streaming={streaming && !inThinking} />
      ) : streaming && !showThinking ? (
        <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
          生成中…
        </span>
      ) : null}
    </div>
  );
}
