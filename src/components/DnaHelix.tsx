import { useEffect, useRef } from "react";

/**
 * High-End Editorial DNA Helix
 * "Spun Silk" rendering: extreme depth scaling, mouse parallax, and subtle fluid pulses.
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

    // Forest green & Charcoal (for the two strands)
    const strandColors = ["#2D4F3F", "#1a1a1a"];
    const STRANDS = strandColors.length;
    const rungColor = "#b8b1a7"; // Warm grey

    let phase = 0;
    let raf = 0;
    const start = performance.now();

    const pulses: { progress: number; speed: number }[] = [];
    let nextPulseAt = 1000;

    // Base tilt
    const baseTiltX = 0.18;
    const baseTiltZ = 0.05;
    
    // Mouse parallax state
    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetParallaxX = nx * 0.12; 
      targetParallaxY = ny * 0.12; 
    };
    window.addEventListener("mousemove", handleMouseMove);

    const ENTRANCE_DUR = 1800;

    const draw = (now: number) => {
      const t = now - start;
      
      // Smooth parallax interpolation
      currentParallaxX += (targetParallaxX - currentParallaxX) * 0.04;
      currentParallaxY += (targetParallaxY - currentParallaxY) * 0.04;

      const tiltX = baseTiltX - currentParallaxY;
      const tiltZ = baseTiltZ + currentParallaxX;
      
      const sinTx = Math.sin(tiltX);
      const cosTx = Math.cos(tiltX);
      const sinTz = Math.sin(tiltZ);
      const cosTz = Math.cos(tiltZ);

      ctx.clearRect(0, 0, width, height);

      const entranceAlpha = Math.min(1, t / ENTRANCE_DUR);
      ctx.globalAlpha = entranceAlpha;

      const cx = width / 2;
      const cy = height / 2;
      const topPad = Math.min(30, height * 0.03);
      const botPad = Math.min(30, height * 0.03);
      const helixH = height - topPad - botPad;
      const float = Math.sin(t * 0.0006) * 6;

      const radius = Math.min(width * 0.35, 210); // Slightly larger for dramatic effect
      const turns = 3.2; // Elegantly sweeping
      const segments = Math.max(140, Math.floor(helixH / 4));

      const focal = Math.max(500, height * 0.9);
      const camZ = focal + radius * 2.2;

      type Node = {
        sx: number; sy: number; scale: number; z: number;
        yWorld: number; strand: number; idx: number;
      };
      const nodes: Node[] = new Array((segments + 1) * STRANDS);

      const project = (x: number, y: number, z: number) => {
        const xrz = x * cosTz - y * sinTz;
        const yrz = x * sinTz + y * cosTz;
        const yr = yrz * cosTx - z * sinTx;
        const zr = yrz * sinTx + z * cosTx;
        const zc = camZ - zr;
        const s = focal / Math.max(1, zc);
        return { sx: cx + xrz * s, sy: cy + yr * s, scale: s * (focal / camZ), zr };
      };

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const yLocal = (u - 0.5) * helixH + float;
        const theta = u * turns * Math.PI * 2 + phase;

        for (let s = 0; s < STRANDS; s++) {
          const off = (s / STRANDS) * Math.PI * 2;
          const x = Math.cos(theta + off) * radius;
          const z = Math.sin(theta + off) * radius;
          const p = project(x, yLocal, z);
          nodes[i * STRANDS + s] = {
            sx: p.sx, sy: p.sy, scale: p.scale, z: p.zr,
            yWorld: yLocal, strand: s, idx: i,
          };
        }
      }

      type Item =
        | { kind: "seg"; z: number; p0: Node; p1: Node; color: string }
        | { kind: "rung"; z: number; a: Node; b: Node }
        | { kind: "node"; z: number; p: Node; color: string; pulseBoost: number; breathePhase: number };

      const items: Item[] = [];

      for (let s = 0; s < STRANDS; s++) {
        const color = strandColors[s];
        for (let i = 0; i < segments; i++) {
          const p0 = nodes[i * STRANDS + s];
          const p1 = nodes[(i + 1) * STRANDS + s];
          items.push({ kind: "seg", z: (p0.z + p1.z) / 2, p0, p1, color });
        }
      }

      const rungStep = 3;
      for (let i = 0; i <= segments; i += rungStep) {
        const a = nodes[i * STRANDS + 0];
        const b = nodes[i * STRANDS + 1];
        items.push({ kind: "rung", z: (a.z + b.z) / 2, a, b });
      }

      if (t > nextPulseAt) {
        pulses.push({ progress: -0.1, speed: 0.0007 + Math.random() * 0.0004 });
        nextPulseAt = t + 2500 + Math.random() * 1500;
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].progress += pulses[i].speed * 16;
        if (pulses[i].progress > 1.2) pulses.splice(i, 1);
      }
      const pulseYs = pulses.map((p) => (0.5 - p.progress) * helixH + float);

      for (let i = 0; i <= segments; i += rungStep) {
        for (let s = 0; s < STRANDS; s++) {
          const p = nodes[i * STRANDS + s];
          let pulseBoost = 0;
          for (const py of pulseYs) {
            const dy = Math.abs(p.yWorld - py);
            if (dy < 60) pulseBoost = Math.max(pulseBoost, 1 - dy / 60);
            else if (dy < 120) pulseBoost = Math.max(pulseBoost, (1 - dy / 120) * 0.4);
          }
          const breathePhase = Math.sin(t * 0.002 + i * 0.5 + s * 1.5) * 0.5 + 0.5;
          items.push({
            kind: "node", z: p.z, p, color: strandColors[s], pulseBoost, breathePhase,
          });
        }
      }

      items.sort((a, b) => a.z - b.z);

      const depthNorm = (z: number) => {
        const d = (z + radius) / (radius * 2);
        return Math.max(0, Math.min(1, d));
      };

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const it of items) {
        if (it.kind === "seg") {
          const d = depthNorm(it.z);
          // Extreme thickness scaling for Spun Silk look
          const w = (0.5 + d * 4.5) * ((it.p0.scale + it.p1.scale) / 2);
          const alpha = 0.05 + d * 0.95;
          
          ctx.strokeStyle = withAlpha(it.color, alpha);
          ctx.lineWidth = w;
          
          // Subtle elegant shadow to pop off the cream background
          ctx.shadowColor = "rgba(0,0,0,0.1)";
          ctx.shadowBlur = d * 8;
          ctx.shadowOffsetY = d * 2;
          
          ctx.beginPath();
          ctx.moveTo(it.p0.sx, it.p0.sy);
          ctx.lineTo(it.p1.sx, it.p1.sy);
          ctx.stroke();
          
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
        } else if (it.kind === "rung") {
          const d = depthNorm(it.z);
          const alpha = 0.05 + d * 0.4;
          // Very thin wireframe rungs
          ctx.strokeStyle = withAlpha(rungColor, alpha);
          ctx.lineWidth = (0.3 + d * 1.2) * ((it.a.scale + it.b.scale) / 2);
          ctx.beginPath();
          ctx.moveTo(it.a.sx, it.a.sy);
          ctx.lineTo(it.b.sx, it.b.sy);
          ctx.stroke();
        } else {
          const d = depthNorm(it.z);
          const alpha = 0.2 + d * 0.8;
          const breathe = 1 + it.breathePhase * 0.2;
          const r = (1.0 + d * 3.5) * it.p.scale * breathe;

          ctx.fillStyle = withAlpha(it.color, alpha);
          ctx.beginPath();
          ctx.arc(it.p.sx, it.p.sy, r, 0, Math.PI * 2);
          ctx.fill();

          if (it.pulseBoost > 0) {
            // Elegant fluid pulse (white core, subtle green halo)
            const glowR = r * (2 + it.pulseBoost * 3);
            const g = ctx.createRadialGradient(it.p.sx, it.p.sy, r, it.p.sx, it.p.sy, glowR);
            g.addColorStop(0, withAlpha(it.color, it.pulseBoost * 0.3 * alpha));
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(it.p.sx, it.p.sy, glowR, 0, Math.PI * 2);
            ctx.fill();

            // Liquid white core
            ctx.fillStyle = withAlpha("#ffffff", it.pulseBoost * 0.7);
            ctx.beginPath();
            ctx.arc(it.p.sx, it.p.sy, r * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.globalAlpha = 1;
      const baseSpeed = 0.004;
      const speedOsc = Math.sin(t * 0.0003) * 0.0025;
      phase += baseSpeed + speedOsc;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", handleMouseMove);
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
