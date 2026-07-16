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
} from "lucide-react";
import {
  ParticleField,
  FluidBackground,
  FadeInView,
  StaggerContainer,
  StaggerItem,
  MagneticButton,
  AnimatedCounter,
} from "@/components/effects";

const STEPS = [
  {
    step: "1",
    title: "配置 BYOK",
    desc: "接入你的 LLM API Key",
    href: "/settings",
    icon: Settings,
    color: "from-blue-500/10 to-indigo-500/10",
    iconColor: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    step: "2",
    title: "上传简历",
    desc: "AI 自动解析职业档案",
    href: "/resume",
    icon: FileText,
    color: "from-emerald-500/10 to-teal-500/10",
    iconColor: "text-emerald-500",
    bgColor: "bg-emerald-50",
  },
  {
    step: "3",
    title: "开始面试",
    desc: "选择公司与岗位，模拟真实面试",
    href: "/interview",
    icon: Mic,
    color: "from-violet-500/10 to-purple-500/10",
    iconColor: "text-violet-500",
    bgColor: "bg-violet-50",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "动态问题生成",
    desc: "基于简历实时出题",
    color: "text-amber-500",
    bg: "bg-amber-50",
  },
  {
    icon: Zap,
    title: "深度追问",
    desc: "发现模糊回答主动追问",
    color: "text-rose-500",
    bg: "bg-rose-50",
  },
  {
    icon: Shield,
    title: "企业风格模拟",
    desc: "字节/腾讯/阿里等",
    color: "text-cyan-500",
    bg: "bg-cyan-50",
  },
  {
    icon: BarChart3,
    title: "多 Workflow",
    desc: "技术面/HR面/管理岗",
    color: "text-indigo-500",
    bg: "bg-indigo-50",
  },
  {
    icon: Mic,
    title: "视频面试",
    desc: "摄像头 + 语音交互",
    color: "text-violet-500",
    bg: "bg-violet-50",
  },
  {
    icon: FileText,
    title: "面试报告",
    desc: "能力分析与训练计划",
    color: "text-emerald-500",
    bg: "bg-emerald-50",
  },
  {
    icon: TrendingUpIcon,
    title: "成长追踪",
    desc: "记录薄弱项持续优化",
    color: "text-orange-500",
    bg: "bg-orange-50",
  },
  {
    icon: Settings,
    title: "BYOK",
    desc: "自带 API Key，数据本地",
    color: "text-slate-500",
    bg: "bg-slate-50",
  },
];

function TrendingUpIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

const STATS = [
  { value: 50, suffix: "+", label: "企业风格" },
  { value: 1000, suffix: "+", label: "面试题库" },
  { value: 99, suffix: "%", label: "准确率" },
  { value: 0, suffix: "", label: "数据泄露", prefix: "零" },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 流体背景 */}
      <FluidBackground />

      {/* 粒子效果层 */}
      <div className="absolute inset-0 pointer-events-none">
        <ParticleField />
      </div>

      {/* 内容层 */}
      <div className="relative z-10 p-5 sm:p-8 max-w-5xl mx-auto">
        {/* Hero 区域 */}
        <FadeInView className="mb-12 sm:mb-16 text-center pt-4 sm:pt-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.8,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 text-brand-600 text-sm font-medium mb-6 border border-brand-100 shadow-sm"
          >
            <Sparkles size={16} />
            <span>AI 驱动的真实面试模拟系统</span>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 tracking-tight"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <span className="bg-gradient-to-r from-brand-700 via-brand-500 to-brand-600 bg-clip-text text-transparent">
              InterviewOS
            </span>
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-[var(--muted)] max-w-2xl mx-auto leading-relaxed"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            上传简历、选择目标公司、开启沉浸式模拟面试
            <br />
            <span className="text-base">让每一次练习都接近真实</span>
          </motion.p>

          <motion.div
            className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <MagneticButton
              renderAs="a"
              href="/interview"
              className="px-8 py-3 bg-brand-600 text-white rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:bg-brand-700"
              strength={0.2}
            >
              <span className="flex items-center justify-center gap-2">
                立即开始
                <ArrowRight size={18} />
              </span>
            </MagneticButton>
            <MagneticButton
              renderAs="a"
              href="/resume"
              className="px-8 py-3 border border-[var(--border)] bg-[var(--card)] rounded-xl font-medium hover:border-brand-300 shadow-sm"
              strength={0.15}
            >
              上传简历
            </MagneticButton>
          </motion.div>
        </FadeInView>

        {/* 数据展示 */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {STATS.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className="text-center p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-500">
                <div className="text-3xl font-bold text-brand-600 mb-1">
                  {stat.prefix && <span>{stat.prefix}</span>}
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-[var(--muted)]">{stat.label}</div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* 步骤卡片 */}
        <FadeInView className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">三步开启面试之旅</h2>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((item, index) => (
              <StaggerItem key={item.step}>
                <Link href={item.href} className="group block">
                  <motion.div
                    className="relative p-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
                    whileHover={{ y: -4, scale: 1.02 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    {/* 渐变背景 */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                    />

                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-4">
                        <span
                          className={`text-xs font-medium ${item.iconColor} ${item.bgColor} px-3 py-1 rounded-full`}
                        >
                          步骤 {item.step}
                        </span>
                        <motion.div
                          whileHover={{ rotate: 15, scale: 1.1 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <item.icon
                            size={22}
                            className="text-[var(--muted)] group-hover:text-brand-600 transition-colors"
                          />
                        </motion.div>
                      </div>
                      <h3 className="font-semibold text-lg mb-2 group-hover:text-brand-700 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-sm text-[var(--muted)]">{item.desc}</p>

                      {/* 箭头指示 */}
                      <motion.div
                        className="mt-4 flex items-center text-sm text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        initial={{ x: -10 }}
                        whileHover={{ x: 0 }}
                      >
                        <span>立即开始</span>
                        <ArrowRight size={14} className="ml-1" />
                      </motion.div>
                    </div>

                    {/* 步骤连接线 */}
                    {index < STEPS.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
                    )}
                  </motion.div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </FadeInView>

        {/* 核心能力 */}
        <FadeInView>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
            <h2 className="text-2xl font-bold mb-2 text-center">核心能力</h2>
            <p className="text-[var(--muted)] text-center mb-8">
              全链路 AI 驱动，打造真实面试体验
            </p>

            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {FEATURES.map((feat) => (
                <StaggerItem key={feat.title}>
                  <motion.div
                    className="p-5 rounded-xl border border-transparent hover:border-[var(--border)] hover:bg-gray-50/50 transition-all duration-300"
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg ${feat.bg} flex items-center justify-center mb-3`}
                    >
                      <feat.icon size={20} className={feat.color} />
                    </div>
                    <h3 className="font-semibold mb-1">{feat.title}</h3>
                    <p className="text-sm text-[var(--muted)]">{feat.desc}</p>
                  </motion.div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </FadeInView>

        {/* CTA 区域 */}
        <FadeInView className="mt-16 text-center">
          <motion.div
            className="p-8 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 text-white"
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="text-2xl font-bold mb-3">准备好迎接下一场面试了吗？</h3>
            <p className="text-brand-100 mb-6">每一次练习，都是向 offer 更近一步</p>
            <MagneticButton
              renderAs="a"
              href="/interview"
              className="px-8 py-3 bg-white text-brand-600 rounded-xl font-medium shadow-lg"
              strength={0.2}
            >
              <span className="flex items-center gap-2">
                开始模拟面试
                <ArrowRight size={18} />
              </span>
            </MagneticButton>
          </motion.div>
        </FadeInView>
      </div>
    </div>
  );
}
