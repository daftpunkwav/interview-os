"use client";

/**
 * 极简 Toast 系统。
 *
 * 用法：
 * ```tsx
 * import { Toaster, toast } from "@/components/Toast";
 * 
 * // 在 layout.tsx 顶部挂一次
 * <Toaster />
 * 
 * // 任意位置调用
 * toast.success("简历已上传");
 * toast.error("上传失败：" + e.message);
 * ```
 *
 * 设计要点：
 * - 全部基于 ``useSyncExternalStore`` + 模块级 ``subscribe``，避免引入 zustand/redux；
 * - 默认 4 s 自动关闭，可手动 ``persist: true``；
 * - 不依赖外部 UI 库，零额外体积。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastKind = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  persist?: boolean;
}

type Listener = (items: ToastItem[]) => void;

const _items: ToastItem[] = [];
const _listeners = new Set<Listener>();
let _seq = 0;

function emit() {
  for (const l of _listeners) l(_items.slice());
}

function push(item: ToastItem) {
  _items.push(item);
  emit();
}

function remove(id: number) {
  const idx = _items.findIndex((t) => t.id === id);
  if (idx >= 0) {
    _items.splice(idx, 1);
    emit();
  }
}

export const toast = {
  show: (message: string, opts?: { kind?: ToastKind; persist?: boolean }) =>
    push({ id: ++_seq, message, kind: opts?.kind ?? "info", persist: opts?.persist }),
  success: (message: string, opts?: { persist?: boolean }) =>
    push({ id: ++_seq, message, kind: "success", persist: opts?.persist }),
  info: (message: string, opts?: { persist?: boolean }) =>
    push({ id: ++_seq, message, kind: "info", persist: opts?.persist }),
  warning: (message: string, opts?: { persist?: boolean }) =>
    push({ id: ++_seq, message, kind: "warning", persist: opts?.persist }),
  error: (message: string, opts?: { persist?: boolean }) =>
    push({ id: ++_seq, message, kind: "error", persist: opts?.persist }),
  dismiss: (id: number) => remove(id),
};

const ICONS: Record<ToastKind, ReactNode> = {
  info: <Info className="text-sky-500" />,
  success: <CheckCircle2 className="text-emerald-500" />,
  warning: <AlertTriangle className="text-amber-500" />,
  error: <XCircle className="text-rose-500" />,
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(_items);

  useEffect(() => {
    const l: Listener = (next) => setItems(next);
    _listeners.add(l);
    setItems(_items.slice());
    return () => {
      _listeners.delete(l);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed top-4 right-4 z-[1000] flex flex-col gap-2 max-w-sm w-[min(360px,90vw)]"
    >
      <AnimatePresence>
        {items.map((t) => (
          <ToastView key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    remove(item.id);
  }, [item.id]);

  useEffect(() => {
    if (item.persist) return;
    timerRef.current = setTimeout(close, 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.persist, close]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="pointer-events-auto bg-white/95 dark:bg-zinc-900/95 border border-black/5 dark:border-white/10 rounded-lg shadow-lg p-3 flex items-start gap-3 backdrop-blur"
      role="status"
    >
      <div className="mt-0.5">{ICONS[item.kind]}</div>
      <p className="flex-1 text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap">
        {item.message}
      </p>
      <button
        type="button"
        onClick={close}
        className="text-zinc-400 hover:text-zinc-700 transition"
        aria-label="关闭"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

/** 给已在外部维护 ToastProvider 的页面使用（本项目 layout 用 Toaster 直挂）。 */
export const ToastContext = createContext<typeof toast | null>(null);
export function useToast(): typeof toast {
  const ctx = useContext(ToastContext);
  return ctx ?? toast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}
