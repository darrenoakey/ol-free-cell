// history.js — canonical daily records, validation, and the migration runner.
// Live key is `<app>.history.v1`. Spider's existing map at olspider.history.v1
// is readable as-is. Legacy keys are never deleted; the first migration copies
// the raw blob to `<app>.legacy-backup.v1`.
(function (root) {
  'use strict';

  const OL = root.OL = root.OL || {};
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const DAY_FIELDS = ['ms', 'moves', 'hints', 'restarts', 'undos', 'solvedAt', 'solved', 'score'];

  function key(appId) { return `${appId}.history.v1`; }
  function backupKey(appId) { return `${appId}.legacy-backup.v1`; }
  function markerKey(appId) { return `${appId}.migration.v1`; }

  function validate(record) {
    const errors = [];
    if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, errors: ['not an object'] };
    if (record.schemaVersion !== 1) errors.push('schemaVersion');
    if (typeof record.gameId !== 'string' || !record.gameId) errors.push('gameId');
    if (typeof record.date !== 'string' || !DATE.test(record.date)) errors.push('date');
    if (typeof record.solved !== 'boolean') errors.push('solved');
    for (const field of ['ms', 'moves', 'hints', 'restarts', 'undos', 'score']) {
      if (record[field] !== undefined && record[field] !== null && !Number.isFinite(record[field])) errors.push(field);
    }
    if (record.extra !== undefined && (record.extra === null || typeof record.extra !== 'object' || Array.isArray(record.extra))) {
      errors.push('extra');
    }
    return { ok: errors.length === 0, errors };
  }

  function isCanonical(raw) {
    return !!(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.schemaVersion === 1 && Array.isArray(raw.records));
  }

  function isLegacyMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion) return false;
    return Object.values(raw).every((v) => v && typeof v === 'object' && !Array.isArray(v));
  }

  function fromLegacyDay(appId, date, day) {
    const extra = {};
    if (day.solvedAt) extra.solvedAt = day.solvedAt;
    for (const k of Object.keys(day)) {
      if (!DAY_FIELDS.includes(k)) extra[k] = day[k];
    }
    const rec = {
      schemaVersion: 1,
      gameId: appId,
      date,
      solved: day.solved !== false,
      extra,
    };
    for (const field of ['ms', 'moves', 'hints', 'restarts', 'undos', 'score']) {
      if (day[field] !== undefined) rec[field] = day[field];
    }
    return rec;
  }

  function legacyMapToCanonical(appId, raw) {
    const records = Object.keys(raw).sort().map((date) => fromLegacyDay(appId, date, raw[date]));
    return {
      schemaVersion: 1,
      gameId: appId,
      records,
      legacyTotals: raw.legacyTotals || null,
    };
  }

  function normalize(raw, appId) {
    if (raw === null || raw === undefined || raw === '') {
      return { schemaVersion: 1, gameId: appId, records: [], legacyTotals: null, format: 'empty' };
    }
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (isCanonical(parsed)) {
      return {
        schemaVersion: 1,
        gameId: parsed.gameId || appId,
        records: parsed.records,
        legacyTotals: parsed.legacyTotals || null,
        format: 'canonical',
      };
    }
    if (isLegacyMap(parsed)) {
      return { ...legacyMapToCanonical(appId, parsed), format: 'legacy-map' };
    }
    const err = new Error(`unreadable history for ${appId}`);
    err.code = 'UNREADABLE';
    throw err;
  }

  const migrators = new Map();

  function registerMigrator(appId, fn) {
    migrators.set(appId, fn);
  }

  /** Spider-shaped map `{ 'YYYY-MM-DD': { ms, moves, ... } }` -> canonical records. */
  function legacyMapMigrator(appId) {
    return function migrate(raw) {
      if (isCanonical(raw)) return { doc: raw, from: 'canonical' };
      if (isLegacyMap(raw)) return { doc: legacyMapToCanonical(appId, raw), from: 'legacy-map' };
      throw new Error(`legacy-map migrator cannot read ${appId}`);
    };
  }

  function builtIn(appId, parsed) {
    if (parsed === null) return { doc: normalize(null, appId), from: 'empty' };
    if (isCanonical(parsed)) return { doc: parsed, from: 'canonical' };
    if (isLegacyMap(parsed)) return { doc: legacyMapToCanonical(appId, parsed), from: 'legacy-map' };
    throw new Error(`no migrator registered for ${appId}`);
  }

  /**
   * Pure, idempotent migration. `wrote` is false when the marker is already
   * complete. The backup is the original blob; an existing backup is kept.
   */
  function migrateData(appId, raw, existingMarker, existingBackup) {
    if (existingMarker && existingMarker.complete) {
      return { doc: normalize(raw, appId), backup: existingBackup ?? null, marker: existingMarker, wrote: false };
    }
    const parsed = raw === null || raw === undefined || raw === ''
      ? null
      : (typeof raw === 'string' ? JSON.parse(raw) : raw);
    const fn = migrators.get(appId);
    const result = fn ? (parsed === null ? builtIn(appId, null) : fn(parsed)) : builtIn(appId, parsed);
    const doc = {
      schemaVersion: 1,
      gameId: appId,
      records: result.doc.records || [],
      legacyTotals: result.doc.legacyTotals || null,
    };
    for (const rec of doc.records) {
      const verdict = validate(rec);
      if (!verdict.ok) throw new Error(`invalid record ${rec.date || '?'}: ${verdict.errors.join(',')}`);
    }
    const marker = { complete: true, schemaVersion: 1, from: result.from, appId };
    const backup = existingBackup != null ? existingBackup : parsed;
    return { doc, backup, marker, wrote: true };
  }

  /** Day map the Spider stats screen and calendar already understand. */
  function toDayMap(doc) {
    const map = {};
    const records = Array.isArray(doc) ? doc : (doc && doc.records) || [];
    for (const rec of records) {
      if (rec.solved === false) continue;
      map[rec.date] = {
        ms: rec.ms,
        moves: rec.moves,
        restarts: rec.restarts,
        undos: rec.undos,
        hints: rec.hints,
        solvedAt: rec.extra && rec.extra.solvedAt,
      };
    }
    return map;
  }

  async function load(appId) {
    return normalize(await OL.Store.get(key(appId)), appId);
  }

  async function save(appId, doc) {
    const payload = {
      schemaVersion: 1,
      gameId: appId,
      records: doc.records,
      legacyTotals: doc.legacyTotals || null,
    };
    await OL.Store.set(key(appId), JSON.stringify(payload));
    return payload;
  }

  async function migrate(appId) {
    const markerRaw = await OL.Store.get(markerKey(appId));
    const marker = markerRaw ? JSON.parse(markerRaw) : null;
    const raw = await OL.Store.get(key(appId));
    const backupRaw = await OL.Store.get(backupKey(appId));
    const existingBackup = backupRaw ? JSON.parse(backupRaw) : null;
    const result = migrateData(appId, raw, marker, existingBackup);
    if (result.wrote) {
      if (result.backup != null && existingBackup == null) {
        await OL.Store.set(backupKey(appId), JSON.stringify(result.backup));
      }
      await save(appId, result.doc);
      await OL.Store.set(markerKey(appId), JSON.stringify(result.marker));
    }
    return load(appId);
  }

  /** First solve for a date wins. Missing numeric fields are kept absent. */
  async function record(appId, partial) {
    await migrate(appId);
    const doc = await load(appId);
    const rec = {
      schemaVersion: 1,
      gameId: appId,
      date: partial.date,
      solved: partial.solved !== false,
      extra: partial.extra || {},
    };
    for (const field of ['ms', 'moves', 'hints', 'restarts', 'undos', 'score']) {
      if (partial[field] !== undefined) rec[field] = partial[field];
    }
    const verdict = validate(rec);
    if (!verdict.ok) throw new Error(`invalid record: ${verdict.errors.join(',')}`);
    if (!doc.records.some((row) => row.date === rec.date)) {
      doc.records.push(rec);
      doc.records.sort((a, b) => (a.date < b.date ? -1 : 1));
      await save(appId, doc);
    }
    return load(appId);
  }

  OL.History = {
    key, backupKey, markerKey, validate, normalize, isCanonical, isLegacyMap,
    legacyMapToCanonical, registerMigrator, legacyMapMigrator, migrateData,
    toDayMap, load, save, migrate, record,
  };
})(globalThis);
