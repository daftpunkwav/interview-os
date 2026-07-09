"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";

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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="text-amber-500 mb-4" size={48} />
      <h1 className="text-2xl font-semibold mb-2">页面出现异常</h1>
      <p className="text-gray-500 max-w-md mb-6">
        {error.message || "未知错误，请稍后再试。"}
        {error.digest && (
          <span className="block text-xs text-gray-400 mt-2">
            trace: {error.digest}
          </span>
        )}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition"
        >
          <RotateCw size={16} /> 重试
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition"
        >
          返回首页
        </button>
      </div>
    </main>
  );
}
