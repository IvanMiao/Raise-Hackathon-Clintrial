import { useEffect, useRef } from "react";

/**
 * Elegant DNA double helix — cream editorial aesthetic.
 * Two strands (forest + charcoal), warm-gray rungs, subtle depth via perspective,
 * periodic light pulse traveling upward, gentle float, faint ambient particles.
 */
export function DnaHelix() {
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

    // Colors
    const forest = "#2D4F3F";
    const charcoal = "#1a1a1a";
    const rungColor = "#d5d0ca";

    // Particles
    type P = { x: number; y: number; vy: number; r: number; a: number };
    const particles: P[] = [];
    const seedParticles = () => {
      particles.length = 0;
      const count = 18;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vy: 0.15 + Math.random() * 0.35,
          r: 0.6 + Math.random() * 1.2,
          a: 0.12 + Math.random() * 0.18,
        });
      }
    };
    seedParticles();

    let phase = 0;
    let raf = 0;
    const start = performance.now();

    // Pulses traveling upward (progress 0->1 along helix, bottom to top)
    const pulses: { progress: number; speed: number }[] = [];
    let nextPulseAt = 1500;

    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, width, height);

      // Helix geometry
      const cx = width / 2;
      const topPad = Math.min(60, height * 0.06);
      const botPad = Math.min(60, height * 0.06);
      const yTop = topPad;
      const yBot = height - botPad;
      const helixH = yBot - yTop;
      const float = Math.sin(t * 0.0006) * 3; // gentle drift

      const amplitude = Math.min(width * 0.28, 140);
      const turns = 3.2;
      const segments = Math.max(90, Math.floor(helixH / 5));

      // Build points for each strand
      type Node = {
        x: number;
        y: number;
        depth: number; // -1 (back) .. 1 (front)
        strand: 0 | 1;
        idx: number;
      };
      const nodes: Node[] = [];
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const y = yTop + u * helixH + float;
        const theta = u * turns * Math.PI * 2 + phase;
        // strand A
        const xA = cx + Math.sin(theta) * amplitude;
        const dA = Math.cos(theta);
        // strand B (opposite)
        const xB = cx + Math.sin(theta + Math.PI) * amplitude;
        const dB = Math.cos(theta + Math.PI);
        nodes.push({ x: xA, y, depth: dA, strand: 0, idx: i });
        nodes.push({ x: xB, y, depth: dB, strand: 1, idx: i });
      }

      // Draw rungs first (base pairs) every N segments — but sort by depth mid so overlap looks right
      const rungStep = 4;
      type Rung = { a: Node; b: Node; midDepth: number };
      const rungs: Rung[] = [];
      for (let i = 0; i <= segments; i += rungStep) {
        const a = nodes[i * 2];
        const b = nodes[i * 2 + 1];
        rungs.push({ a, b, midDepth: (a.depth + b.depth) / 2 });
      }

      // Draw strands as continuous polylines split by depth bands for layering
      // Simpler: draw back-half then front-half using per-segment depth
      const drawStrand = (strandIdx: 0 | 1, color: string, pass: "back" | "front") => {
        ctx.lineCap = "round";
        for (let i = 0; i < segments; i++) {
          const p0 = nodes[i * 2 + strandIdx];
          const p1 = nodes[(i + 1) * 2 + strandIdx];
          const d = (p0.depth + p1.depth) / 2;
          const isFront = d >= 0;
          if (pass === "back" && isFront) continue;
          if (pass === "front" && !isFront) continue;
          const depthN = (d + 1) / 2; // 0..1
          const w = 1.4 + depthN * 2.6;
          const alpha = 0.25 + depthN * 0.75;
          ctx.strokeStyle = withAlpha(color, alpha);
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      };

      // Rungs pass helper
      const drawRungs = (pass: "back" | "front") => {
        for (const r of rungs) {
          const isFront = r.midDepth >= 0;
          if (pass === "back" && isFront) continue;
          if (pass === "front" && !isFront) continue;
          const depthN = (r.midDepth + 1) / 2;
          const alpha = 0.15 + depthN * 0.45;
          ctx.strokeStyle = withAlpha(rungColor, alpha);
          ctx.lineWidth = 0.8 + depthN * 1.2;
          ctx.beginPath();
          ctx.moveTo(r.a.x, r.a.y);
          ctx.lineTo(r.b.x, r.b.y);
          ctx.stroke();
        }
      };

      // Nodes at rung connection points
      const drawNodes = (pass: "back" | "front", pulseYs: number[]) => {
        for (const r of rungs) {
          for (const p of [r.a, r.b]) {
            const isFront = p.depth >= 0;
            if (pass === "back" && isFront) continue;
            if (pass === "front" && !isFront) continue;
            const depthN = (p.depth + 1) / 2;
            const baseR = 1.4 + depthN * 2.6;
            const color = p.strand === 0 ? forest : charcoal;

            // Pulse boost: if near any pulse Y
            let pulseBoost = 0;
            for (const py of pulseYs) {
              const dy = Math.abs(p.y - py);
              if (dy < 40) pulseBoost = Math.max(pulseBoost, 1 - dy / 40);
            }

            // Glow when at front
            if (depthN > 0.75 || pulseBoost > 0.1) {
              const glowR = baseR * (3 + pulseBoost * 4);
              const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
              const glowAlpha = 0.18 * (depthN - 0.5) + pulseBoost * 0.55;
              g.addColorStop(0, withAlpha(color, Math.max(0, glowAlpha)));
              g.addColorStop(1, withAlpha(color, 0));
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.fillStyle = withAlpha(color, 0.35 + depthN * 0.65);
            ctx.beginPath();
            ctx.arc(p.x, p.y, baseR + pulseBoost * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      };

      // Ambient particles (behind)
      for (const p of particles) {
        p.y -= p.vy;
        if (p.y < -4) {
          p.y = height + 4;
          p.x = Math.random() * width;
        }
        ctx.fillStyle = withAlpha("#2D4F3F", p.a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update pulses
      if (t > nextPulseAt) {
        pulses.push({ progress: 0, speed: 0.00055 + Math.random() * 0.0003 });
        nextPulseAt = t + 3800 + Math.random() * 2200;
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].progress += pulses[i].speed * 16;
        if (pulses[i].progress > 1.1) pulses.splice(i, 1);
      }
      const pulseYs = pulses.map((p) => yBot - p.progress * helixH + float);

      // Layer: back rungs, back strands, front rungs, front strands, then nodes both passes
      drawRungs("back");
      drawStrand(0, forest, "back");
      drawStrand(1, charcoal, "back");
      drawNodes("back", pulseYs);

      drawRungs("front");
      drawStrand(0, forest, "front");
      drawStrand(1, charcoal, "front");
      drawNodes("front", pulseYs);

      phase += 0.006;
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

function withAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
}
