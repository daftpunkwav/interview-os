"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  User,
  FileText,
  Settings,
  Mic,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "首页", icon: Home },
  { href: "/profile", label: "个人档案", icon: User },
  { href: "/resume", label: "简历管理", icon: FileText },
  { href: "/interview", label: "模拟面试", icon: Mic },
  { href: "/history", label: "面试记录", icon: BarChart3 },
  { href: "/growth", label: "成长追踪", icon: TrendingUp },
  { href: "/settings", label: "BYOK 设置", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 border-r border-[var(--border)] bg-[var(--card)] flex flex-col shrink-0">
      <div className="p-5 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold text-brand-700">InterviewOS</h1>
        <p className="text-xs text-[var(--muted)] mt-0.5">AI 模拟面试 Agent</p>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === href
                ? "bg-brand-50 text-brand-700 font-medium"
                : "text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--foreground)]"
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-[var(--border)] text-xs text-[var(--muted)]">
        开源 · BYOK · 本地优先
      </div>
    </aside>
  );
}
