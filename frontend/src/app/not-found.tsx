import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <Compass className="text-gray-400 mb-4" size={48} />
      <h1 className="text-3xl font-semibold mb-2">404 — 找不到该页面</h1>
      <p className="text-gray-500 max-w-md mb-6">
        你访问的链接可能已被删除、合并，或者从来没有过。
      </p>
      <Link
        href="/"
        className="inline-flex items-center px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition"
      >
        返回首页
      </Link>
    </main>
  );
}
