"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

/** API 加载失败提示 · Google alert 风格 */
export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const backendHint =
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
    `http://127.0.0.1:${process.env.NEXT_PUBLIC_BACKEND_PORT || "8000"}`;

  return (
    <div className="alert alert-error shadow-sm">
      <div className="w-9 h-9 rounded-lg bg-[var(--card)]/60 flex items-center justify-center shrink-0">
        <AlertCircle size={18} className="text-[var(--danger)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">加载失败</p>
        <p className="mt-1 text-[13px] opacity-90 break-words leading-relaxed">{message}</p>
        <p className="mt-2 text-xs opacity-70 leading-relaxed">
          请确认后端已启动（当前配置：
          <code className="mx-1 px-1.5 py-0.5 rounded bg-[var(--card)]/80 border border-[var(--danger)]/20 font-mono text-[11px] text-[var(--danger-ink)]">
            {backendHint}
          </code>
          ）。若刚改过端口，请重启 frontend。
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 btn-secondary !h-9 !text-[var(--danger-ink)] !border-[var(--danger)]/30 hover:!bg-[var(--card)]/70">
            <RefreshCw size={14} />
            重试
          </button>
        )}
      </div>
    </div>
  );
}
