"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = /^\/interview\/\d+/.test(pathname);
  const isFixedHeightPage = pathname === "/prep" || pathname === "/interview";

  if (isFullscreen) {
    return (
      <motion.main
        className="h-screen w-screen overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {children}
      </motion.main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={
          isFixedHeightPage
            ? "flex-1 h-screen overflow-hidden"
            : "flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        }
      >
        <motion.div
          key={pathname}
          className={isFixedHeightPage ? "h-full" : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
