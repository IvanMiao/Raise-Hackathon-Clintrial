import { useEffect, useRef } from "react";

export function MoleculeCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type Node = { x: number; y: number; vx: number; vy: number; r: number; phase: number };
    const NODE_COUNT = 42;
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: 1.5 + Math.random() * 3.5,
      phase: Math.random() * Math.PI * 2,
    }));

    type Particle = { x: number; y: number; vx: number; vy: number; life: number };
    const particles: Particle[] = [];

    const spawnParticle = () => {
      particles.push({
        x: Math.random() * width,
        y: height + 10,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -0.3 - Math.random() * 0.4,
        life: 0,
      });
    };

    const MAX_DIST = 130;
    let t = 0;

    const tick = () => {
      t += 0.008;
      ctx.clearRect(0, 0, width, height);

      // update nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      // lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < MAX_DIST) {
            const alpha = (1 - d / MAX_DIST) * 0.35 * (0.7 + 0.3 * Math.sin(t + i));
            ctx.strokeStyle = `rgba(94, 234, 212, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const n of nodes) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 2 + n.phase);
        const r = n.r * (0.9 + 0.2 * pulse);
        // glow
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
        g.addColorStop(0, `rgba(94, 234, 212, ${0.35 * pulse})`);
        g.addColorStop(1, "rgba(94, 234, 212, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(178, 245, 234, ${0.85 * pulse + 0.15})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // particles
      if (Math.random() < 0.08) spawnParticle();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        const alpha = Math.max(0, 1 - p.life / 300);
        ctx.fillStyle = `rgba(147, 197, 253, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
        if (p.y < -20 || alpha <= 0) particles.splice(i, 1);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="w-full h-full block" aria-hidden="true" />;
}
