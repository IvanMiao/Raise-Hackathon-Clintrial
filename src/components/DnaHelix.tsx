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

    const forest = "#2D4F3F";
    const charcoal = "#1a1a1a";
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
      const camZ = focal + radius * 2.2; // camera distance from origin along +Z

      type Node = {
        sx: number; sy: number; // screen
        scale: number;          // perspective scale (0..~1.3)
        z: number;              // world z after rotation (larger = closer)
        yWorld: number;         // for pulse hit-testing
        strand: 0 | 1;
        idx: number;
      };
      const nodes: Node[] = new Array(segments * 2 + 2);

      const project = (x: number, y: number, z: number) => {
        // rotate around X for tilt
        const yr = y * cosTx - z * sinTx;
        const zr = y * sinTx + z * cosTx;
        // camera looks down -Z; camZ in front
        const zc = camZ - zr;
        const s = focal / Math.max(1, zc);
        return { sx: cx + x * s, sy: cy + yr * s, scale: s * (focal / camZ) * 1.0, zr };
      };

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const yLocal = (u - 0.5) * helixH + float;
        const theta = u * turns * Math.PI * 2 + phase;

        // strand A
        const xA = Math.cos(theta) * radius;
        const zA = Math.sin(theta) * radius;
        const pA = project(xA, yLocal, zA);
        nodes[i * 2] = {
          sx: pA.sx, sy: pA.sy, scale: pA.scale, z: pA.zr,
          yWorld: yLocal, strand: 0, idx: i,
        };

        // strand B (opposite)
        const xB = Math.cos(theta + Math.PI) * radius;
        const zB = Math.sin(theta + Math.PI) * radius;
        const pB = project(xB, yLocal, zB);
        nodes[i * 2 + 1] = {
          sx: pB.sx, sy: pB.sy, scale: pB.scale, z: pB.zr,
          yWorld: yLocal, strand: 1, idx: i,
        };
      }

      // Build draw items with real z for sorting
      type Item =
        | { kind: "seg"; z: number; p0: Node; p1: Node; color: string }
        | { kind: "rung"; z: number; a: Node; b: Node }
        | { kind: "node"; z: number; p: Node; color: string; pulseBoost: number };

      const items: Item[] = [];

      // Strand segments
      for (let s = 0 as 0 | 1; s <= 1; s = (s + 1) as 0 | 1) {
        const color = s === 0 ? forest : charcoal;
        for (let i = 0; i < segments; i++) {
          const p0 = nodes[i * 2 + s];
          const p1 = nodes[(i + 1) * 2 + s];
          items.push({ kind: "seg", z: (p0.z + p1.z) / 2, p0, p1, color });
        }
        if (s === 1) break;
      }

      // Rungs every N
      const rungStep = 4;
      for (let i = 0; i <= segments; i += rungStep) {
        const a = nodes[i * 2];
        const b = nodes[i * 2 + 1];
        items.push({ kind: "rung", z: (a.z + b.z) / 2, a, b });
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

      // Node markers at rung endpoints
      for (let i = 0; i <= segments; i += rungStep) {
        for (const s of [0, 1] as const) {
          const p = nodes[i * 2 + s];
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
