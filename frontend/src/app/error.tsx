"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 应用根级 Error Boundary。
 *
 * - 任何未捕获渲染错误都会到这里；
 * - ``reset`` 触发该错误重新尝试渲染；
 * - 展示 ``digest``（服务端生成）便于排障。
 */
export default function GlobalError({ error, reset }: Props) {
  const router = useRouter();

  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5">
        <AlertTriangle className="text-amber-500" size={28} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">页面出现异常</h1>
      <p className="text-[var(--muted)] max-w-md mb-8 leading-relaxed">
        {error.message || "未知错误，请稍后再试。"}
        {error.digest && (
          <span className="block text-xs text-slate-400 mt-2 font-mono">
            trace: {error.digest}
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button type="button" onClick={() => reset()} className="btn-primary">
          <RotateCw size={16} /> 重试
        </button>
        <button type="button" onClick={() => router.push("/")} className="btn-secondary">
          <Home size={16} /> 返回首页
        </button>
      </div>
    </main>
  );
}
