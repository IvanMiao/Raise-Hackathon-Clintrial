import { useEffect, useRef } from "react";

/**
 * DNA Helix — a clean, editorial double helix.
 *
 * Two sine strands crossing vertically, connected by evenly spaced rungs.
 * Small filled dots (no blur) sit on each strand. A slow rotation phase
 * animates the crossings. A soft luminous band travels upward. Rare warm-gold
 * accents dot the strand. Everything reads as structure first, motion second.
 */

const FOREST = "#2D4F3F";
const CHARCOAL = "#1a1a1a";
const GOLD = "#b8956a";

export function DnaHelix() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement!;
    let W = 0;
    let H = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let raf = 0;
    const t0 = performance.now();

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let roTimer: number | null = null;
    const ro = new ResizeObserver(() => {
      if (roTimer) return;
      roTimer = window.setTimeout(() => {
        roTimer = null;
        resize();
      }, 60);
    });
    ro.observe(parent);

    const frame = (now: number) => {
      const t = (now - t0) / 1000;

      ctx.clearRect(0, 0, W, H);

      // Helix geometry
      const cx = W / 2;
      const topPad = H * 0.06;
      const botPad = H * 0.06;
      const helixH = H - topPad - botPad;
      const amp = Math.min(W * 0.32, 190); // strand horizontal amplitude
      const turns = 3.2; // vertical turns visible
      const phase = t * 0.55; // slow rotation

      const N = 220; // samples per strand
      const strandA: { x: number; y: number; z: number }[] = [];
      const strandB: { x: number; y: number; z: number }[] = [];

      for (let i = 0; i <= N; i++) {
        const u = i / N; // 0..1 top->bottom
        const y = topPad + u * helixH;
        const theta = u * Math.PI * 2 * turns + phase;
        const xa = cx + Math.sin(theta) * amp;
        const xb = cx + Math.sin(theta + Math.PI) * amp;
        const za = Math.cos(theta); // -1..1  (depth)
        const zb = Math.cos(theta + Math.PI);
        strandA.push({ x: xa, y, z: za });
        strandB.push({ x: xb, y, z: zb });
      }

      // Luminous band traveling upward
      const bandU = 1 - ((t * 0.14) % 1);
      const bandY = topPad + bandU * helixH;
      const bandRange = helixH * 0.22;

      // --- Rungs (draw before strand dots so dots sit on top) ---
      const RUNGS = 46;
      for (let i = 0; i < RUNGS; i++) {
        const u = i / (RUNGS - 1);
        const idx = Math.round(u * N);
        const a = strandA[idx];
        const b = strandB[idx];
        // Depth of the rung midpoint: fade rungs at the "back"
        const zMid = (a.z + b.z) / 2;
        const depth = (zMid + 1) / 2; // 0 back .. 1 front
        const near = Math.abs(a.y - bandY) / bandRange;
        const glow = Math.max(0, 1 - near);

        const baseAlpha = 0.08 + depth * 0.28;
        const alpha = Math.min(0.7, baseAlpha + glow * 0.35);

        ctx.strokeStyle = rgba(FOREST, alpha);
        ctx.lineWidth = 0.6 + depth * 0.7 + glow * 0.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // --- Strand dots ---
      const drawStrand = (strand: typeof strandA, tint: string) => {
        for (let i = 0; i <= N; i++) {
          const p = strand[i];
          const depth = (p.z + 1) / 2; // 0 back .. 1 front
          const near = Math.abs(p.y - bandY) / bandRange;
          const glow = Math.max(0, 1 - near);

          const r = 0.9 + depth * 2.0 + glow * 1.6;
          const alpha = 0.18 + depth * 0.62 + glow * 0.2;

          ctx.fillStyle = rgba(tint, Math.min(1, alpha));
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();

          // Rare gold accent
          if (i % 37 === 0 && glow > 0.15) {
            ctx.fillStyle = rgba(GOLD, 0.6 * glow);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      };

      drawStrand(strandA, CHARCOAL);
      drawStrand(strandB, FOREST);

      // --- Luminous band highlight (soft horizontal wash) ---
      const bandGrad = ctx.createRadialGradient(cx, bandY, 0, cx, bandY, amp * 1.6);
      bandGrad.addColorStop(0, rgba(FOREST, 0.10));
      bandGrad.addColorStop(1, rgba(FOREST, 0));
      ctx.fillStyle = bandGrad;
      ctx.beginPath();
      ctx.arc(cx, bandY, amp * 1.6, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (roTimer) window.clearTimeout(roTimer);
    };
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />;
}

function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
}
