import { useEffect, useRef } from "react";

/**
 * Evidence Threads — a trust graph that crystallizes.
 *
 * Four evidence nodes (Protocol, Contract, Visit Log, Payment History) drift with
 * gentle Verlet physics. Calligraphic threads grow between them like a scribe's
 * stroke. When the graph is fully woven, a fifth "Payment Cleared" node blooms
 * at the center. Loops on a slow rhythm.
 *
 * Editorial palette only: cream, forest #2D4F3F, charcoal, warm gray.
 */

type Vec = { x: number; y: number; px: number; py: number };
type NodeSpec = {
  label: string;
  sub: string;
  angle: number; // radians on the ring
  radius: number; // fraction of min(w,h)/2
  p: Vec;
};

const FOREST = "#2D4F3F";
const CHARCOAL = "#1a1a1a";
const WARM = "#b8b1a7";
const CREAM = "#F9F7F4";

export function EvidenceThreads() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement!;
    let W = 0;
    let H = 0;
    let cx = 0;
    let cy = 0;
    let ring = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    // Nodes on a ring — order chosen so opposite pairs create visually pleasing crossings.
    const nodes: NodeSpec[] = [
      { label: "Protocol",         sub: "study rules",     angle: -Math.PI / 2,               radius: 0.78, p: v() },
      { label: "Contract",         sub: "budgeted visits", angle: -Math.PI / 2 + Math.PI / 2, radius: 0.78, p: v() },
      { label: "Visit Log",        sub: "what happened",   angle: -Math.PI / 2 + Math.PI,     radius: 0.78, p: v() },
      { label: "Payment History",  sub: "what was paid",   angle: -Math.PI / 2 + 3 * Math.PI / 2, radius: 0.78, p: v() },
    ];

    function v(): Vec { return { x: 0, y: 0, px: 0, py: 0 }; }

    // Edge order — walks the ring then the two diagonals last (the "convergence" moment).
    const edgeOrder: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 2],
      [1, 3],
    ];

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cx = W / 2;
      cy = H / 2;
      ring = Math.min(W, H) * 0.5 - 40;

      // Seat each node at its rest position on the ring.
      for (const n of nodes) {
        const rx = cx + Math.cos(n.angle) * ring * n.radius * 0.9;
        const ry = cy + Math.sin(n.angle) * ring * n.radius * 0.9;
        n.p.x = rx;
        n.p.y = ry;
        n.p.px = rx;
        n.p.py = ry;
      }
    };

    // Rest length between two nodes based on their ring positions.
    const restLen = (a: NodeSpec, b: NodeSpec) => {
      const ax = Math.cos(a.angle) * ring * a.radius * 0.9;
      const ay = Math.sin(a.angle) * ring * a.radius * 0.9;
      const bx = Math.cos(b.angle) * ring * b.radius * 0.9;
      const by = Math.sin(b.angle) * ring * b.radius * 0.9;
      return Math.hypot(ax - bx, ay - by);
    };

    // Verlet step — nodes drift softly around their rest points, edges tether them.
    const step = (t: number) => {
      // Integrate with gentle noise "breath"
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const restX = cx + Math.cos(n.angle) * ring * n.radius * 0.9;
        const restY = cy + Math.sin(n.angle) * ring * n.radius * 0.9;
        // Ambient sway
        const swayX = Math.sin(t * 0.00035 + i * 1.7) * 4;
        const swayY = Math.cos(t * 0.00042 + i * 2.1) * 4;

        const vx = (n.p.x - n.p.px) * 0.96;
        const vy = (n.p.y - n.p.py) * 0.96;
        n.p.px = n.p.x;
        n.p.py = n.p.y;
        n.p.x += vx;
        n.p.y += vy;

        // Weak pull toward rest
        n.p.x += (restX + swayX - n.p.x) * 0.02;
        n.p.y += (restY + swayY - n.p.y) * 0.02;
      }

      // Edge constraints (only after threads have started forming — subtle influence)
      for (const [ia, ib] of edgeOrder) {
        const a = nodes[ia];
        const b = nodes[ib];
        const dx = b.p.x - a.p.x;
        const dy = b.p.y - a.p.y;
        const d = Math.hypot(dx, dy) || 1;
        const rl = restLen(a, b);
        const diff = (d - rl) / d;
        const k = 0.008; // gentle
        a.p.x += dx * diff * k;
        a.p.y += dy * diff * k;
        b.p.x -= dx * diff * k;
        b.p.y -= dy * diff * k;
      }
    };

    // Cubic bezier along the line between two points, control points offset toward center
    // (creates the calligraphic curve rather than a straight line).
    const drawThread = (a: NodeSpec, b: NodeSpec, progress: number, color: string) => {
      if (progress <= 0) return;
      const mx = (a.p.x + b.p.x) / 2;
      const my = (a.p.y + b.p.y) / 2;
      const towardCx = (cx - mx) * 0.25;
      const towardCy = (cy - my) * 0.25;
      const c1x = a.p.x + (mx - a.p.x) * 0.5 + towardCx;
      const c1y = a.p.y + (my - a.p.y) * 0.5 + towardCy;
      const c2x = b.p.x + (mx - b.p.x) * 0.5 + towardCx;
      const c2y = b.p.y + (my - b.p.y) * 0.5 + towardCy;

      // Sample the curve, draw up to `progress`
      const samples = 64;
      const endIdx = Math.max(1, Math.floor(samples * progress));
      ctx.beginPath();
      for (let i = 0; i <= endIdx; i++) {
        const t = i / samples;
        const omt = 1 - t;
        const x =
          omt * omt * omt * a.p.x +
          3 * omt * omt * t * c1x +
          3 * omt * t * t * c2x +
          t * t * t * b.p.x;
        const y =
          omt * omt * omt * a.p.y +
          3 * omt * omt * t * c1y +
          3 * omt * t * t * c2y +
          t * t * t * b.p.y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.stroke();

      // Ink tip — a small dot at the current writing head
      if (progress < 1) {
        const t = endIdx / samples;
        const omt = 1 - t;
        const x =
          omt * omt * omt * a.p.x +
          3 * omt * omt * t * c1x +
          3 * omt * t * t * c2x +
          t * t * t * b.p.x;
        const y =
          omt * omt * omt * a.p.y +
          3 * omt * omt * t * c1y +
          3 * omt * t * t * c2y +
          t * t * t * b.p.y;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawNode = (n: NodeSpec, appear: number, dim = false) => {
      if (appear <= 0) return;
      const r = 5 + appear * 1;
      // Halo
      const g = ctx.createRadialGradient(n.p.x, n.p.y, 0, n.p.x, n.p.y, 26);
      g.addColorStop(0, rgba(FOREST, 0.14 * appear));
      g.addColorStop(1, rgba(FOREST, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.p.x, n.p.y, 26, 0, Math.PI * 2);
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = rgba(FOREST, 0.9 * appear);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(n.p.x, n.p.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Inner dot
      ctx.fillStyle = rgba(FOREST, appear);
      ctx.beginPath();
      ctx.arc(n.p.x, n.p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Label — placement pushed outward from center
      const dx = n.p.x - cx;
      const dy = n.p.y - cy;
      const dlen = Math.hypot(dx, dy) || 1;
      const lx = n.p.x + (dx / dlen) * 18;
      const ly = n.p.y + (dy / dlen) * 18;

      const alignH: CanvasTextAlign =
        dx > 12 ? "left" : dx < -12 ? "right" : "center";
      const alignV: CanvasTextBaseline =
        dy > 12 ? "top" : dy < -12 ? "bottom" : "middle";

      ctx.textAlign = alignH;
      ctx.textBaseline = alignV;

      const labelAlpha = dim ? 0.35 * appear : appear;

      ctx.fillStyle = rgba(CHARCOAL, labelAlpha);
      ctx.font = "500 12px 'Inter', system-ui, sans-serif";
      // Small letterspaced label
      ctx.fillText(n.label.toUpperCase(), lx, ly);

      // Sub-label in serif italic
      const subOffset = alignV === "bottom" ? -14 : 14;
      ctx.fillStyle = rgba(WARM, 0.85 * labelAlpha);
      ctx.font = "italic 11px 'Cormorant Garamond', Georgia, serif";
      ctx.fillText(n.sub, lx, ly + subOffset);
    };

    const drawCenter = (progress: number) => {
      if (progress <= 0) return;
      // Bloom
      const bloomR = 60 * progress;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
      g.addColorStop(0, rgba(FOREST, 0.22 * progress));
      g.addColorStop(0.5, rgba(FOREST, 0.06 * progress));
      g.addColorStop(1, rgba(FOREST, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
      ctx.fill();

      // Solid disc
      const dr = 18 * Math.min(1, progress * 1.3);
      ctx.fillStyle = rgba(FOREST, progress);
      ctx.beginPath();
      ctx.arc(cx, cy, dr, 0, Math.PI * 2);
      ctx.fill();

      // Checkmark
      if (progress > 0.5) {
        const cp = (progress - 0.5) / 0.5;
        ctx.strokeStyle = rgba(CREAM, cp);
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy);
        ctx.lineTo(cx - 1.5, cy + 3.5);
        ctx.lineTo(cx + 5.5, cy - 4);
        ctx.stroke();
      }

      // Label
      if (progress > 0.6) {
        const lp = (progress - 0.6) / 0.4;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = rgba(CHARCOAL, lp);
        ctx.font = "500 11px 'Inter', system-ui, sans-serif";
        ctx.fillText("PAYMENT CLEARED", cx, cy + 34);

        ctx.fillStyle = rgba(WARM, 0.9 * lp);
        ctx.font = "italic 12px 'Cormorant Garamond', Georgia, serif";
        ctx.fillText("evidence reconciled", cx, cy + 50);
      }
    };

    // Sequencing — a slow, deliberate cycle:
    //   nodes fade in → threads draw one by one → center blooms → hold → dissolve → repeat
    const NODE_IN = 1600;         // stagger nodes over this window
    const THREAD_DUR = 900;       // per thread
    const THREAD_STAGGER = 500;   // gap between threads starting
    const HOLD = 3200;
    const DISSOLVE = 1800;

    const threadsStart = NODE_IN + 300;
    const threadsEnd = threadsStart + (edgeOrder.length - 1) * THREAD_STAGGER + THREAD_DUR;
    const centerStart = threadsEnd - 200;
    const centerEnd = centerStart + 900;
    const cycleTotal = centerEnd + HOLD + DISSOLVE;

    let raf = 0;
    const t0 = performance.now();

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const easeInOut = (x: number) =>
      x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

    const frame = (now: number) => {
      const t = now - t0;
      const cycleT = t % cycleTotal;

      step(t);

      ctx.clearRect(0, 0, W, H);

      // Dissolve envelope for the whole scene at end of cycle
      let sceneAlpha = 1;
      if (cycleT > centerEnd + HOLD) {
        const dp = (cycleT - centerEnd - HOLD) / DISSOLVE;
        sceneAlpha = 1 - easeInOut(Math.min(1, dp));
      }
      ctx.globalAlpha = sceneAlpha;

      // 1) Node appearance (staggered)
      const nodeAppears: number[] = nodes.map((_, i) => {
        const start = (NODE_IN / nodes.length) * i * 0.7;
        const dur = 700;
        const p = Math.max(0, Math.min(1, (cycleT - start) / dur));
        return easeOut(p);
      });

      // 2) Threads
      const threadProgress: number[] = edgeOrder.map((_, i) => {
        const start = threadsStart + i * THREAD_STAGGER;
        const p = Math.max(0, Math.min(1, (cycleT - start) / THREAD_DUR));
        return easeInOut(p);
      });

      // Draw threads first (behind nodes)
      edgeOrder.forEach(([ia, ib], i) => {
        // Diagonals (last two) render slightly bolder and in charcoal to feel like "convergence"
        const isDiagonal = i >= 4;
        const col = isDiagonal ? rgba(CHARCOAL, 0.55) : rgba(FOREST, 0.55);
        drawThread(nodes[ia], nodes[ib], threadProgress[i], col);
      });

      // 3) Nodes
      nodes.forEach((n, i) => drawNode(n, nodeAppears[i]));

      // 4) Center bloom
      const centerP = Math.max(0, Math.min(1, (cycleT - centerStart) / (centerEnd - centerStart)));
      drawCenter(easeOut(centerP));

      // 5) Subtle "ink still wet" tremor pass on final threads
      // (already handled by the Verlet integration on node positions.)

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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
