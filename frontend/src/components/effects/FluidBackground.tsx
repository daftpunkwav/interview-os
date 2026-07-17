"use client";

import { useEffect, useRef } from "react";

/**
 * 非线性流体背景：多层 metaball + 简化 curl-noise 漂移。
 * 运动由多频噪声合成，非匀速圆周；尊重 reduced-motion。
 */
export function FluidBackground({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1;
    let w = 0;
    let h = 0;
    let t = 0;
    let last = performance.now();

    // 有机 blob 种子（相位 / 速度 / 半径比 各不相同 → 非线性相对运动）
    type Blob = {
      bx: number;
      by: number;
      baseR: number;
      rgb: string;
      a: number;
      // 多频轨道参数
      f1: number;
      f2: number;
      f3: number;
      p1: number;
      p2: number;
      p3: number;
      ampX: number;
      ampY: number;
      spin: number;
    };

    const blobs: Blob[] = [
      { bx: 0.22, by: 0.35, baseR: 0.42, rgb: "66,133,244", a: 0.22, f1: 0.31, f2: 0.47, f3: 0.19, p1: 0.2, p2: 1.1, p3: 2.4, ampX: 0.16, ampY: 0.14, spin: 0.4 },
      { bx: 0.72, by: 0.28, baseR: 0.36, rgb: "138,180,248", a: 0.16, f1: 0.27, f2: 0.53, f3: 0.23, p1: 1.7, p2: 0.4, p3: 3.1, ampX: 0.14, ampY: 0.18, spin: -0.35 },
      { bx: 0.55, by: 0.68, baseR: 0.34, rgb: "52,168,83", a: 0.11, f1: 0.41, f2: 0.29, f3: 0.37, p1: 2.2, p2: 2.8, p3: 0.6, ampX: 0.18, ampY: 0.12, spin: 0.28 },
      { bx: 0.18, by: 0.72, baseR: 0.28, rgb: "234,67,53", a: 0.09, f1: 0.35, f2: 0.61, f3: 0.21, p1: 3.5, p2: 1.4, p3: 0.9, ampX: 0.12, ampY: 0.16, spin: -0.42 },
      { bx: 0.82, by: 0.58, baseR: 0.3, rgb: "251,188,5", a: 0.1, f1: 0.23, f2: 0.39, f3: 0.51, p1: 0.8, p2: 3.2, p3: 1.6, ampX: 0.15, ampY: 0.13, spin: 0.33 },
      { bx: 0.42, by: 0.42, baseR: 0.48, rgb: "26,115,232", a: 0.1, f1: 0.19, f2: 0.33, f3: 0.45, p1: 1.2, p2: 2.1, p3: 2.9, ampX: 0.1, ampY: 0.1, spin: 0.2 },
    ];

    /** 简易 2D value-noise 风格场（光滑非线性） */
    function field(x: number, y: number, tt: number): number {
      return (
        Math.sin(x * 1.7 + tt * 0.9) * Math.cos(y * 1.3 - tt * 0.6) * 0.45 +
        Math.sin(x * 2.9 - y * 1.1 + tt * 1.2) * 0.28 +
        Math.cos((x + y) * 2.1 - tt * 0.7) * 0.18 +
        Math.sin(x * 4.1 + y * 3.3 + tt * 0.35) * 0.09
      );
    }

    /** 近似 curl：得到不可压缩感的切向漂移 */
    function curl(x: number, y: number, tt: number): { u: number; v: number } {
      const e = 0.02;
      const dFdx = (field(x + e, y, tt) - field(x - e, y, tt)) / (2 * e);
      const dFdy = (field(x, y + e, tt) - field(x, y - e, tt)) / (2 * e);
      return { u: dFdy, v: -dFdx };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function easeInOutSine(x: number) {
      return -(Math.cos(Math.PI * x) - 1) / 2;
    }

    function blobPos(b: Blob, tt: number) {
      // 非匀速：用 ease 扭曲相位，再叠加 curl 与高次谐波
      const ph = easeInOutSine((Math.sin(tt * b.f1 + b.p1) + 1) / 2);
      const ox =
        Math.sin(tt * b.f1 + b.p1) * b.ampX +
        Math.sin(tt * b.f2 + b.p2) * b.ampX * 0.45 +
        Math.cos(tt * b.f3 + b.p3) * b.ampX * 0.22;
      const oy =
        Math.cos(tt * b.f1 * 0.9 + b.p2) * b.ampY +
        Math.sin(tt * b.f2 * 1.1 + b.p3) * b.ampY * 0.4 +
        Math.cos(tt * b.f3 * 0.7 + b.p1) * b.ampY * 0.25;

      const nx = b.bx + ox * (0.7 + ph * 0.5);
      const ny = b.by + oy * (0.7 + (1 - ph) * 0.5);
      const c = curl(nx * 2, ny * 2, tt * 0.35);
      return {
        x: (nx + c.u * 0.04) * w,
        y: (ny + c.v * 0.04) * h,
        r:
          Math.min(w, h) *
          b.baseR *
          (0.85 + 0.2 * Math.sin(tt * b.spin + b.p1) + 0.08 * field(nx, ny, tt)),
      };
    }

    function drawFrame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) t += dt;

      ctx.clearRect(0, 0, w, h);

      // 底层柔光底
      const base = ctx.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, "rgba(232,240,254,0.55)");
      base.addColorStop(0.5, "rgba(248,250,252,0.2)");
      base.addColorStop(1, "rgba(230,244,234,0.35)");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i]!;
        const { x, y, r } = blobPos(b, t);
        // 有机形变：椭圆 + 旋转（非线性角速度）
        const rot = t * b.spin + b.p2 + field(b.bx, b.by, t) * 0.8;
        const sx = 1 + 0.18 * Math.sin(t * b.f2 + b.p3);
        const sy = 1 + 0.18 * Math.cos(t * b.f1 + b.p1);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(sx, sy);

        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        const pulse = 0.85 + 0.15 * Math.sin(t * (0.6 + b.f1) + b.p1);
        g.addColorStop(0, `rgba(${b.rgb},${b.a * pulse})`);
        g.addColorStop(0.35, `rgba(${b.rgb},${b.a * 0.45 * pulse})`);
        g.addColorStop(0.7, `rgba(${b.rgb},${b.a * 0.12})`);
        g.addColorStop(1, `rgba(${b.rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.globalCompositeOperation = "source-over";

      // 细丝流线：沿 curl 场采样短路径
      if (!reduce) {
        ctx.lineWidth = 1;
        for (let s = 0; s < 14; s++) {
          let px = ((s * 97 + t * 30) % 100) / 100;
          let py = ((s * 53 + 17) % 100) / 100;
          ctx.beginPath();
          for (let k = 0; k < 28; k++) {
            const c = curl(px * 3, py * 3, t * 0.5 + s);
            const x = px * w;
            const y = py * h;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            px += c.u * 0.012;
            py += c.v * 0.012;
            if (px < 0 || px > 1 || py < 0 || py > 1) break;
          }
          const alpha = 0.04 + 0.03 * Math.sin(t + s);
          ctx.strokeStyle = `rgba(66,133,244,${alpha})`;
          ctx.stroke();
        }
      }

      if (!reduce) {
        animationRef.current = requestAnimationFrame(drawFrame);
      }
    }

    resize();
    last = performance.now();
    if (reduce) {
      drawFrame(last);
    } else {
      animationRef.current = requestAnimationFrame(drawFrame);
    }

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden
    />
  );
}
