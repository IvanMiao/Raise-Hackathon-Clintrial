import { useEffect, useRef } from "react";

/**
 * Editorial Depth-of-Field Particle Overlay
 * Tier 1: Small sharp forest-green/charcoal motes in focus.
 * Tier 2: Massive, ultra-blurred bokeh shapes in the deep background (cream/light gray).
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

    const smallColors = ["#2D4F3F", "#1a1a1a", "#7a7872"]; // Forest, Charcoal, Muted
    const largeColors = ["#eae7e2", "#d5d0ca", "#ffffff"]; // Creams and whites

    type Particle = {
      x: number;
      y: number;
      vy: number;
      r: number;
      baseAlpha: number;
      color: string;
      phase: number;
      speed: number;
      wobbleAmp: number;
      tier: "small" | "large";
    };

    const particles: Particle[] = [];
    const SMALL_COUNT = 100;
    const LARGE_COUNT = 30;

    // Small sharp foreground motes
    for (let i = 0; i < SMALL_COUNT; i++) {
      particles.push({
        x: Math.random() * (width || 800),
        y: Math.random() * (height || 600),
        vy: -(0.1 + Math.random() * 0.3),
        r: 0.8 + Math.random() * 1.5,
        baseAlpha: 0.2 + Math.random() * 0.4,
        color: smallColors[Math.floor(Math.random() * smallColors.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.0005 + Math.random() * 0.0015,
        wobbleAmp: 0.3 + Math.random() * 1.0,
        tier: "small",
      });
    }

    // Massive, blurred background bokeh dust
    for (let i = 0; i < LARGE_COUNT; i++) {
      particles.push({
        x: Math.random() * (width || 800),
        y: Math.random() * (height || 600),
        vy: -(0.02 + Math.random() * 0.08), // Much slower
        r: 8.0 + Math.random() * 16.0, // Massive radius for bokeh
        baseAlpha: 0.05 + Math.random() * 0.15, // Very faint
        color: largeColors[Math.floor(Math.random() * largeColors.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.0001 + Math.random() * 0.0004,
        wobbleAmp: 0.8 + Math.random() * 2.0,
        tier: "large",
      });
    }

    let raf = 0;
    const startT = performance.now();

    const draw = (now: number) => {
      const t = now - startT;
      ctx.clearRect(0, 0, width, height);

      const currentX = Math.sin(t * 0.0001) * 0.3;

      for (const p of particles) {
        p.y += p.vy;
        p.x += Math.sin(t * p.speed + p.phase) * p.wobbleAmp + currentX;

        if (p.y < -30) {
          p.y = height + 30;
          p.x = Math.random() * width;
        }
        if (p.x < -30) p.x = width + 30;
        if (p.x > width + 30) p.x = -30;

        const pulse = Math.sin(t * p.speed * 2 + p.phase) * 0.5 + 0.5;

        if (p.tier === "large") {
          // Deep background bokeh (blurred gradient)
          const alpha = p.baseAlpha * (0.8 + pulse * 0.2);
          const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r);
          g.addColorStop(0, withAlpha(p.color, alpha));
          g.addColorStop(0.4, withAlpha(p.color, alpha * 0.5));
          g.addColorStop(1, "rgba(255,255,255,0)");
          
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Sharp foreground motes
          ctx.globalAlpha = p.baseAlpha * (0.5 + pulse * 0.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
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
