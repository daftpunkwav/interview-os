"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Mic,
  FileText,
  Settings,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Building2,
  BarChart3,
  Video,
  BookOpen,
  Shield,
  KeyRound,
} from "lucide-react";
import {
  FadeInView,
  StaggerContainer,
  StaggerItem,
  AnimatedCounter,
  FluidBackground,
  ParticleField,
} from "@/components/effects";

const STEPS = [
  {
    n: "01",
    title: "配置密钥",
    desc: "接入你的 LLM API，密钥本地加密存储",
    href: "/settings",
    icon: Settings,
  },
  {
    n: "02",
    title: "上传简历",
    desc: "解析档案，生成多维度深度评价",
    href: "/resume",
    icon: FileText,
  },
  {
    n: "03",
    title: "开始面试",
    desc: "选公司与岗位，进入真实模拟",
    href: "/interview",
    icon: Mic,
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "动态出题",
    desc: "基于简历与目标岗位实时生成问题，而不是固定题库。",
  },
  {
    icon: MessageSquare,
    title: "深度追问",
    desc: "回答含糊时自动深挖细节，贴近真实面试官节奏。",
  },
  {
    icon: Building2,
    title: "企业风格",
    desc: "字节、腾讯、阿里等公司面试风格可切换。",
  },
  {
    icon: Video,
    title: "音视频交互",
    desc: "摄像头与语音实时参与，还原临场压力。",
  },
  {
    icon: BookOpen,
    title: "面试准备",
    desc: "教练式辅导与面经检索，上场前系统梳理。",
  },
  {
    icon: BarChart3,
    title: "报告与成长",
    desc: "场次评分、改进建议，弱项跨场次沉淀。",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

function InterviewPreview() {
  return (
    <div className="relative">
      {/* 柔和投影底座 */}
      <div
        className="absolute -inset-3 rounded-[22px] opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(ellipse at 50% 80%, rgba(66,133,244,0.18), transparent 70%)",
        }}
      />
      <div className="relative rounded-2xl border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(32,33,36,0.06),0_8px_28px_rgba(32,33,36,0.08)] overflow-hidden">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[#fafbfc]">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--g-green)] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--g-green)]" />
            </span>
            <span className="text-[13px] font-medium text-[var(--foreground)]">
              模拟面试进行中
            </span>
          </div>
          <span className="text-[11px] tabular-nums text-[var(--muted-soft)] font-medium tracking-wide">
            12:34
          </span>
        </div>

        {/* 对话 */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand-ink)]">
              面
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-[var(--muted-soft)] mb-1">
                面试官 · 字节跳动
              </p>
              <div className="rounded-xl rounded-tl-sm bg-[#f1f3f4] px-3.5 py-2.5">
                <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  请介绍一下你最近负责的项目，重点说明你做了什么决策，以及结果如何衡量。
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 flex-row-reverse">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[11px] font-semibold text-white">
              我
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-[var(--muted-soft)] mb-1 text-right">
                你
              </p>
              <div className="rounded-xl rounded-tr-sm bg-[var(--brand-soft)] px-3.5 py-2.5">
                <p className="text-[13px] leading-relaxed text-[var(--brand-ink)]">
                  上一个季度我负责订单履约链路改造，把峰值延迟从…
                </p>
                <span className="mt-1.5 inline-block h-3.5 w-0.5 bg-[var(--brand)] animate-pulse align-middle" />
              </div>
            </div>
          </div>
        </div>

        {/* 底栏状态 */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--border)] bg-[#fafbfc]">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <Video size={12} strokeWidth={2} className="text-[var(--brand)]" />
            视频已连接
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <Mic size={12} strokeWidth={2} className="text-[var(--g-green)]" />
            语音识别中
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-full bg-white">
      {/* —— Hero —— */}
      <section className="relative overflow-hidden">
        {/* 底色：白 → 极淡蓝灰 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #ffffff 0%, #f7f9fc 55%, #f0f4fa 100%)",
          }}
        />
        <FluidBackground className="opacity-100" />
        <div className="absolute inset-0 opacity-40">
          <ParticleField density={0.4} />
        </div>
        {/* 底部淡出到白，衔接下一区 */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{
            background: "linear-gradient(to top, #ffffff, transparent)",
          }}
        />

        <div className="relative mx-auto max-w-[1120px] px-6 sm:px-8 pt-14 sm:pt-16 lg:pt-20 pb-16 sm:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* 左：文案 */}
            <div className="lg:col-span-6 xl:col-span-5">
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease }}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/80 backdrop-blur-sm px-3 py-1 mb-6 shadow-[var(--shadow-sm)]"
              >
                <KeyRound size={12} className="text-[var(--brand)]" strokeWidth={2} />
                <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                  开源 · BYOK · 数据本地
                </span>
              </motion.div>

              <motion.h1
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.04, ease }}
                className="text-[clamp(2.125rem,4.5vw,3.25rem)] font-semibold tracking-[-0.035em] leading-[1.1] text-[var(--foreground)]"
              >
                用真实流程
                <br />
                <span className="text-[var(--brand-strong)]">练好下一场面试</span>
              </motion.h1>

              <motion.p
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1, ease }}
                className="mt-5 max-w-[34ch] text-[15px] sm:text-[16px] leading-[1.65] text-[var(--muted)]"
              >
                上传简历，选择目标公司，体验追问与音视频交互。自带 API Key，无需注册账号。
              </motion.p>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.16, ease }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Link
                  href="/interview"
                  className="group inline-flex h-11 items-center gap-2 rounded-full bg-[var(--brand)] px-6 text-sm font-medium text-white shadow-[0_1px_2px_rgba(26,115,232,.3),0_2px_6px_rgba(26,115,232,.2)] hover:bg-[var(--brand-strong)] hover:shadow-[0_2px_8px_rgba(26,115,232,.35)] active:scale-[0.98] transition-all"
                >
                  开始面试
                  <ArrowRight
                    size={16}
                    strokeWidth={2}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <Link
                  href="/resume"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-5 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--brand)]/40 hover:text-[var(--brand-strong)] hover:bg-[var(--brand-softer)] transition-colors"
                >
                  上传简历
                </Link>
              </motion.div>

              {/* 指标行 */}
              <motion.div
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.26, duration: 0.45 }}
                className="mt-10 flex flex-wrap gap-x-8 gap-y-4"
              >
                {[
                  { value: 50, suffix: "+", label: "企业风格" },
                  { value: 1000, suffix: "+", label: "题库规模" },
                  { value: 100, suffix: "%", label: "本地可用" },
                ].map((s) => (
                  <div key={s.label} className="min-w-0">
                    <p className="text-xl font-semibold tracking-tight text-[var(--foreground)] tabular-nums">
                      <AnimatedCounter value={s.value} suffix={s.suffix} />
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--muted-soft)]">{s.label}</p>
                  </div>
                ))}
                <div className="min-w-0">
                  <p className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
                    0
                  </p>
                  <p className="mt-0.5 text-[12px] text-[var(--muted-soft)]">账号注册</p>
                </div>
              </motion.div>
            </div>

            {/* 右：产品预览签名 */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12, ease }}
              className="lg:col-span-6 xl:col-span-7 lg:pl-4"
            >
              <InterviewPreview />
            </motion.div>
          </div>
        </div>
      </section>

      {/* —— 三步 —— */}
      <section className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-[1120px] px-6 sm:px-8 py-16 sm:py-20">
          <FadeInView>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-10">
              <div>
                <p className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[var(--brand)] mb-2">
                  上手流程
                </p>
                <h2 className="text-[1.5rem] sm:text-[1.75rem] font-semibold tracking-tight text-[var(--foreground)]">
                  三步开始
                </h2>
              </div>
              <p className="text-sm text-[var(--muted)] max-w-xs sm:text-right">
                密钥 → 简历 → 面试，本地即可跑通
              </p>
            </div>
          </FadeInView>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {STEPS.map((step, i) => (
              <StaggerItem key={step.n}>
                <Link
                  href={step.href}
                  className="group relative flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[#fafbfc] p-6 sm:p-7 hover:bg-white hover:border-[var(--brand)]/25 hover:shadow-[var(--shadow-md)] transition-all"
                >
                  <div className="flex items-start justify-between mb-5">
                    <span className="text-[13px] font-semibold tabular-nums tracking-wide text-[var(--brand)]">
                      {step.n}
                    </span>
                    <step.icon
                      size={18}
                      strokeWidth={1.75}
                      className="text-[var(--muted-soft)] group-hover:text-[var(--brand)] transition-colors"
                    />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-1.5">
                    {step.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-[var(--muted)] flex-1">
                    {step.desc}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand)]">
                    前往
                    <ArrowRight
                      size={13}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  {i < STEPS.length - 1 && (
                    <span
                      className="pointer-events-none absolute top-1/2 -right-2.5 z-10 hidden md:flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white border border-[var(--border)] text-[var(--muted-soft)]"
                      aria-hidden
                    >
                      <ArrowRight size={10} />
                    </span>
                  )}
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* —— 能力 —— */}
      <section className="border-t border-[var(--border)] bg-[#f8f9fa]">
        <div className="mx-auto max-w-[1120px] px-6 sm:px-8 py-16 sm:py-20">
          <FadeInView>
            <p className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[var(--brand)] mb-2">
              能力
            </p>
            <h2 className="text-[1.5rem] sm:text-[1.75rem] font-semibold tracking-tight text-[var(--foreground)] max-w-[18ch]">
              为真实面试准备的工具链
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)] max-w-md">
              从准备到报告，Agent 全链路协助，而不是刷固定题库。
            </p>
          </FadeInView>

          <StaggerContainer className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <div className="group h-full rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-6 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] transition-all">
                  <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-softer)] text-[var(--brand-strong)] group-hover:bg-[var(--brand-soft)] transition-colors">
                    <f.icon size={17} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-[14px] font-semibold text-[var(--foreground)] mb-1">
                    {f.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-[var(--muted)]">{f.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* —— 信任点 —— */}
      <section className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-[1120px] px-6 sm:px-8 py-12 sm:py-14">
          <FadeInView>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--success-soft)] text-[var(--success-ink)]">
                  <Shield size={15} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">本地优先</p>
                  <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                    面试数据与密钥默认留在本机，不强制上云
                  </p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-[var(--border)]" />
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-softer)] text-[var(--brand-ink)]">
                  <KeyRound size={15} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">自带密钥</p>
                  <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                    BYOK 接入你的 LLM，成本与模型自己掌控
                  </p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-[var(--border)]" />
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--warning-soft)] text-[var(--warning-ink)]">
                  <Sparkles size={15} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">开源可审计</p>
                  <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                    代码透明，流程可改，适合二次定制
                  </p>
                </div>
              </div>
            </div>
          </FadeInView>
        </div>
      </section>

      {/* —— CTA —— */}
      <section className="border-t border-[var(--border)] bg-[#f8f9fa]">
        <div className="mx-auto max-w-[1120px] px-6 sm:px-8 py-14 sm:py-16">
          <FadeInView>
            <div className="relative overflow-hidden rounded-2xl bg-[#202124] px-7 py-10 sm:px-12 sm:py-12">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(500px 220px at 90% 0%, rgba(66,133,244,0.35), transparent 55%), radial-gradient(360px 180px at 10% 100%, rgba(52,168,83,0.12), transparent 50%)",
                }}
              />
              <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                    下一场面试，现在就开始练
                  </h2>
                  <p className="mt-2 text-sm text-white/55 max-w-md">
                    本地优先 · BYOK · 无需注册账号
                  </p>
                </div>
                <Link
                  href="/interview"
                  className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-[var(--foreground)] hover:bg-[#f1f3f4] active:scale-[0.98] transition-all"
                >
                  开始模拟面试
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>
          </FadeInView>
        </div>
      </section>
    </div>
  );
}
