// confetti.js — a gold-and-rose shower. Looks for a canvas#confetti.
(function (root) {
  'use strict';

  const COLORS = ['#e9c46a', '#fff3cc', '#f3dca0', '#ff7a93', '#b9a8ff', '#ffffff'];
  let raf = 0;

  function burst(count = 170) {
    const canvas = document.getElementById('confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = root.devicePixelRatio || 1;
    const W = root.innerWidth;
    const H = root.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const parts = [];
    for (let i = 0; i < count; i++) {
      const left = i % 2 === 0;
      parts.push({
        x: left ? -10 : W + 10,
        y: H * (0.55 + Math.random() * 0.2),
        vx: (left ? 1 : -1) * (4 + Math.random() * 6),
        vy: -9 - Math.random() * 8,
        size: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.35,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 0,
        max: 110 + Math.random() * 60,
        round: Math.random() < 0.3,
      });
    }
    cancelAnimationFrame(raf);
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of parts) {
        if (++p.life > p.max) continue;
        alive = true;
        p.vy += 0.24;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      raf = alive ? requestAnimationFrame(tick) : 0;
      if (!alive) ctx.clearRect(0, 0, W, H);
    };
    tick();
  }

  root.OL = root.OL || {};
  root.OL.Confetti = { burst };
})(globalThis);
