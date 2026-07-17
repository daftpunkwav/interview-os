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
  return (
    <div className="alert alert-error shadow-sm">
      <div className="w-9 h-9 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
        <AlertCircle size={18} className="text-[var(--danger)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">加载失败</p>
        <p className="mt-1 text-[13px] opacity-90 break-words leading-relaxed">{message}</p>
        <p className="mt-2 text-xs opacity-70 leading-relaxed">
          请确认后端已启动：
          <code className="mx-1 px-1.5 py-0.5 rounded bg-white/80 border border-red-100/80 font-mono text-[11px] text-[var(--danger-ink)]">
            cd backend → uvicorn app.main:app --port 8000
          </code>
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 btn-secondary !h-9 !text-[var(--danger-ink)] !border-[var(--danger)]/30 hover:!bg-white/70">
            <RefreshCw size={14} />
            重试
          </button>
        )}
      </div>
    </div>
  );
}
