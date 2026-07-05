"use client";

import { useEffect, useRef } from "react";

type Particle = {
  baseAlpha: number;
  color: string;
  phase: number;
  r: number;
  speed: number;
  tier: "large" | "small";
  vy: number;
  wobbleAmp: number;
  x: number;
  y: number;
};

export function ParticleOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }

    let width = 0;
    let height = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);

    const smallColors = ["#2d4f3f", "#1a1a1a", "#7a7872"];
    const largeColors = ["#eae7e2", "#d5d0ca", "#ffffff"];
    const particles: Particle[] = [];

    for (let i = 0; i < 100; i += 1) {
      particles.push({
        baseAlpha: 0.2 + Math.random() * 0.4,
        color: smallColors[Math.floor(Math.random() * smallColors.length)],
        phase: Math.random() * Math.PI * 2,
        r: 0.8 + Math.random() * 1.5,
        speed: 0.0005 + Math.random() * 0.0015,
        tier: "small",
        vy: -(0.1 + Math.random() * 0.3),
        wobbleAmp: 0.3 + Math.random() * 1,
        x: Math.random() * (width || 800),
        y: Math.random() * (height || 600),
      });
    }

    for (let i = 0; i < 30; i += 1) {
      particles.push({
        baseAlpha: 0.05 + Math.random() * 0.15,
        color: largeColors[Math.floor(Math.random() * largeColors.length)],
        phase: Math.random() * Math.PI * 2,
        r: 8 + Math.random() * 16,
        speed: 0.0001 + Math.random() * 0.0004,
        tier: "large",
        vy: -(0.02 + Math.random() * 0.08),
        wobbleAmp: 0.8 + Math.random() * 2,
        x: Math.random() * (width || 800),
        y: Math.random() * (height || 600),
      });
    }

    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);

      const currentX = Math.sin(elapsed * 0.0001) * 0.3;

      for (const particle of particles) {
        particle.y += particle.vy;
        particle.x += Math.sin(elapsed * particle.speed + particle.phase) * particle.wobbleAmp + currentX;

        if (particle.y < -30) {
          particle.y = height + 30;
          particle.x = Math.random() * width;
        }

        if (particle.x < -30) {
          particle.x = width + 30;
        }

        if (particle.x > width + 30) {
          particle.x = -30;
        }

        const pulse = Math.sin(elapsed * particle.speed * 2 + particle.phase) * 0.5 + 0.5;

        if (particle.tier === "large") {
          const alpha = particle.baseAlpha * (0.8 + pulse * 0.2);
          const gradient = ctx.createRadialGradient(
            particle.x,
            particle.y,
            particle.r * 0.2,
            particle.x,
            particle.y,
            particle.r,
          );
          gradient.addColorStop(0, withAlpha(particle.color, alpha));
          gradient.addColorStop(0.4, withAlpha(particle.color, alpha * 0.5));
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = particle.baseAlpha * (0.5 + pulse * 0.5);
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10 block h-full w-full"
      aria-hidden="true"
    />
  );
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}
