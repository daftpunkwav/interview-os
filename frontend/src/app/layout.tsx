import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/Toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "InterviewOS — AI 智能模拟面试",
  description: "基于 AI Agent 的真实面试模拟系统，支持 BYOK",
  applicationName: "InterviewOS",
  themeColor: "#0b0b12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-zinc-950 text-zinc-100`}>
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
