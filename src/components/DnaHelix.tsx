import { useEffect, useRef } from "react";

/**
 * Particle DNA — thousands of ink-like particles form a double helix,
 * drift with subtle turbulence, and periodically dissolve + reform.
 * Palette: forest (#2D4F3F) + charcoal (#1a1a1a) on cream. No gradients on background.
 */
export function DnaHelix() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const parent = canvas.parentElement!;
    let width = 0;
    let height = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    // Palette
    const forest = { r: 45, g: 79, b: 63 };
    const charcoal = { r: 26, g: 26, b: 26 };
    const accent = { r: 168, g: 140, b: 90 }; // warm gold accent, very rare

    type P = {
      // target position along helix
      u: number;         // 0..1 along strand
      strand: 0 | 1;
      isRung: boolean;   // rung particle vs strand particle
      rungT: number;     // 0..1 across rung if isRung
      // color
      cr: number; cg: number; cb: number;
      size: number;
      // current position (for morph/drift)
      x: number; y: number;
      // per-particle drift phase
      ph: number;
      // dissipation offset (0 = on target, 1 = fully scattered)
      scatterX: number; scatterY: number;
      baseAlpha: number;
    };

    let particles: P[] = [];

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
      seed();
    };

    const seed = () => {
      particles = [];
      // Density scales with area, capped for perf
      const area = width * height;
      const target = Math.min(2600, Math.max(1400, Math.floor(area / 260)));

      // 70% strand particles, 30% rung particles
      const strandCount = Math.floor(target * 0.72);
      const rungCount = target - strandCount;

      const mkColor = () => {
        const r = Math.random();
        if (r < 0.02) return accent;
        if (r < 0.55) return forest;
        return charcoal;
      };

      for (let i = 0; i < strandCount; i++) {
        const u = Math.random();
        const strand: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        const c = mkColor();
        particles.push({
          u,
          strand,
          isRung: false,
          rungT: 0,
          cr: c.r, cg: c.g, cb: c.b,
          size: 0.55 + Math.random() * 1.15,
          x: Math.random() * width,
          y: Math.random() * height,
          ph: Math.random() * Math.PI * 2,
          scatterX: (Math.random() - 0.5) * width * 0.9,
          scatterY: (Math.random() - 0.5) * height * 0.9,
          baseAlpha: 0.55 + Math.random() * 0.4,
        });
      }
      for (let i = 0; i < rungCount; i++) {
        // Rungs concentrated at discrete u values for a laddered feel
        const rungIdx = Math.floor(Math.random() * 22);
        const u = rungIdx / 22 + (Math.random() - 0.5) * 0.008;
        const c = Math.random() < 0.7 ? { r: 190, g: 183, b: 172 } : mkColor();
        particles.push({
          u,
          strand: 0,
          isRung: true,
          rungT: Math.random(),
          cr: c.r, cg: c.g, cb: c.b,
          size: 0.45 + Math.random() * 0.85,
          x: Math.random() * width,
          y: Math.random() * height,
          ph: Math.random() * Math.PI * 2,
          scatterX: (Math.random() - 0.5) * width * 0.9,
          scatterY: (Math.random() - 0.5) * height * 0.9,
          baseAlpha: 0.35 + Math.random() * 0.35,
        });
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const start = performance.now();
    let raf = 0;

    // Dissipation cycle: helix is "formed" then briefly scatters and reforms
    // dissipation(t) in [0,1] — 0 = fully formed, 1 = fully scattered
    const dissipation = (tSec: number) => {
      const cycle = 9.5; // seconds
      const p = (tSec % cycle) / cycle;
      // Mostly formed, brief scatter around p≈0.5
      // Smooth pulse using two eased ramps
      const centered = Math.abs(p - 0.5) * 2; // 0 at middle, 1 at edges
      const scatter = Math.max(0, 1 - centered); // 0 edges, 1 middle
      // Ease
      const s = scatter * scatter * (3 - 2 * scatter);
      return s * 0.75; // cap so it never fully explodes
    };

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      // Trail effect: paint cream with low alpha for motion blur
      // Background is cream #f5f2ec area — use rgba to match
      ctx.fillStyle = "rgba(245, 242, 236, 0.22)";
      ctx.fillRect(0, 0, width, height);

      // Helix geometry
      const cx = width / 2;
      const topPad = Math.min(50, height * 0.05);
      const botPad = Math.min(50, height * 0.05);
      const yTop = topPad;
      const yBot = height - botPad;
      const helixH = yBot - yTop;
      const amplitude = Math.min(width * 0.3, 160);
      const turns = 3.1;
      const phase = t * 0.55;
      const float = Math.sin(t * 0.6) * 4;

      const diss = dissipation(t);

      // Traveling luminous band (0..1 along helix, moves upward)
      const bandPos = ((t * 0.14) % 1.2) - 0.1; // wraps with gap
      const bandWidth = 0.14;

      ctx.globalCompositeOperation = "source-over";

      for (const p of particles) {
        const u = p.u;
        const y = yTop + u * helixH + float;
        const theta = u * turns * Math.PI * 2 + phase;

        let tx: number, ty: number, depth: number;
        if (!p.isRung) {
          const off = p.strand === 0 ? 0 : Math.PI;
          tx = cx + Math.sin(theta + off) * amplitude;
          ty = y;
          depth = Math.cos(theta + off); // -1..1
        } else {
          const xA = cx + Math.sin(theta) * amplitude;
          const xB = cx + Math.sin(theta + Math.PI) * amplitude;
          tx = xA + (xB - xA) * p.rungT;
          ty = y;
          const dA = Math.cos(theta);
          const dB = Math.cos(theta + Math.PI);
          depth = dA + (dB - dA) * p.rungT;
        }

        // Per-particle turbulence drift
        const drift = 1.8;
        const dx = Math.sin(t * 0.9 + p.ph) * drift;
        const dy = Math.cos(t * 0.7 + p.ph * 1.3) * drift;

        // Apply dissipation: blend target with scattered position
        const targetX = tx + dx + p.scatterX * diss;
        const targetY = ty + dy + p.scatterY * diss;

        // Ease current toward target (soft morph)
        p.x += (targetX - p.x) * 0.12;
        p.y += (targetY - p.y) * 0.12;

        // Depth normalized 0..1 (1 = front)
        const depthN = (depth + 1) / 2;

        // Band highlight
        let bandBoost = 0;
        const du = Math.abs(u - bandPos);
        if (du < bandWidth) bandBoost = 1 - du / bandWidth;

        // Alpha attenuates when scattered
        const dissAlpha = 1 - diss * 0.45;
        const alpha = p.baseAlpha * (0.35 + depthN * 0.65) * dissAlpha;

        const size = p.size * (0.7 + depthN * 0.9) + bandBoost * 0.8;

        // Glow for front-facing / banded particles
        if (depthN > 0.82 || bandBoost > 0.35) {
          const glowR = size * (3 + bandBoost * 4);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
          const glowA = 0.14 * (depthN - 0.6) + bandBoost * 0.45;
          g.addColorStop(0, `rgba(${p.cr},${p.cg},${p.cb},${Math.max(0, glowA)})`);
          g.addColorStop(1, `rgba(${p.cr},${p.cg},${p.cb},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
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

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
