import { useEffect, useRef } from "react";

/**
 * Subtle light-shade particle drift over the DNA helix.
 * Tiny cream/ghost motes with gentle upward current and slow horizontal meander.
 * Designed to sit as an overlay — clinically quiet, never distracting.
 */
export function ParticleOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement!;
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
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const colors = ["#eae7e2", "#d5d0ca", "#f0ede9", "#c8d4cc", "#e8e5e0"];

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
      color: string;
      phase: number;
      speed: number;
      wobbleAmp: number;
    };

    const particles: Particle[] = [];
    const count = 55;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0,
        vy: -(0.15 + Math.random() * 0.35),
        r: 0.5 + Math.random() * 1.6,
        alpha: 0.12 + Math.random() * 0.22,
        color: colors[Math.floor(Math.random() * colors.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.0004 + Math.random() * 0.0012,
        wobbleAmp: 0.15 + Math.random() * 0.45,
      });
    }

    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.y += p.vy;
        p.x += Math.sin(t * p.speed + p.phase) * p.wobbleAmp;

        // Wrap vertically
        if (p.y < -8) {
          p.y = height + 8;
          p.x = Math.random() * width;
        }
        // Wrap horizontally
        if (p.x < -8) p.x = width + 8;
        if (p.x > width + 8) p.x = -8;

        // Soft radial gradient for each mote — cream dust in light
        const glow = p.r * 3.5;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
        g.addColorStop(0, withAlpha(p.color, p.alpha));
        g.addColorStop(1, withAlpha(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10 block h-full w-full"
      aria-hidden
    />
  );
}

function withAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
}
