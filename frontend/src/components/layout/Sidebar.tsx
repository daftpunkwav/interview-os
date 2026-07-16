"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/config/nav";
import { cn } from "@/lib/utils";

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/interview") {
    return pathname === "/interview" || pathname.startsWith("/interview/");
  }
  if (href === "/history") {
    return pathname === "/history" || pathname.startsWith("/report/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between overflow-hidden min-h-[72px]">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 shadow-sm shadow-brand-500/30">
            <span className="text-white text-sm font-bold">I</span>
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                className="overflow-hidden min-w-0"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-base font-bold text-brand-700 whitespace-nowrap tracking-tight">
                  InterviewOS
                </h1>
                <p className="text-[11px] text-[var(--muted)] whitespace-nowrap">
                  AI 模拟面试 Agent
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* 导航 */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.filter((item) => !item.hidden).map(({ href, label, icon: Icon }) => {
          const isActive = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className="block"
              title={collapsed ? label : undefined}
            >
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm relative group",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-medium shadow-sm"
                    : "text-[var(--muted)] hover:bg-slate-50 hover:text-slate-800",
                )}
              >
                {isActive && (
                  <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-500 rounded-r-full"
                    layoutId="activeIndicator"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}

                <Icon
                  size={18}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600",
                  )}
                />

                {!collapsed && (
                  <span className="whitespace-nowrap overflow-hidden flex-1">{label}</span>
                )}

                {href === "/interview" && !collapsed && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-brand-100 text-brand-600 rounded-full font-medium">
                    Hot
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* 底部状态 */}
      {!collapsed && (
        <div className="p-4 border-t border-[var(--border)] text-xs text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>开源 · BYOK · 本地优先</span>
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 路由变化时关闭移动端抽屉
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // 移动端打开时锁定滚动
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <>
      {/* 移动端顶栏 */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 rounded-lg border border-[var(--border)] flex items-center justify-center text-slate-600 hover:bg-slate-50"
          aria-label="打开导航"
        >
          <Menu size={18} />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <span className="text-white text-xs font-bold">I</span>
          </div>
          <span className="font-semibold text-brand-700">InterviewOS</span>
        </Link>
      </div>

      {/* 移动端抽屉遮罩 */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 移动端抽屉 */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-[var(--card)] border-r border-[var(--border)] flex flex-col shadow-xl"
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            exit={{ x: -288 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="关闭导航"
            >
              <X size={18} />
            </button>
            <NavContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* 桌面侧栏 */}
      <motion.aside
        className={cn(
          "hidden lg:flex border-r border-[var(--border)] bg-[var(--card)] flex-col shrink-0 relative sticky top-0 h-screen z-20",
          collapsed ? "w-16" : "w-60",
        )}
        initial={false}
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <NavContent collapsed={collapsed} />

        <motion.button
          type="button"
          className="absolute -right-3 top-[4.5rem] w-6 h-6 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-sm flex items-center justify-center text-[var(--muted)] hover:text-brand-600 hover:border-brand-300 z-20"
          onClick={() => setCollapsed(!collapsed)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </motion.button>
      </motion.aside>
    </>
  );
}
