import Link from "next/link";
import { Mic, FileText, Settings, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">欢迎使用 InterviewOS</h1>
        <p className="text-[var(--muted)] text-lg">
          AI 驱动的真实面试模拟系统 — 上传简历、选择目标公司、开启沉浸式模拟面试
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {[
          {
            step: "1",
            title: "配置 BYOK",
            desc: "接入你的 LLM API Key",
            href: "/settings",
            icon: Settings,
          },
          {
            step: "2",
            title: "上传简历",
            desc: "AI 自动解析职业档案",
            href: "/resume",
            icon: FileText,
          },
          {
            step: "3",
            title: "开始面试",
            desc: "选择公司与岗位，模拟真实面试",
            href: "/interview",
            icon: Mic,
          },
        ].map((item) => (
          <Link
            key={item.step}
            href={item.href}
            className="group p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-brand-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                步骤 {item.step}
              </span>
              <item.icon size={20} className="text-[var(--muted)] group-hover:text-brand-600" />
            </div>
            <h3 className="font-semibold mb-1">{item.title}</h3>
            <p className="text-sm text-[var(--muted)]">{item.desc}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="font-semibold mb-3">核心能力</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            "动态问题生成 — 基于简历实时出题",
            "深度追问 — 发现模糊回答主动追问",
            "企业风格模拟 — 字节/腾讯/阿里等",
            "多 Workflow — 技术面/HR面/管理岗",
            "视频面试 — 摄像头 + 语音交互",
            "面试报告 — 能力分析与训练计划",
            "成长追踪 — 记录薄弱项持续优化",
            "BYOK — 自带 API Key，数据本地",
          ].map((feat) => (
            <div key={feat} className="flex items-start gap-2">
              <ArrowRight size={14} className="text-brand-500 mt-0.5 shrink-0" />
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
