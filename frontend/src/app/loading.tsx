import { Loader2 } from "lucide-react";

export default function GlobalLoading() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center text-gray-500 gap-3">
      <Loader2 className="animate-spin" size={32} />
      <p className="text-sm">加载中…</p>
    </div>
  );
}
