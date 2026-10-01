// bridge.js — the app's existing Prng names, backed by OL.Prng.
(function (root) {
  'use strict';

  const P = root.OL.Prng;
  root.Prng = {
    mulberry32: P.mulberry32,
    hashSeed: P.hashSeed,
    todayDateString: P.dateKey,
    addDays: P.addDays,
  };
})(globalThis);
