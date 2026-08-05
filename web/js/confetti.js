// confetti.js — a small canvas confetti burst for the win screen. No deps.
'use strict';

const Confetti = {
  _canvas: null,
  _ctx: null,
  _particles: [],
  _raf: null,

  _colors: ['#d4af37', '#f4e4a6', '#2e7d4f', '#ffffff', '#c94b4b'],

  burst(count) {
    this._canvas = document.getElementById('confetti-canvas');
    if (!this._canvas) return;
    this._ctx = this._canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = window.innerWidth * dpr;
    this._canvas.height = window.innerHeight * dpr;
    this._canvas.style.width = `${window.innerWidth}px`;
    this._canvas.style.height = `${window.innerHeight}px`;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._canvas.classList.remove('hidden');

    const n = count || 140;
    this._particles = [];
    for (let i = 0; i < n; i++) {
      this._particles.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 60,
        y: window.innerHeight * 0.3,
        vx: (Math.random() - 0.5) * 9,
        vy: -6 - Math.random() * 7,
        g: 0.22 + Math.random() * 0.08,
        size: 5 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        color: this._colors[(Math.random() * this._colors.length) | 0],
        life: 0,
        maxLife: 90 + Math.random() * 40,
      });
    }
    if (this._raf) cancelAnimationFrame(this._raf);
    this._tick();
  },

  _tick() {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of this._particles) {
      p.life++;
      if (p.life > p.maxLife) continue;
      alive = true;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      const fade = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    }
    if (alive) {
      this._raf = requestAnimationFrame(() => this._tick());
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      this._canvas.classList.add('hidden');
    }
  },
};
