// prng.js — deterministic seeding: today's date -> a reproducible shuffle.
'use strict';

/**
 * mulberry32 — small, fast, well-distributed 32-bit PRNG.
 * Same seed always produces the same sequence of floats in [0, 1).
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** djb2 string hash -> unsigned 32-bit int, used to turn a date string into a seed. */
function hashSeed(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Today's date as YYYY-MM-DD in the device's local timezone. */
function todayDateString(d) {
  const date = d || new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add `days` (may be negative) to a YYYY-MM-DD string, returning a new YYYY-MM-DD string. */
function addDays(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayDateString(dt);
}

// eslint-disable-next-line no-unused-vars
const Prng = { mulberry32, hashSeed, todayDateString, addDays };
