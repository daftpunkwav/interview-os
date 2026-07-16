"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

/** API 加载失败提示 */
export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50 to-rose-50/50 px-5 py-5 text-sm text-red-900 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
          <AlertCircle size={18} className="text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">加载失败</p>
          <p className="mt-1 text-red-800/90 break-words leading-relaxed">{message}</p>
          <p className="mt-2 text-xs text-red-700/70 leading-relaxed">
            请确认后端已启动：
            <code className="mx-1 px-1.5 py-0.5 rounded bg-white/80 border border-red-100 font-mono text-[11px]">
              cd backend → uvicorn app.main:app --port 8000
            </code>
          </p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-3 btn-secondary !text-red-800 !border-red-200 hover:!bg-red-100/80">
              <RefreshCw size={14} />
              重试
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
