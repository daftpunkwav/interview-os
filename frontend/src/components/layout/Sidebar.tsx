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
      <div className="px-4 py-5 flex items-center justify-between overflow-hidden min-h-[72px]">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3 min-w-0 group">
          <span className="g-logo-dot shadow-sm" aria-hidden />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                className="overflow-hidden min-w-0"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
              >
                <h1 className="text-[17px] font-semibold text-[var(--foreground)] whitespace-nowrap tracking-tight">
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
      <nav className="flex-1 px-3 pb-3 space-y-0.5 overflow-y-auto" aria-label="主导航">
        {NAV_ITEMS.filter((item) => !item.hidden).map(({ href, label, icon: Icon }) => {
          const isActive = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className="block"
              title={collapsed ? label : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm relative group",
                  isActive
                    ? "bg-[var(--brand-soft)] text-[var(--brand-ink)] font-medium"
                    : "text-[var(--text-secondary)] hover:bg-white/70 hover:text-[var(--foreground)]",
                )}
              >
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive
                      ? "text-[var(--brand)]"
                      : "text-[var(--muted)] group-hover:text-[var(--text-secondary)]",
                  )}
                />

                {!collapsed && (
                  <span className="whitespace-nowrap overflow-hidden flex-1">{label}</span>
                )}

                {href === "/interview" && !collapsed && (
                  <span className="chip chip-blue ml-auto !px-1.5 !py-0 !text-[10px]">Hot</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* 底部状态 */}
      {!collapsed && (
        <div className="mx-3 mb-3 px-3 py-3 rounded-lg bg-white/60 border border-[var(--sidebar-border)]">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--g-green)] opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--g-green)]" />
            </span>
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-[var(--border)] bg-white/95 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="btn-ghost !w-9 !h-9"
          aria-label="打开导航"
        >
          <Menu size={18} />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <span className="g-logo-dot-sm" aria-hidden />
          <span className="font-semibold text-[var(--foreground)]">InterviewOS</span>
        </Link>
      </div>

      {/* 移动端抽屉遮罩 */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-40 bg-black/40"
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
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] flex flex-col shadow-elevate"
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            exit={{ x: -288 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 btn-ghost !w-8 !h-8"
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
          "hidden lg:flex border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] flex-col shrink-0 relative sticky top-0 h-screen z-20",
          collapsed ? "w-[72px]" : "w-64",
        )}
        initial={false}
        animate={{ width: collapsed ? 72 : 256 }}
        transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      >
        <NavContent collapsed={collapsed} />

        <button
          type="button"
          className="absolute -right-3 top-[4.75rem] w-6 h-6 rounded-full bg-white border border-[var(--border)] shadow-sm flex items-center justify-center text-[var(--muted)] hover:text-[var(--brand)] hover:border-brand-300 z-20"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </motion.aside>
    </>
  );
}
