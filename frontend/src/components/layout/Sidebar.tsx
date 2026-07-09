"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAV_ITEMS } from "@/config/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      className={cn(
        "border-r border-[var(--border)] bg-[var(--card)] flex flex-col shrink-0 relative",
        collapsed ? "w-16" : "w-60"
      )}
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* Logo 区域 */}
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between overflow-hidden">
        <motion.div
          className="flex items-center gap-3"
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">I</span>
          </div>
          <div className={cn("overflow-hidden", collapsed && "w-0")}>
            <h1 className="text-lg font-bold text-brand-700 whitespace-nowrap">InterviewOS</h1>
            <p className="text-xs text-[var(--muted)] whitespace-nowrap">AI 模拟面试 Agent</p>
          </div>
        </motion.div>
      </div>

      {/* 收起/展开按钮 */}
      <motion.button
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-sm flex items-center justify-center text-[var(--muted)] hover:text-brand-600 hover:border-brand-300 transition-colors z-20"
        onClick={() => setCollapsed(!collapsed)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </motion.button>

      {/* 导航 */}
      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link key={href} href={href} className="block">
              <motion.div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors relative",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--foreground)]"
                )}
                whileHover={{ x: 2 }}
                transition={{ duration: 0.2 }}
                title={collapsed ? label : undefined}
              >
                {/* 活跃指示器 */}
                {isActive && (
                  <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-500 rounded-r-full"
                    layoutId="activeIndicator"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                <motion.div
                  whileHover={{ rotate: isActive ? 0 : 5, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  <Icon size={18} className="shrink-0" />
                </motion.div>

                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      className="whitespace-nowrap overflow-hidden"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* 模拟面试徽标 */}
                {href === "/interview" && !collapsed && (
                  <motion.span
                    className="ml-auto text-[10px] px-2 py-0.5 bg-brand-100 text-brand-600 rounded-full font-medium"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: "spring" }}
                  >
                    Hot
                  </motion.span>
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* 底部信息 */}
      <motion.div
        className="p-4 border-t border-[var(--border)] text-xs text-[var(--muted)]"
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>开源 · BYOK · 本地优先</span>
        </div>
      </motion.div>
    </motion.aside>
  );
}
