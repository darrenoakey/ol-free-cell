// migrate.js — FreeCell's legacy Preferences shape → canonical OL history.
// Legacy keys are never deleted. The gathered blob is what core backs up.
(function (root) {
  'use strict';

  const APP = 'ol-free-cell';
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  function parseJSON(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /** Pure gather of the real legacy keys. `entries` is {key: rawString|object}. */
  function gatherFromMap(entries) {
    const completed = {};
    const progress = {};
    let stats = null;
    let settings = null;
    let sentinel = null;
    const raw = {};
    for (const [key, value] of Object.entries(entries || {})) {
      raw[key] = value;
      if (key === 'olfreecell.stats') stats = parseJSON(value);
      else if (key === 'olfreecell.settings') settings = parseJSON(value);
      else if (key === '__migrated') sentinel = value;
      else if (key.startsWith('olfreecell.completed.')) {
        const date = key.slice('olfreecell.completed.'.length);
        if (DATE.test(date)) completed[date] = parseJSON(value);
      } else if (key.startsWith('olfreecell.progress.')) {
        const date = key.slice('olfreecell.progress.'.length);
        if (DATE.test(date)) progress[date] = parseJSON(value);
      }
    }
    const hasLegacy = !!(stats || settings || Object.keys(completed).length || Object.keys(progress).length);
    return {
      hasLegacy,
      blob: { stats, settings, completed, progress, sentinel, raw },
    };
  }

  function legacyTotalsFrom(stats, wonDays) {
    if (!stats || typeof stats !== 'object') return null;
    const totals = {};
    const won = Number.isFinite(stats.won) ? stats.won : 0;
    const excess = Math.max(0, won - wonDays);
    if (wonDays === 0) {
      if (Number.isFinite(stats.won)) totals.solved = stats.won;
      if (Number.isFinite(stats.currentStreak)) totals.currentStreak = stats.currentStreak;
    } else if (excess > 0) {
      totals.solved = excess;
    }
    if (Number.isFinite(stats.bestStreak)) totals.bestStreak = stats.bestStreak;
    if (Number.isFinite(stats.played)) totals.played = stats.played;
    if (stats.lastWonDate) totals.lastWonDate = stats.lastWonDate;
    return Object.keys(totals).length ? totals : null;
  }

  function recordFromCompletion(date, day) {
    const solved = day.status === 'won';
    const rec = {
      schemaVersion: 1,
      gameId: APP,
      date,
      solved,
      extra: {},
    };
    if (Number.isFinite(day.elapsedMs)) rec.ms = day.elapsedMs;
    if (Number.isFinite(day.moves)) rec.moves = day.moves;
    if (Number.isFinite(day.hintsUsed)) rec.hints = day.hintsUsed;
    if (day.finishedAt != null) rec.extra.finishedAt = day.finishedAt;
    if (day.status) rec.extra.status = day.status;
    return rec;
  }

  /**
   * Registered with OL.History. `raw` is either canonical history or the
   * gathered legacy blob `{stats, settings, completed, progress}`.
   */
  function migrateFreeCell(raw) {
    const History = root.OL.History;
    if (raw == null) {
      return {
        doc: { schemaVersion: 1, gameId: APP, records: [], legacyTotals: null },
        from: 'empty',
      };
    }
    if (History.isCanonical(raw)) return { doc: raw, from: 'canonical' };
    const completed = raw.completed && typeof raw.completed === 'object' ? raw.completed : {};
    const records = [];
    for (const date of Object.keys(completed).sort()) {
      if (!DATE.test(date)) continue;
      const day = completed[date];
      if (!day || typeof day !== 'object' || Array.isArray(day)) continue;
      records.push(recordFromCompletion(date, day));
    }
    const wonDays = records.filter((rec) => rec.solved).length;
    return {
      doc: {
        schemaVersion: 1,
        gameId: APP,
        records,
        legacyTotals: legacyTotalsFrom(raw.stats, wonDays),
      },
      from: 'olfreecell-legacy',
    };
  }

  async function listStoreKeys() {
    const prefs = root.OL.Store.prefs();
    if (prefs && typeof prefs.keys === 'function') {
      const listed = await prefs.keys();
      return listed && listed.keys ? listed.keys : [];
    }
    if (!root.localStorage) return [];
    const keys = [];
    for (let i = 0; i < root.localStorage.length; i++) keys.push(root.localStorage.key(i));
    return keys;
  }

  /** Copy leftover localStorage into Preferences once. Keeps the __migrated sentinel. */
  async function absorbLocalStorage() {
    const cap = root.Capacitor;
    const prefs = cap && cap.Plugins && cap.Plugins.Preferences;
    if (!prefs) return;
    const migrated = await prefs.get({ key: '__migrated' });
    if (migrated && migrated.value) return;
    for (let i = 0; i < root.localStorage.length; i++) {
      const key = root.localStorage.key(i);
      // eslint-disable-next-line no-await-in-loop
      await prefs.set({ key, value: root.localStorage.getItem(key) });
    }
    await prefs.set({ key: '__migrated', value: 'true' });
  }

  async function gatherFromStore() {
    await absorbLocalStorage();
    const keys = await listStoreKeys();
    const entries = {};
    for (const key of keys) {
      if (!key) continue;
      if (key !== '__migrated' && !key.startsWith('olfreecell.')) continue;
      // eslint-disable-next-line no-await-in-loop
      entries[key] = await root.OL.Store.get(key);
    }
    return gatherFromMap(entries);
  }

  root.FreeCellMigrate = {
    APP,
    gatherFromMap,
    migrateFreeCell,
    gatherFromStore,
    absorbLocalStorage,
    legacyTotalsFrom,
  };
})(globalThis);
