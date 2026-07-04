import { useEffect, useRef } from "react";

/**
 * True 3D DNA double helix rendered on canvas.
 * Real (x, y, z) points → perspective projection → depth-sorted draw.
 * Slight X-axis tilt gives a proper 3D read; strands rotate around Y.
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

    // Multi-strand palette (4 strands = fuller, layered helix)
    const strandColors = ["#2D4F3F", "#1a1a1a", "#5c7a6a", "#3a3a3a"];
    const STRANDS = strandColors.length;
    const rungColor = "#d5d0ca";

    let phase = 0;
    let raf = 0;
    const start = performance.now();

    const pulses: { progress: number; speed: number }[] = [];
    let nextPulseAt = 1500;

    // Tilt around X axis (radians) — gentle so top/bottom read as farther/closer
    const tiltX = 0.35;
    const sinTx = Math.sin(tiltX);
    const cosTx = Math.cos(tiltX);

    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const topPad = Math.min(60, height * 0.06);
      const botPad = Math.min(60, height * 0.06);
      const helixH = height - topPad - botPad;
      const float = Math.sin(t * 0.0006) * 4;

      const radius = Math.min(width * 0.24, 120);
      const turns = 3.2;
      const segments = Math.max(120, Math.floor(helixH / 4));

      // Perspective
      const focal = Math.max(520, height * 0.9);
      const camZ = focal + radius * 2.2;

      type Node = {
        sx: number; sy: number;
        scale: number;
        z: number;
        yWorld: number;
        strand: number;
        idx: number;
      };
      const nodes: Node[] = new Array((segments + 1) * STRANDS);

      const project = (x: number, y: number, z: number) => {
        const yr = y * cosTx - z * sinTx;
        const zr = y * sinTx + z * cosTx;
        const zc = camZ - zr;
        const s = focal / Math.max(1, zc);
        return { sx: cx + x * s, sy: cy + yr * s, scale: s * (focal / camZ), zr };
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
        | { kind: "node"; z: number; p: Node; color: string; pulseBoost: number };

      const items: Item[] = [];

      // Strand segments (all strands)
      for (let s = 0; s < STRANDS; s++) {
        const color = strandColors[s];
        for (let i = 0; i < segments; i++) {
          const p0 = nodes[i * STRANDS + s];
          const p1 = nodes[(i + 1) * STRANDS + s];
          items.push({ kind: "seg", z: (p0.z + p1.z) / 2, p0, p1, color });
        }
      }

      // Rungs: connect adjacent strands around the ring (0-1, 1-2, ..., last-0)
      const rungStep = 4;
      for (let i = 0; i <= segments; i += rungStep) {
        for (let s = 0; s < STRANDS; s++) {
          const a = nodes[i * STRANDS + s];
          const b = nodes[i * STRANDS + ((s + 1) % STRANDS)];
          items.push({ kind: "rung", z: (a.z + b.z) / 2, a, b });
        }
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
      const pulseYs = pulses.map((p) => (0.5 - p.progress) * helixH + float);

      // Node markers at rung endpoints (all strands)
      for (let i = 0; i <= segments; i += rungStep) {
        for (let s = 0; s < STRANDS; s++) {
          const p = nodes[i * STRANDS + s];
          let pulseBoost = 0;
          for (const py of pulseYs) {
            const dy = Math.abs(p.yWorld - py);
            if (dy < 40) pulseBoost = Math.max(pulseBoost, 1 - dy / 40);
          }
          items.push({
            kind: "node",
            z: p.z,
            p,
            color: s === 0 ? forest : charcoal,
            pulseBoost,
          });
        }
      }

      // Sort back-to-front (smaller z = farther)
      items.sort((a, b) => a.z - b.z);

      // Depth helpers: map z to 0..1 (0 far, 1 near)
      const depthNorm = (z: number) => {
        const d = (z + radius) / (radius * 2); // -radius..+radius → 0..1
        return Math.max(0, Math.min(1, d));
      };

      ctx.lineCap = "round";

      for (const it of items) {
        if (it.kind === "seg") {
          const d = depthNorm(it.z);
          const w = (1.2 + d * 2.8) * ((it.p0.scale + it.p1.scale) / 2);
          const alpha = 0.22 + d * 0.78;
          ctx.strokeStyle = withAlpha(it.color, alpha);
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(it.p0.sx, it.p0.sy);
          ctx.lineTo(it.p1.sx, it.p1.sy);
          ctx.stroke();
        } else if (it.kind === "rung") {
          const d = depthNorm(it.z);
          const alpha = 0.14 + d * 0.42;
          ctx.strokeStyle = withAlpha(rungColor, alpha);
          ctx.lineWidth = (0.7 + d * 1.3) * ((it.a.scale + it.b.scale) / 2);
          ctx.beginPath();
          ctx.moveTo(it.a.sx, it.a.sy);
          ctx.lineTo(it.b.sx, it.b.sy);
          ctx.stroke();
        } else {
          const d = depthNorm(it.z);
          const baseR = (1.4 + d * 2.8) * it.p.scale;
          if (d > 0.7 || it.pulseBoost > 0.1) {
            const glowR = baseR * (3 + it.pulseBoost * 4);
            const g = ctx.createRadialGradient(it.p.sx, it.p.sy, 0, it.p.sx, it.p.sy, glowR);
            const glowAlpha = 0.2 * (d - 0.5) + it.pulseBoost * 0.55;
            g.addColorStop(0, withAlpha(it.color, Math.max(0, glowAlpha)));
            g.addColorStop(1, withAlpha(it.color, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(it.p.sx, it.p.sy, glowR, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = withAlpha(it.color, 0.35 + d * 0.65);
          ctx.beginPath();
          ctx.arc(it.p.sx, it.p.sy, baseR + it.pulseBoost * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

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
