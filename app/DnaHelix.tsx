"use client";

import { useEffect, useRef } from "react";

type HelixNode = {
  idx: number;
  scale: number;
  strand: number;
  sx: number;
  sy: number;
  yWorld: number;
  z: number;
};

type DrawItem =
  | { color: string; kind: "seg"; p0: HelixNode; p1: HelixNode; z: number }
  | { a: HelixNode; b: HelixNode; kind: "rung"; z: number }
  | {
      breathePhase: number;
      color: string;
      kind: "node";
      p: HelixNode;
      pulseBoost: number;
      z: number;
    };

export function DnaHelix() {
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

    const strandColors = ["#2d4f3f", "#1a1a1a"];
    const rungColor = "#b8b1a7";
    const strandCount = strandColors.length;
    const pulses: { progress: number; speed: number }[] = [];
    const start = performance.now();
    const entranceDuration = 1800;
    const baseTiltX = 0.18;
    const baseTiltZ = 0.05;

    let raf = 0;
    let phase = 0;
    let nextPulseAt = 1000;
    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      targetParallaxX = nx * 0.12;
      targetParallaxY = ny * 0.12;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    const projectPoint = (
      cx: number,
      cy: number,
      camZ: number,
      focal: number,
      cosTx: number,
      sinTx: number,
      cosTz: number,
      sinTz: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const xrz = x * cosTz - y * sinTz;
      const yrz = x * sinTz + y * cosTz;
      const yr = yrz * cosTx - z * sinTx;
      const zr = yrz * sinTx + z * cosTx;
      const zc = camZ - zr;
      const scale = focal / Math.max(1, zc);

      return {
        scale: scale * (focal / camZ),
        sx: cx + xrz * scale,
        sy: cy + yr * scale,
        zr,
      };
    };

    const draw = (now: number) => {
      const elapsed = now - start;
      currentParallaxX += (targetParallaxX - currentParallaxX) * 0.04;
      currentParallaxY += (targetParallaxY - currentParallaxY) * 0.04;

      const tiltX = baseTiltX - currentParallaxY;
      const tiltZ = baseTiltZ + currentParallaxX;
      const sinTx = Math.sin(tiltX);
      const cosTx = Math.cos(tiltX);
      const sinTz = Math.sin(tiltZ);
      const cosTz = Math.cos(tiltZ);

      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.min(1, elapsed / entranceDuration);

      const cx = width / 2;
      const cy = height / 2;
      const helixHeight = height - Math.min(30, height * 0.03) * 2;
      const float = Math.sin(elapsed * 0.0006) * 6;
      const radius = Math.min(width * 0.35, 210);
      const turns = 3.2;
      const segments = Math.max(140, Math.floor(helixHeight / 4));
      const focal = Math.max(500, height * 0.9);
      const camZ = focal + radius * 2.2;
      const nodes: HelixNode[] = new Array((segments + 1) * strandCount);

      for (let i = 0; i <= segments; i += 1) {
        const u = i / segments;
        const yLocal = (u - 0.5) * helixHeight + float;
        const theta = u * turns * Math.PI * 2 + phase;

        for (let strand = 0; strand < strandCount; strand += 1) {
          const offset = (strand / strandCount) * Math.PI * 2;
          const x = Math.cos(theta + offset) * radius;
          const z = Math.sin(theta + offset) * radius;
          const projected = projectPoint(
            cx,
            cy,
            camZ,
            focal,
            cosTx,
            sinTx,
            cosTz,
            sinTz,
            x,
            yLocal,
            z,
          );

          nodes[i * strandCount + strand] = {
            idx: i,
            scale: projected.scale,
            strand,
            sx: projected.sx,
            sy: projected.sy,
            yWorld: yLocal,
            z: projected.zr,
          };
        }
      }

      const items: DrawItem[] = [];

      for (let strand = 0; strand < strandCount; strand += 1) {
        const color = strandColors[strand];

        for (let i = 0; i < segments; i += 1) {
          const p0 = nodes[i * strandCount + strand];
          const p1 = nodes[(i + 1) * strandCount + strand];
          items.push({ color, kind: "seg", p0, p1, z: (p0.z + p1.z) / 2 });
        }
      }

      const rungStep = 3;
      for (let i = 0; i <= segments; i += rungStep) {
        const a = nodes[i * strandCount];
        const b = nodes[i * strandCount + 1];
        items.push({ a, b, kind: "rung", z: (a.z + b.z) / 2 });
      }

      if (elapsed > nextPulseAt) {
        pulses.push({ progress: -0.1, speed: 0.0007 + Math.random() * 0.0004 });
        nextPulseAt = elapsed + 2500 + Math.random() * 1500;
      }

      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        pulses[i].progress += pulses[i].speed * 16;

        if (pulses[i].progress > 1.2) {
          pulses.splice(i, 1);
        }
      }

      const pulseYs = pulses.map((pulse) => (0.5 - pulse.progress) * helixHeight + float);

      for (let i = 0; i <= segments; i += rungStep) {
        for (let strand = 0; strand < strandCount; strand += 1) {
          const point = nodes[i * strandCount + strand];
          let pulseBoost = 0;

          for (const pulseY of pulseYs) {
            const dy = Math.abs(point.yWorld - pulseY);

            if (dy < 60) {
              pulseBoost = Math.max(pulseBoost, 1 - dy / 60);
            } else if (dy < 120) {
              pulseBoost = Math.max(pulseBoost, (1 - dy / 120) * 0.4);
            }
          }

          items.push({
            breathePhase:
              Math.sin(elapsed * 0.002 + i * 0.5 + strand * 1.5) * 0.5 + 0.5,
            color: strandColors[strand],
            kind: "node",
            p: point,
            pulseBoost,
            z: point.z,
          });
        }
      }

      items.sort((a, b) => a.z - b.z);

      const depthNorm = (z: number) => {
        const depth = (z + radius) / (radius * 2);
        return Math.max(0, Math.min(1, depth));
      };

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const item of items) {
        if (item.kind === "seg") {
          const depth = depthNorm(item.z);
          const lineWidth = (0.5 + depth * 4.5) * ((item.p0.scale + item.p1.scale) / 2);

          ctx.strokeStyle = withAlpha(item.color, 0.05 + depth * 0.95);
          ctx.lineWidth = lineWidth;
          ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
          ctx.shadowBlur = depth * 8;
          ctx.shadowOffsetY = depth * 2;
          ctx.beginPath();
          ctx.moveTo(item.p0.sx, item.p0.sy);
          ctx.lineTo(item.p1.sx, item.p1.sy);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
        } else if (item.kind === "rung") {
          const depth = depthNorm(item.z);

          ctx.strokeStyle = withAlpha(rungColor, 0.05 + depth * 0.4);
          ctx.lineWidth = (0.3 + depth * 1.2) * ((item.a.scale + item.b.scale) / 2);
          ctx.beginPath();
          ctx.moveTo(item.a.sx, item.a.sy);
          ctx.lineTo(item.b.sx, item.b.sy);
          ctx.stroke();
        } else {
          const depth = depthNorm(item.z);
          const alpha = 0.2 + depth * 0.8;
          const breathe = 1 + item.breathePhase * 0.2;
          const radiusPx = (1 + depth * 3.5) * item.p.scale * breathe;

          ctx.fillStyle = withAlpha(item.color, alpha);
          ctx.beginPath();
          ctx.arc(item.p.sx, item.p.sy, radiusPx, 0, Math.PI * 2);
          ctx.fill();

          if (item.pulseBoost > 0) {
            const glowRadius = radiusPx * (2 + item.pulseBoost * 3);
            const gradient = ctx.createRadialGradient(
              item.p.sx,
              item.p.sy,
              radiusPx,
              item.p.sx,
              item.p.sy,
              glowRadius,
            );
            gradient.addColorStop(0, withAlpha(item.color, item.pulseBoost * 0.3 * alpha));
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(item.p.sx, item.p.sy, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = withAlpha("#ffffff", item.pulseBoost * 0.7);
            ctx.beginPath();
            ctx.arc(item.p.sx, item.p.sy, radiusPx * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.globalAlpha = 1;
      phase += 0.004 + Math.sin(elapsed * 0.0003) * 0.0025;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", handleMouseMove);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />;
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}
