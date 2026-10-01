import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const core = join(root, 'web/core/js');
for (const file of ['namespace.js', 'prng.js', 'store.js', 'history.js', 'stats.js']) {
  await import(join(core, file));
}
await import(join(root, 'web/js/migrate.js'));

const { History, Stats } = globalThis.OL;
const { migrateFreeCell, gatherFromMap, APP } = globalThis.FreeCellMigrate;

History.registerMigrator(APP, migrateFreeCell);

const wonDay = {
  status: 'won',
  moves: 42,
  hintsUsed: 1,
  elapsedMs: 125000,
  finishedAt: 1_700_000_000_000,
};
const stuckDay = {
  status: 'stuck',
  moves: 80,
  hintsUsed: 3,
  elapsedMs: 400000,
  finishedAt: 1_700_000_100_000,
};

function fixtureEntries() {
  return {
    'olfreecell.stats': JSON.stringify({
      played: 4,
      won: 3,
      currentStreak: 2,
      bestStreak: 9,
      lastWonDate: '2026-03-02',
    }),
    'olfreecell.settings': JSON.stringify({ theme: 'midnight' }),
    'olfreecell.completed.2026-03-01': JSON.stringify(wonDay),
    'olfreecell.completed.2026-03-02': JSON.stringify(stuckDay),
    'olfreecell.progress.2026-03-03': JSON.stringify({ moves: 4, status: 'playing' }),
    __migrated: 'true',
  };
}

test('gatherFromMap reads the real legacy keys', () => {
  const gathered = gatherFromMap(fixtureEntries());
  assert.equal(gathered.hasLegacy, true);
  assert.equal(gathered.blob.settings.theme, 'midnight');
  assert.equal(gathered.blob.stats.bestStreak, 9);
  assert.equal(gathered.blob.completed['2026-03-02'].status, 'stuck');
  assert.equal(gathered.blob.progress['2026-03-03'].moves, 4);
  assert.equal(gathered.blob.sentinel, 'true');
});

test('stuck completions become solved:false and wins keep time and moves', () => {
  const gathered = gatherFromMap(fixtureEntries());
  const once = History.migrateData(APP, gathered.blob, null, null);
  const byDate = Object.fromEntries(once.doc.records.map((rec) => [rec.date, rec]));
  assert.equal(byDate['2026-03-01'].solved, true);
  assert.equal(byDate['2026-03-01'].ms, 125000);
  assert.equal(byDate['2026-03-01'].moves, 42);
  assert.equal(byDate['2026-03-01'].hints, 1);
  assert.equal(byDate['2026-03-02'].solved, false);
  assert.equal(byDate['2026-03-02'].moves, 80);
  assert.equal(once.doc.legacyTotals.bestStreak, 9);
  assert.equal(once.doc.legacyTotals.solved, 2);
  assert.equal(once.backup.stats.won, 3);
});

test('migration twice is identical and does not rewrite a completed marker', () => {
  const blob = gatherFromMap(fixtureEntries()).blob;
  const once = History.migrateData(APP, blob, null, null);
  const again = History.migrateData(APP, blob, null, null);
  assert.deepEqual(again.doc, once.doc);
  assert.deepEqual(again.backup, once.backup);
  const replay = History.migrateData(APP, once.doc, once.marker, once.backup);
  assert.equal(replay.wrote, false);
  assert.deepEqual(replay.doc.records, once.doc.records);
  assert.equal(replay.doc.legacyTotals.bestStreak, 9);
});

test('aggregate totals with no per-day records survive as legacyTotals', () => {
  const blob = gatherFromMap({
    'olfreecell.stats': JSON.stringify({
      played: 40,
      won: 30,
      currentStreak: 5,
      bestStreak: 12,
      lastWonDate: '2025-12-01',
    }),
  }).blob;
  const once = History.migrateData(APP, blob, null, null);
  const twice = History.migrateData(APP, once.doc, once.marker, once.backup);
  assert.equal(once.doc.records.length, 0);
  assert.equal(once.doc.legacyTotals.solved, 30);
  assert.equal(once.doc.legacyTotals.bestStreak, 12);
  assert.equal(once.doc.legacyTotals.currentStreak, 5);
  assert.deepEqual(twice.doc.legacyTotals, once.doc.legacyTotals);
  const stats = Stats.compute(once.doc, '2026-10-05');
  assert.equal(stats.total, 30);
  assert.equal(stats.bestStreak, 12);
  assert.equal(stats.currentStreak, 5);
});
