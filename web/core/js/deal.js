// deal.js — OL.Deal. Every card game deals the same way: one card at a time.
//
//   const flights = OL.Deal.prepare(cards, { from: 'bottom', board, flip: 'flight' });
//   game.render(finalState);          // the app puts every card where it ends up
//   await OL.Deal.play(flights);      // ...and each one travels there in turn
//
// prepare() runs BEFORE the app renders: it stops the app's own transitions on
// those cards and remembers where each one is now (or, for a fresh deal, the
// middle of the bottom of the screen). play() runs AFTER: it measures where
// each card landed and flies it there from its start, one card after another.
//
// The flight uses the individual `translate` property, so it composes with however
// the app positions its cards (a transform, left/top). A flip squashes inside the
// card's own computed transform and is never left behind on the card.
//
// Faces: `flip` says when a card that ends face up turns over.
//   'source'  in place on its stack, then it travels face up (dealing from a stock)
//   'flight'  while it travels (dealing from the hidden deck at the bottom)
//   'land'    after it arrives
//   'none'    it shows its final face throughout
// A card that ends face down travels face down.
(function (root) {
  'use strict';

  const FLIGHT_CLASS = 'ol-in-flight';
  const DEFAULTS = { stagger: 90, flipMs: 170, flyMs: 320, maxTotal: 2600, minStagger: 22, ease: 'cubic-bezier(.2,.75,.25,1)' };
  const active = new Set();

  function reducedMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function centre(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /** The point a fresh deal comes from: the middle of the bottom edge of what can be seen of `board`. */
  function bottomCentre(board) {
    const r = board.getBoundingClientRect();
    const view = root.innerHeight || r.bottom;
    const bottom = Math.min(r.bottom, view);
    return { x: r.left + r.width / 2, y: bottom };
  }

  /**
   * Call before the app renders the new layout. `cards` are card elements (or
   * {el, from, flip} entries) in the order they are dealt. `opts.from` is
   * 'here' (each card's current spot, the default) or 'bottom' (needs
   * opts.board). Returns the flight list to hand to play().
   */
  function prepare(cards, opts = {}) {
    settle();
    const list = [];
    let origin = null;
    for (const item of cards) {
      const entry = item && item.nodeType === 1 ? { el: item } : { ...item };
      if (!entry.el) continue;
      const from = entry.from || opts.from || 'here';
      entry.flip = entry.flip || opts.flip || (from === 'bottom' ? 'flight' : 'source');
      const rect = entry.el.getBoundingClientRect();
      entry.startDown = entry.el.classList.contains('down');
      if (from === 'bottom') {
        if (!origin) origin = bottomCentre(opts.board || entry.el.offsetParent || document.body);
        // The card's top edge starts on the bottom edge, so it rises into view.
        entry.start = { x: origin.x, y: origin.y + rect.height / 2 };
        entry.startDown = true;
      } else if (from && typeof from === 'object' && 'x' in from) {
        entry.start = { x: from.x, y: from.y };
      } else {
        entry.start = centre(rect);
      }
      entry.el.classList.add(FLIGHT_CLASS);
      list.push(entry);
    }
    return list;
  }

  function setFace(el, up) {
    el.classList.toggle('up', up);
    el.classList.toggle('down', !up);
  }

  /** Run one step and leave its last frame on the card's inline style. */
  function anim(f, frames, duration, ease) {
    const el = f.el;
    const last = frames[frames.length - 1];
    // A flip animates `transform` on top of the app's own; it ends where it began, so it is never committed.
    const commit = () => { if (!f.done) for (const k of Object.keys(last)) if (k !== 'transform') el.style[k] = last[k]; };
    if (!el.animate || duration <= 0) { commit(); return Promise.resolve(); }
    const a = el.animate(frames, { duration, easing: ease || 'ease-in-out', fill: 'forwards' });
    f.anims.add(a);
    return a.finished.then(() => { commit(); a.cancel(); f.anims.delete(a); }, () => { f.anims.delete(a); });
  }

  /**
   * Squash frames for a flip. The squash goes INSIDE the card's own transform: the
   * individual `scale` property would also scale the app's translate and move the card.
   */
  function squash(f, from, to) {
    const base = getComputedStyle(f.el).transform;
    const b = base && base !== 'none' ? base + ' ' : '';
    return [{ transform: `${b}scaleX(${from})` }, { transform: `${b}scaleX(${to})` }];
  }

  function land(f) {
    if (f.done) return;
    f.done = true;
    for (const a of f.anims) a.cancel();
    f.anims.clear();
    f.el.style.translate = '';
    f.el.style.scale = '';
    f.el.style.zIndex = f.z;
    setFace(f.el, f.endUp);
    f.el.classList.remove(FLIGHT_CLASS);
    active.delete(f);
  }

  /**
   * Call after the app has rendered the new layout. Resolves when the last card
   * lands. Cards wait on their start spot (in deal order, next card on top) and
   * leave one at a time.
   */
  function play(flights, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const n = flights.length;
    if (!n) return Promise.resolve();
    const flipMs = o.flipMs;
    const leadIn = (f) => (f.flip === 'source' && f.endUp && f.startDown ? flipMs : 0);
    const span = Math.max(0, o.maxTotal - flipMs - o.flyMs);
    const stagger = n > 1 ? Math.max(o.minStagger, Math.min(o.stagger, span / (n - 1))) : 0;

    for (let i = 0; i < n; i++) {
      const f = flights[i];
      const el = f.el;
      f.endUp = el.classList.contains('up');
      f.z = el.style.zIndex;
      f.anims = new Set();
      f.done = false;
      el.classList.remove('flip');
      const end = centre(el.getBoundingClientRect());
      f.dx = f.start.x - end.x;
      f.dy = f.start.y - end.y;
      // Hold every card on its start spot, showing the face it starts with.
      el.style.translate = `${f.dx}px ${f.dy}px`;
      el.style.zIndex = String(2000 + n - i);
      setFace(el, f.endUp && !f.startDown);
      active.add(f);
    }

    if (reducedMotion()) {
      flights.forEach(land);
      return Promise.resolve();
    }

    const runs = flights.map((f, i) => new Promise((resolve) => setTimeout(resolve, i * stagger)).then(async () => {
      if (f.done) return;
      const el = f.el;
      const turn = f.endUp && f.startDown;
      if (turn && f.flip === 'source') {
        await anim(f, squash(f, 1, 0.04), flipMs / 2, 'ease-in');
        if (f.done) return;
        setFace(el, true);
        await anim(f, squash(f, 0.04, 1), flipMs / 2, 'ease-out');
        if (f.done) return;
      }
      // In the air the card rides above everything that has already landed.
      el.style.zIndex = String(3000 + i);
      const from = `${f.dx}px ${f.dy}px`;
      if (turn && f.flip === 'flight') {
        const half = o.flyMs / 2;
        const fly = anim(f, [{ translate: from }, { translate: '0px 0px' }], o.flyMs, o.ease);
        await anim(f, squash(f, 1, 0.04), half, 'ease-in');
        if (!f.done) setFace(el, true);
        await anim(f, squash(f, 0.04, 1), half, 'ease-out');
        await fly;
      } else {
        await anim(f, [{ translate: from }, { translate: '0px 0px' }], o.flyMs, o.ease);
      }
      if (f.done) return;
      if (turn && f.flip === 'land') {
        await anim(f, squash(f, 1, 0.04), flipMs / 2, 'ease-in');
        if (!f.done) setFace(el, true);
        await anim(f, squash(f, 0.04, 1), flipMs / 2, 'ease-out');
      }
      land(f);
    }));
    return Promise.all(runs).then(() => undefined);
  }

  /** Put every card still travelling on its final spot and face at once. */
  function settle() {
    for (const f of [...active]) land(f);
  }

  /** True while any dealt card is still travelling. */
  function busy() {
    return active.size > 0;
  }

  /** The time a deal of `count` cards takes, in ms, with these options. */
  function duration(count, options = {}) {
    const o = { ...DEFAULTS, ...options };
    if (!count) return 0;
    const span = Math.max(0, o.maxTotal - o.flipMs - o.flyMs);
    const stagger = count > 1 ? Math.max(o.minStagger, Math.min(o.stagger, span / (count - 1))) : 0;
    return (count - 1) * stagger + o.flipMs + o.flyMs;
  }

  root.OL = root.OL || {};
  root.OL.Deal = { prepare, play, settle, busy, duration, bottomCentre, DEFAULTS, FLIGHT_CLASS };
})(globalThis);
