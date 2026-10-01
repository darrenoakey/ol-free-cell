// prng.js — deterministic seeding and local-calendar date helpers.
(function (root) {
  'use strict';

  /** mulberry32 — small, well-distributed 32-bit PRNG; same seed, same sequence. */
  function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** djb2 string hash -> unsigned 32-bit int. */
  function hashSeed(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  /** A Date as YYYY-MM-DD in the device's local timezone. */
  function dateKey(d) {
    const date = d || new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Parse YYYY-MM-DD into a local-midnight Date. */
  function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** Add `days` (may be negative) to a YYYY-MM-DD key. */
  function addDays(key, days) {
    const dt = parseKey(key);
    dt.setDate(dt.getDate() + days);
    return dateKey(dt);
  }

  /** Whole local days from key a to key b (b - a). DST-safe via UTC dates. */
  function daysBetween(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }

  /** Monday-start week key (YYYY-MM-DD of that week's Monday). */
  function weekStart(key) {
    const dt = parseKey(key);
    const dow = (dt.getDay() + 6) % 7;
    return addDays(key, -dow);
  }

  root.OL = root.OL || {};
  root.OL.Prng = { mulberry32, hashSeed, dateKey, parseKey, addDays, daysBetween, weekStart };
})(globalThis);
