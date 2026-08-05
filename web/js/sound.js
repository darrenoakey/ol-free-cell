// sound.js — tiny synthesized sound effects via WebAudio. No audio assets.
'use strict';

const Sound = {
  enabled: true,
  _ctx: null,

  _ensureCtx() {
    if (!this._ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this._ctx = new Ctx();
    }
    return this._ctx;
  },

  _tone(freq, startDelay, duration, type, gainPeak) {
    if (!this.enabled) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + startDelay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.12, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  },

  play() {
    this._tone(520, 0, 0.09, 'triangle');
  },
  draw() {
    this._tone(380, 0, 0.08, 'triangle');
  },
  reject() {
    this._tone(160, 0, 0.14, 'sawtooth', 0.08);
  },
  hint() {
    this._tone(700, 0, 0.08, 'sine');
    this._tone(900, 0.09, 0.1, 'sine');
  },
  undo() {
    this._tone(300, 0, 0.08, 'sine');
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i * 0.1, 0.28, 'triangle', 0.1));
  },
  stuck() {
    this._tone(220, 0, 0.2, 'sawtooth', 0.07);
    this._tone(180, 0.15, 0.25, 'sawtooth', 0.07);
  },
};
