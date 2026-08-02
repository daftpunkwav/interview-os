"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, cycleTheme } = useTheme();

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={
        collapsed
          ? "mx-auto mb-3 w-10 h-10 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"
          : "mx-3 mb-3 w-[calc(100%-1.5rem)] flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)] border border-transparent"
      }
      title={`主题：${LABELS[theme]}（点击切换）`}
      aria-label={`当前主题 ${LABELS[theme]}，点击切换`}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">外观</span>
          <span className="text-xs text-[var(--muted)]">{LABELS[theme]}</span>
        </>
      )}
    </button>
  );
}
