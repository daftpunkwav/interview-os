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
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <AlertCircle size={18} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">加载失败</p>
          <p className="mt-1 text-red-700/90 break-words">{message}</p>
          <p className="mt-2 text-xs text-red-600/80">
            请确认后端已启动：cd backend → uvicorn app.main:app --port 8000
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-800 hover:bg-red-100 transition-colors text-xs font-medium"
            >
              <RefreshCw size={14} />
              重试
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
