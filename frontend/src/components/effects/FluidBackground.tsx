"use client";

import { useEffect, useRef } from "react";

export function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx?.scale(dpr, dpr);
    }

    resize();

    // 流体噪声函数
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

      // 绘制流体渐变背景
      const gradient = ctx.createRadialGradient(
        w * 0.3 + Math.sin(time * 0.5) * w * 0.1,
        h * 0.4 + Math.cos(time * 0.3) * h * 0.1,
        0,
        w * 0.5,
        h * 0.5,
        w * 0.8
      );

      gradient.addColorStop(0, `rgba(92, 124, 250, ${0.08 + noise(0, 0, time) * 0.04})`);
      gradient.addColorStop(0.5, `rgba(145, 167, 255, ${0.04 + noise(100, 100, time) * 0.02})`);
      gradient.addColorStop(1, "rgba(240, 244, 255, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // 绘制流动光斑
      for (let i = 0; i < 5; i++) {
        const nx = w * 0.2 + noise(i * 100, 0, time * 0.2) * w * 0.6;
        const ny = h * 0.2 + noise(0, i * 100, time * 0.15) * h * 0.6;
        const nr = 80 + noise(i * 50, i * 50, time) * 40;

        const blobGradient = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        blobGradient.addColorStop(0, `rgba(76, 110, 245, ${0.06 + Math.sin(time + i) * 0.02})`);
        blobGradient.addColorStop(1, "rgba(76, 110, 245, 0)");

        ctx.fillStyle = blobGradient;
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fill();
      }

      time += 0.008;
      animationRef.current = requestAnimationFrame(animate);
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
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
