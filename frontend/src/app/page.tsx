"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
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
  KeyRound,
  Lock,
} from "lucide-react";
import {
  FadeInView,
  StaggerContainer,
  StaggerItem,
  AnimatedCounter,
  FluidBackground,
  MagneticButton,
  ParticleField,
} from "@/components/effects";

const STEPS = [
  {
    step: "01",
    title: "配置 BYOK",
    desc: "接入你的 LLM API Key，密钥本地 AES 加密存储",
    href: "/settings",
    icon: Settings,
    accent: "#4285f4",
  },
  {
    step: "02",
    title: "上传简历",
    desc: "AI 解析职业档案，生成多维度深度评价",
    href: "/resume",
    icon: FileText,
    accent: "#34a853",
  },
  {
    step: "03",
    title: "开始面试",
    desc: "选择公司与岗位，体验沉浸式模拟面试",
    href: "/interview",
    icon: Mic,
    accent: "#ea4335",
  },
];

const FEATURES = [
  { icon: Sparkles, title: "动态问题生成", desc: "基于简历与岗位实时出题", tone: "blue" as const },
  { icon: Zap, title: "深度追问", desc: "模糊回答时主动深挖细节", tone: "red" as const },
  { icon: Shield, title: "企业风格模拟", desc: "字节 / 腾讯 / 阿里 / Google 等", tone: "yellow" as const },
  { icon: BarChart3, title: "多 Workflow", desc: "技术面 · HR 面 · 管理岗", tone: "green" as const },
  { icon: Mic, title: "视频面试", desc: "摄像头 + 语音实时交互", tone: "blue" as const },
  { icon: BookOpen, title: "面试准备", desc: "ReAct 教练辅导与面经搜索", tone: "green" as const },
  { icon: FileText, title: "面试报告", desc: "能力分析与训练计划", tone: "yellow" as const },
  { icon: TrendingUp, title: "成长追踪", desc: "弱项记录，跨面试持续优化", tone: "red" as const },
];

const TONE = {
  blue: { bg: "bg-[#e8f0fe]", color: "text-[#1967d2]", ring: "group-hover:ring-[#4285f4]/25" },
  red: { bg: "bg-[#fce8e6]", color: "text-[#c5221f]", ring: "group-hover:ring-[#ea4335]/20" },
  yellow: { bg: "bg-[#fef7e0]", color: "text-[#b06000]", ring: "group-hover:ring-[#fbbc05]/25" },
  green: { bg: "bg-[#e6f4ea]", color: "text-[#137333]", ring: "group-hover:ring-[#34a853]/20" },
};

const STATS = [
  { value: 50, suffix: "+", label: "企业风格", prefix: "" },
  { value: 1000, suffix: "+", label: "面试题库", prefix: "" },
  { value: 99, suffix: "%", label: "本地可用", prefix: "" },
  { value: 0, suffix: "", label: "数据外传", prefix: "零" },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function HomePage() {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-full relative overflow-x-hidden">
      {/* ========== Hero ========== */}
      <section className="relative border-b border-[var(--border)] overflow-hidden min-h-[min(88vh,820px)]">
        {/* 底色 + 非线性流体 + 粒子场 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#eef4ff] via-[#f5f8fc] to-[#f8f9fa]" />
        <FluidBackground className="opacity-100" />
        <div className="absolute inset-0 opacity-70 pointer-events-none">
          <ParticleField density={1.15} />
        </div>
        {/* 网格点阵（顶部浓、向下淡出） */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(66,133,244,0.16) 1px, transparent 0)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(180deg, black 30%, transparent 92%)",
          }}
        />

        <div className="relative page-shell !max-w-6xl pt-12 sm:pt-16 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-12 items-center">
            {/* 文案 */}
            <div>
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 border border-[var(--border)] shadow-sm text-[13px] text-[var(--text-secondary)] mb-6 backdrop-blur-sm"
              >
                <span className="g-logo-dot-sm !w-3.5 !h-3.5" aria-hidden />
                <span className="font-medium">AI Agent · 开源 · BYOK · 本地优先</span>
              </motion.div>

              <motion.h1
                initial={reduce ? false : { opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.06, ease }}
                className="text-[clamp(2.15rem,5.2vw,3.65rem)] font-bold tracking-tight leading-[1.08] text-[var(--foreground)]"
              >
                让每一次练习
                <br />
                都接近
                <span className="relative inline-block ml-1">
                  <span className="text-brand-grad">真实面试</span>
                  <motion.span
                    className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-[#4285f4] via-[#ea4335] to-[#fbbc05] origin-left"
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.7, delay: 0.45, ease }}
                  />
                </span>
              </motion.h1>

              <motion.p
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.14, ease }}
                className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] max-w-xl leading-relaxed"
              >
                上传简历、选择目标公司，开启沉浸式模拟面试。
                <br className="hidden sm:block" />
                密钥自带、数据本地落盘，准备到报告全链路 AI 驱动。
              </motion.p>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.22, ease }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <MagneticButton
                  renderAs="a"
                  href="/interview"
                  className="btn-primary !h-12 !px-7 !text-[15px] shadow-glow"
                  strength={0.18}
                >
                  立即开始
                  <ArrowRight size={18} />
                </MagneticButton>
                <MagneticButton
                  renderAs="a"
                  href="/resume"
                  className="btn-secondary !h-12 !px-6 !text-[15px] bg-white/90 backdrop-blur-sm"
                  strength={0.14}
                >
                  上传简历
                </MagneticButton>
                <Link
                  href="/prep"
                  className="btn-tertiary !h-12 !px-4 !text-[15px] text-[var(--text-secondary)]"
                >
                  面试准备
                  <ArrowRight size={16} />
                </Link>
              </motion.div>

              <motion.div
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="mt-8 flex flex-wrap gap-4 text-xs text-[var(--muted)]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <KeyRound size={13} className="text-[var(--brand)]" /> BYOK 自带密钥
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock size={13} className="text-[var(--g-green)]" /> AES 本地加密
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={13} className="text-[var(--g-yellow)]" /> Agent 全链路
                </span>
              </motion.div>
            </div>

            {/* 右侧展示卡 */}
            <motion.div
              initial={reduce ? false : { opacity: 0, x: 28, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.18, ease }}
              className="relative hidden lg:block"
            >
              <div className="absolute -inset-6 rounded-[28px] bg-gradient-to-br from-[#4285f4]/15 via-transparent to-[#34a853]/10 blur-2xl" />
              <div className="relative rounded-2xl border border-white/80 bg-white/75 backdrop-blur-xl shadow-elevate p-6 overflow-hidden">
                <div className="flex items-center gap-2 mb-5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ea4335]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#fbbc05]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#34a853]" />
                  <span className="ml-2 text-xs text-[var(--muted)] font-medium">Interview Room</span>
                </div>

                <div className="rounded-xl bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-5 text-white mb-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#4285f4]/20 rounded-full blur-2xl" />
                  <div className="relative flex items-start gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#4285f4] to-[#0043ad] flex items-center justify-center text-sm font-bold shrink-0 shadow-lg">
                      AI
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-white/50 mb-1">面试官 · 技术面</p>
                      <p className="text-sm leading-relaxed text-white/90">
                        能否结合你简历里的推荐系统项目，说明混合排序的权重是如何确定的？
                      </p>
                    </div>
                  </div>
                  <motion.div
                    className="mt-4 h-1 rounded-full bg-white/10 overflow-hidden"
                    initial={false}
                  >
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#4285f4] to-[#8ab4f8]"
                      animate={reduce ? { width: "62%" } : { width: ["18%", "72%", "48%", "80%"] }}
                      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </motion.div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { c: "#4285f4", l: "追问" },
                    { c: "#34a853", l: "核验" },
                    { c: "#fbbc05", l: "报告" },
                  ].map((x) => (
                    <div
                      key={x.l}
                      className="rounded-lg border border-[var(--border)] bg-white px-2 py-2.5 text-center"
                    >
                      <div
                        className="w-2 h-2 rounded-full mx-auto mb-1.5"
                        style={{ background: x.c }}
                      />
                      <p className="text-[11px] font-medium text-[var(--text-secondary)]">{x.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== 主体 ========== */}
      <div className="page-shell !max-w-6xl -mt-10 relative z-10">
        {/* KPI */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-16">
          {STATS.map((stat) => (
            <StaggerItem key={stat.label}>
              <motion.div
                whileHover={reduce ? undefined : { y: -3 }}
                transition={{ duration: 0.2 }}
                className="surface-card p-5 sm:p-6 text-center hover:shadow-elevate transition-shadow bg-white/95 backdrop-blur-sm"
              >
                <div className="text-2xl sm:text-3xl font-semibold text-[var(--brand)] tracking-tight tabular-nums">
                  {stat.prefix}
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </div>
                <div className="mt-1.5 text-xs sm:text-sm text-[var(--muted)]">{stat.label}</div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* 三步 */}
        <FadeInView className="mb-16">
          <div className="mb-7">
            <span className="block-tag mb-3">
              <Sparkles size={12} className="text-[var(--brand)]" />
              流程
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">三步开启面试之旅</h2>
            <p className="mt-1.5 text-sm text-[var(--muted)]">从密钥到面试，几分钟完成上手</p>
          </div>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((item, idx) => (
              <StaggerItem key={item.step}>
                <Link href={item.href} className="group block h-full">
                  <motion.div
                    whileHover={reduce ? undefined : { y: -4 }}
                    className="surface-card-hover h-full p-6 relative overflow-hidden bg-white"
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1 opacity-90"
                      style={{
                        background: `linear-gradient(90deg, ${item.accent}, transparent)`,
                      }}
                    />
                    <div className="flex items-center justify-between mb-5">
                      <span className="font-mono text-xs font-semibold text-[var(--muted)] tracking-wider">
                        {item.step}
                      </span>
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-105"
                        style={{ background: item.accent }}
                      >
                        <item.icon size={18} />
                      </div>
                    </div>
                    <h3 className="font-semibold text-[15px] mb-1.5 group-hover:text-[var(--brand-deep)] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-sm text-[var(--muted)] leading-relaxed">{item.desc}</p>
                    <div className="mt-5 flex items-center text-sm font-medium text-[var(--brand)] opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                      进入
                      <ArrowRight size={14} className="ml-1" />
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-2 w-4 h-px bg-[var(--border)]" />
                    )}
                  </motion.div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </FadeInView>

        {/* 能力矩阵 */}
        <FadeInView className="mb-16">
          <div className="surface-card p-6 sm:p-9 bg-white overflow-hidden relative">
            <div className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-[#4285f4]/[0.06] blur-3xl" />
            <div className="relative text-center mb-8">
              <span className="block-tag mb-3">能力</span>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">核心能力</h2>
              <p className="mt-2 text-sm text-[var(--muted)] max-w-md mx-auto">
                全链路 AI 驱动，从准备到报告打造接近真实的面试体验
              </p>
            </div>

            <StaggerContainer className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FEATURES.map((feat) => {
                const tone = TONE[feat.tone];
                return (
                  <StaggerItem key={feat.title}>
                    <motion.div
                      whileHover={reduce ? undefined : { y: -2 }}
                      className={`group p-4 rounded-xl border border-transparent hover:border-[var(--border)] hover:bg-[#fafbfc] hover:shadow-sm transition-all h-full ring-0 ${tone.ring}`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl ${tone.bg} flex items-center justify-center mb-3 transition-transform group-hover:scale-105`}
                      >
                        <feat.icon size={18} className={tone.color} />
                      </div>
                      <h3 className="font-semibold text-sm mb-1">{feat.title}</h3>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">{feat.desc}</p>
                    </motion.div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </FadeInView>

        {/* CTA */}
        <FadeInView className="mb-10">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4285f4] via-[#1a73e8] to-[#0d47a1] p-8 sm:p-11 text-white shadow-glow">
            <div className="pointer-events-none absolute -right-20 -top-24 w-72 h-72 rounded-full bg-white/15 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 bottom-0 w-48 h-48 rounded-full bg-[#34a853]/20 blur-3xl" />
            <motion.div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 40%)",
              }}
              animate={reduce ? undefined : { backgroundPosition: ["0% 0%", "100% 50%"] }}
              transition={{ duration: 12, repeat: Infinity, repeatType: "reverse" }}
            />
            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-semibold tracking-tight mb-2">
                  准备好迎接下一场面试了吗？
                </h3>
                <p className="text-white/80 text-sm sm:text-base max-w-md">
                  每一次练习，都是向 offer 更近一步
                </p>
              </div>
              <MagneticButton
                renderAs="a"
                href="/interview"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-[var(--radius)] bg-white text-[var(--brand)] text-sm font-semibold shadow-lg hover:bg-[#f8fbff] shrink-0"
                strength={0.16}
              >
                开始模拟面试
                <ArrowRight size={16} />
              </MagneticButton>
            </div>
          </div>
        </FadeInView>
      </div>
    </div>
  );
}
