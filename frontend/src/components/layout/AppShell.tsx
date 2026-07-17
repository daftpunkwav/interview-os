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
        className="h-screen w-screen overflow-hidden bg-gray-950"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {children}
      </motion.main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main
        className={
          isFixedHeightPage
            ? "flex-1 min-h-0 lg:h-screen overflow-hidden"
            : "flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        }
      >
        <motion.div
          key={pathname}
          className={isFixedHeightPage ? "h-full min-h-0" : undefined}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
