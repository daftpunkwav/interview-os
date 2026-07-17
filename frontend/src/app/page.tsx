"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Mic,
  FileText,
  Settings,
  ArrowRight,
  Sparkles,
  Zap,
  Shield,
  BarChart3,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import {
  FadeInView,
  StaggerContainer,
  StaggerItem,
  AnimatedCounter,
} from "@/components/effects";

const STEPS = [
  {
    step: "01",
    title: "配置 BYOK",
    desc: "接入你的 LLM API Key，密钥本地加密存储",
    href: "/settings",
    icon: Settings,
  },
  {
    step: "02",
    title: "上传简历",
    desc: "AI 解析职业档案，生成多维度评价",
    href: "/resume",
    icon: FileText,
  },
  {
    step: "03",
    title: "开始面试",
    desc: "选择公司与岗位，体验真实模拟面试",
    href: "/interview",
    icon: Mic,
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "动态问题生成",
    desc: "基于简历与岗位实时出题",
    tone: "blue" as const,
  },
  {
    icon: Zap,
    title: "深度追问",
    desc: "模糊回答时主动深挖细节",
    tone: "red" as const,
  },
  {
    icon: Shield,
    title: "企业风格模拟",
    desc: "字节 / 腾讯 / 阿里 / Google 等",
    tone: "yellow" as const,
  },
  {
    icon: BarChart3,
    title: "多 Workflow",
    desc: "技术面 · HR 面 · 管理岗",
    tone: "green" as const,
  },
  {
    icon: Mic,
    title: "视频面试",
    desc: "摄像头 + 语音实时交互",
    tone: "blue" as const,
  },
  {
    icon: BookOpen,
    title: "面试准备",
    desc: "ReAct 教练辅导与面经搜索",
    tone: "green" as const,
  },
  {
    icon: FileText,
    title: "面试报告",
    desc: "能力分析与训练计划",
    tone: "yellow" as const,
  },
  {
    icon: TrendingUp,
    title: "成长追踪",
    desc: "弱项记录，跨面试持续优化",
    tone: "red" as const,
  },
];

const TONE_STYLES = {
  blue: { bg: "bg-[#dbeafe]", color: "text-[#0043ad]" },
  red: { bg: "bg-[#fce8e6]", color: "text-[#c5221f]" },
  yellow: { bg: "bg-[#fef7e0]", color: "text-[#b06000]" },
  green: { bg: "bg-[#e6f4ea]", color: "text-[#137333]" },
};

const STATS = [
  { value: 50, suffix: "+", label: "企业风格", prefix: "" },
  { value: 1000, suffix: "+", label: "面试题库", prefix: "" },
  { value: 99, suffix: "%", label: "本地可用", prefix: "" },
  { value: 0, suffix: "", label: "数据外传", prefix: "零" },
];

export default function HomePage() {
  return (
    <div className="min-h-full">
      {/* Hero · Google 渐变浅底 */}
      <section className="relative border-b border-[var(--border)] bg-gradient-to-br from-[#f8fbff] via-[#eef3fb] to-[#f0f6ff] overflow-hidden">
        {/* 极淡网格，非粒子轰炸 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(66,133,244,0.12) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative page-shell !max-w-5xl pt-10 sm:pt-14 pb-14 sm:pb-20">
          <FadeInView>
            <div className="block-tag mb-6">
              <Sparkles size={14} className="text-[var(--brand)]" />
              AI 驱动的真实面试模拟 · 开源 · BYOK
            </div>

            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-tight leading-[1.12] text-[var(--foreground)] max-w-3xl">
              让每一次练习
              <br />
              都接近<span className="text-brand-grad">真实面试</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] max-w-xl leading-relaxed">
              上传简历、选择目标公司，开启沉浸式模拟面试。
              本地优先存储，密钥由你掌控。
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/interview" className="btn-primary !h-12 !px-6 !text-[15px]">
                立即开始
                <ArrowRight size={18} />
              </Link>
              <Link href="/resume" className="btn-secondary !h-12 !px-6 !text-[15px]">
                上传简历
              </Link>
              <Link href="/prep" className="btn-tertiary !h-12 !px-4 !text-[15px]">
                面试准备
                <ArrowRight size={16} />
              </Link>
            </div>
          </FadeInView>
        </div>
      </section>

      <div className="page-shell !max-w-5xl -mt-8 relative z-10">
        {/* KPI 卡片 */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-14">
          {STATS.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className="surface-card p-5 text-center hover:shadow-elevate transition-shadow">
                <div className="text-2xl sm:text-3xl font-semibold text-[var(--brand)] tracking-tight tabular-nums">
                  {stat.prefix}
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </div>
                <div className="mt-1 text-xs sm:text-sm text-[var(--muted)]">{stat.label}</div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* 三步流程 */}
        <FadeInView className="mb-14">
          <div className="flex items-end justify-between mb-6 gap-4">
            <div>
              <span className="block-tag mb-3">流程</span>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                三步开启面试之旅
              </h2>
            </div>
          </div>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((item) => (
              <StaggerItem key={item.step}>
                <Link href={item.href} className="group block h-full">
                  <div className="surface-card-hover h-full p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-xs font-medium text-[var(--muted)] tracking-wider">
                        {item.step}
                      </span>
                      <div className="w-10 h-10 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-deep)] flex items-center justify-center group-hover:bg-[var(--brand)] group-hover:text-white transition-colors">
                        <item.icon size={18} />
                      </div>
                    </div>
                    <h3 className="font-semibold text-[15px] mb-1.5 group-hover:text-[var(--brand-deep)] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-sm text-[var(--muted)] leading-relaxed">{item.desc}</p>
                    <div className="mt-4 flex items-center text-sm font-medium text-[var(--brand)] opacity-0 group-hover:opacity-100 transition-opacity">
                      进入
                      <ArrowRight size={14} className="ml-1" />
                    </div>
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </FadeInView>

        {/* 核心能力 */}
        <FadeInView className="mb-14">
          <div className="surface-card p-6 sm:p-8">
            <div className="text-center mb-8">
              <span className="block-tag mb-3">能力</span>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">核心能力</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                全链路 AI 驱动，打造接近真实的面试体验
              </p>
            </div>

            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FEATURES.map((feat) => {
                const tone = TONE_STYLES[feat.tone];
                return (
                  <StaggerItem key={feat.title}>
                    <div className="p-4 rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-[#fafbfc] transition-colors h-full">
                      <div
                        className={`w-10 h-10 rounded-lg ${tone.bg} flex items-center justify-center mb-3`}
                      >
                        <feat.icon size={18} className={tone.color} />
                      </div>
                      <h3 className="font-semibold text-sm mb-1">{feat.title}</h3>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">{feat.desc}</p>
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </FadeInView>

        {/* CTA */}
        <FadeInView className="mb-8">
          <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-[#4285f4] via-[#1a73e8] to-[#0043ad] p-8 sm:p-10 text-white shadow-glow">
            <div
              className="pointer-events-none absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-20"
              style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }}
            />
            <div className="relative">
              <h3 className="text-xl sm:text-2xl font-semibold tracking-tight mb-2">
                准备好迎接下一场面试了吗？
              </h3>
              <p className="text-white/80 text-sm sm:text-base mb-6 max-w-md">
                每一次练习，都是向 offer 更近一步
              </p>
              <Link
                href="/interview"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-[var(--radius)] bg-white text-[var(--brand)] text-sm font-medium hover:bg-[#f8fbff] shadow-md"
              >
                开始模拟面试
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </FadeInView>
      </div>
    </div>
  );
}
