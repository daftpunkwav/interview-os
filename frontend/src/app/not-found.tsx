import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-5">
        <Compass className="text-slate-400" size={28} />
      </div>
      <p className="text-sm font-medium text-brand-600 mb-2">404</p>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">找不到该页面</h1>
      <p className="text-[var(--muted)] max-w-md mb-8 leading-relaxed">
        你访问的链接可能已被删除、合并，或者从来没有过。
      </p>
      <Link href="/" className="btn-primary">
        <Home size={16} /> 返回首页
      </Link>
    </main>
  );
}
