import { Loader2 } from "lucide-react";

export default function GlobalLoading() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
      <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-600" size={22} />
      </div>
      <p className="text-sm">加载中…</p>
    </div>
  );
}
