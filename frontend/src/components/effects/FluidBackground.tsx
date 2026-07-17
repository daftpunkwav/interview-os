"use client";

import { useEffect, useRef } from "react";

/** Google Blue 流体光晕背景（首页 Hero 用） */
export function FluidBackground({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let time = 0;
    let dpr = 1;

    function resize() {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();

    function noise(x: number, y: number, t: number): number {
      return (
        Math.sin(x * 0.01 + t) * Math.cos(y * 0.01 - t * 0.5) * 0.5 +
        Math.sin(x * 0.02 - t * 0.3) * Math.cos(y * 0.015 + t * 0.7) * 0.3 +
        Math.sin((x + y) * 0.008 + t * 0.2) * 0.2
      );
    }

    function animate() {
      if (!ctx || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // 主光晕 · Google Blue
      const gx = w * 0.28 + Math.sin(time * 0.45) * w * 0.08;
      const gy = h * 0.38 + Math.cos(time * 0.32) * h * 0.08;
      const g = ctx.createRadialGradient(gx, gy, 0, w * 0.5, h * 0.45, w * 0.85);
      g.addColorStop(0, `rgba(66, 133, 244, ${0.14 + noise(0, 0, time) * 0.05})`);
      g.addColorStop(0.45, `rgba(138, 180, 248, ${0.07 + noise(80, 40, time) * 0.03})`);
      g.addColorStop(1, "rgba(248, 250, 252, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 辅光 · 淡绿 / 淡红点缀（克制）
      const accents: [number, number, number, string][] = [
        [0.72, 0.25, 0.18, "66, 133, 244"],
        [0.55, 0.7, 0.12, "52, 168, 83"],
        [0.18, 0.65, 0.1, "234, 67, 53"],
        [0.8, 0.55, 0.09, "251, 188, 5"],
      ];

      for (let i = 0; i < accents.length; i++) {
        const [bx, by, alpha, rgb] = accents[i]!;
        const nx = w * bx + noise(i * 90, 10, time * 0.22) * w * 0.12;
        const ny = h * by + noise(20, i * 70, time * 0.18) * h * 0.12;
        const nr = Math.min(w, h) * (0.18 + noise(i * 40, i * 40, time) * 0.06);
        const blob = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        blob.addColorStop(0, `rgba(${rgb}, ${alpha + Math.sin(time + i) * 0.02})`);
        blob.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reducedMotion.current) {
        time += 0.01;
        animationRef.current = requestAnimationFrame(animate);
      }
    }

    window.addEventListener("resize", resize);
    animate();

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
