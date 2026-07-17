"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ox: number;
  oy: number;
  radius: number;
  baseR: number;
  opacity: number;
  baseOp: number;
  color: string;
  phase: number;
  mass: number;
}

/**
 * 粒子特效：curl-noise 流场 + 鼠标涡旋/斥力 + 动态连线。
 * 坐标与尺寸基于 CSS 像素；DPR 仅用于画布缓冲。
 */
export function ParticleField({
  className = "",
  density = 1,
}: {
  className?: string;
  /** 粒子密度系数，默认 1 */
  density?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const animationRef = useRef(0);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = [
      "66,133,244",
      "138,180,248",
      "52,168,83",
      "251,188,5",
      "234,67,53",
      "26,115,232",
    ];

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let last = performance.now();

    function field(x: number, y: number, tt: number): number {
      const nx = x / Math.max(cssW, 1);
      const ny = y / Math.max(cssH, 1);
      return (
        Math.sin(nx * 3.1 + tt * 0.7) * Math.cos(ny * 2.4 - tt * 0.5) * 0.5 +
        Math.sin(nx * 5.2 - ny * 2.8 + tt * 1.1) * 0.3 +
        Math.cos((nx + ny) * 4.0 - tt * 0.4) * 0.2
      );
    }

    function curl(x: number, y: number, tt: number) {
      const e = 8;
      const dFdx = (field(x + e, y, tt) - field(x - e, y, tt)) / (2 * e);
      const dFdy = (field(x, y + e, tt) - field(x, y - e, tt)) / (2 * e);
      // 切向 + 非线性增益
      const u = dFdy * 120;
      const v = -dFdx * 120;
      return { u, v };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spawn();
    }

    function spawn() {
      const area = cssW * cssH;
      const count = Math.min(140, Math.max(40, Math.floor((area / 14000) * density)));
      const list: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const x = Math.random() * cssW;
        const y = Math.random() * cssH;
        const baseR = Math.random() * 2.2 + 0.8;
        const baseOp = Math.random() * 0.45 + 0.2;
        list.push({
          x,
          y,
          ox: x,
          oy: y,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: baseR,
          baseR,
          opacity: baseOp,
          baseOp,
          color: colors[i % colors.length]!,
          phase: Math.random() * Math.PI * 2,
          mass: 0.6 + Math.random() * 0.8,
        });
      }
      particlesRef.current = list;
    }

    function onMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    }
    function onLeave() {
      mouseRef.current.active = false;
    }

    function step(now: number) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!reduce) tRef.current += dt;
      const t = tRef.current;
      const mouse = mouseRef.current;
      const particles = particlesRef.current;

      ctx.clearRect(0, 0, cssW, cssH);

      // 软更新
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const c = curl(p.x, p.y, t);

        // 流场力（非线性：速度平方根阻尼 + 场强调制）
        const flowGain = 0.55 + 0.35 * Math.sin(t * 0.4 + p.phase);
        p.vx += c.u * dt * flowGain * 0.08;
        p.vy += c.v * dt * flowGain * 0.08;

        // 轻微回归原域，避免全部冲出
        p.vx += (p.ox - p.x) * 0.0008;
        p.vy += (p.oy - p.y) * 0.0008;

        // 鼠标：近距斥力 + 切向涡旋（非线性 falloff）
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.hypot(dx, dy) || 1;
          const R = 160;
          if (dist < R) {
            const n = 1 - dist / R;
            const fall = n * n * (3 - 2 * n); // smoothstep
            // 斥力
            p.vx += (dx / dist) * fall * 28 * dt;
            p.vy += (dy / dist) * fall * 28 * dt;
            // 涡旋
            p.vx += (-dy / dist) * fall * 18 * dt;
            p.vy += (dx / dist) * fall * 18 * dt;
          }
        }

        // 速度钳制 + 非线性阻尼
        const sp = Math.hypot(p.vx, p.vy);
        const maxSp = 2.8 / p.mass;
        if (sp > maxSp) {
          p.vx = (p.vx / sp) * maxSp;
          p.vy = (p.vy / sp) * maxSp;
        }
        const damp = 0.985 - Math.min(0.04, sp * 0.01);
        p.vx *= damp;
        p.vy *= damp;

        p.x += p.vx;
        p.y += p.vy;

        // 环绕边界
        if (p.x < -10) p.x = cssW + 10;
        if (p.x > cssW + 10) p.x = -10;
        if (p.y < -10) p.y = cssH + 10;
        if (p.y > cssH + 10) p.y = -10;

        // 呼吸缩放（非线性相位）
        const breathe = 0.75 + 0.35 * Math.sin(t * 1.3 + p.phase + field(p.x, p.y, t));
        p.radius = p.baseR * breathe;
        p.opacity = p.baseOp * (0.7 + 0.3 * breathe);
      }

      // 连线（限制邻居扫描）
      const linkDist = 110;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]!;
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > linkDist * linkDist) continue;
          const d = Math.sqrt(d2);
          const a = (1 - d / linkDist) ** 1.6 * 0.22;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${p.color},${a})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }

      // 粒子本体 + 光晕
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
        g.addColorStop(0, `rgba(${p.color},${p.opacity})`);
        g.addColorStop(0.4, `rgba(${p.color},${p.opacity * 0.35})`);
        g.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${Math.min(1, p.opacity + 0.25)})`;
        ctx.fill();
      }

      // 鼠标光环
      if (mouse.active) {
        const rg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 90);
        rg.addColorStop(0, "rgba(66,133,244,0.12)");
        rg.addColorStop(1, "rgba(66,133,244,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 90, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduce) {
        animationRef.current = requestAnimationFrame(step);
      }
    }

    resize();
    last = performance.now();
    if (reduce) {
      step(last);
    } else {
      animationRef.current = requestAnimationFrame(step);
    }

    window.addEventListener("resize", resize);
    // 用 window 追踪鼠标，canvas 保持 pointer-events-none 不挡点击
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(animationRef.current);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden
    />
  );
}
