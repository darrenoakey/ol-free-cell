import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
for (const file of [
  'web/core/js/namespace.js',
  'web/core/js/prng.js',
  'web/js/bridge.js',
  'web/js/cards.js',
  'web/js/dealgen.js',
  'web/js/daily.js',
]) {
  vm.runInThisContext(readFileSync(join(root, file), 'utf8'), { filename: file });
}

const { FreeCellDaily, OL } = globalThis;
const DealGen = vm.runInThisContext('DealGen');
const ZONES = ['Australia/Sydney', 'America/New_York', 'UTC', 'Asia/Kolkata'];
const DST_DAYS = [
  ['Australia/Sydney', '2026-04-05'],
  ['Australia/Sydney', '2026-10-04'],
  ['America/New_York', '2026-03-08'],
  ['America/New_York', '2026-11-01'],
];

function inZone(zone, body) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return body();
  } finally {
    process.env.TZ = previous;
  }
}

test('the deal for a date is identical in every time zone', () => {
  const deals = ZONES.map((zone) => inZone(zone, () => JSON.stringify(DealGen.generateDeal('2026-11-04').deal)));
  assert.equal(new Set(deals).size, 1);
});

test('consecutive dates get different deals', () => {
  assert.notEqual(
    JSON.stringify(DealGen.generateDeal('2026-11-04').deal),
    JSON.stringify(DealGen.generateDeal('2026-11-05').deal),
  );
});

for (const [zone, date] of DST_DAYS) {
  test(`deadline is 23:59:59 local on the ${zone} DST change day ${date}`, () => {
    inZone(zone, () => {
      const at = new Date(FreeCellDaily.deadline(date));
      assert.equal(OL.Prng.dateKey(at), date);
      assert.deepEqual([at.getHours(), at.getMinutes(), at.getSeconds()], [23, 59, 59]);
      const next = new Date(at.getTime() + 1000);
      assert.equal(OL.Prng.dateKey(next), OL.Prng.addDays(date, 1));
    });
  });
}

test('only a completed record closes a day', () => {
  assert.equal(FreeCellDaily.isSolved({ solved: true, status: 'completed' }), true);
  assert.equal(FreeCellDaily.isSolved({ solved: true }), true);
  assert.equal(FreeCellDaily.isSolved({ solved: false, status: 'failed' }), false);
  assert.equal(FreeCellDaily.isSolved({ solved: false, status: 'attempted' }), false);
  assert.equal(FreeCellDaily.isSolved(null), false);
});

test('a daily counts as started only if it began on or before its deadline', () => {
  const date = '2026-11-04';
  const limit = FreeCellDaily.deadline(date);
  assert.equal(FreeCellDaily.startedInTime(date, { status: 'playing', startedAt: limit }), true);
  assert.equal(FreeCellDaily.startedInTime(date, { status: 'playing', startedAt: limit + 1 }), false);
  assert.equal(FreeCellDaily.startedInTime(date, { status: 'playing' }), true);
  assert.equal(FreeCellDaily.startedInTime(date, { status: 'won', startedAt: limit - 1000 }), false);
  assert.equal(FreeCellDaily.startedInTime(date, null), false);
});

test('a failure is a valid record timed at the deadline of its own day', () => {
  const date = '2026-11-04';
  const limit = FreeCellDaily.deadline(date);
  const rec = FreeCellDaily.failure(date, {
    startedAt: limit - 5000, moves: 12, hintsUsed: 2, undos: 3, restarts: 1,
  });
  assert.deepEqual(rec, {
    date,
    solved: false,
    status: 'failed',
    ms: 5000,
    moves: 12,
    hints: 2,
    undos: 3,
    restarts: 1,
    extra: { expired: true, finishedAt: limit },
  });
});

test('a failure with a missing or later start reports no negative time', () => {
  const date = '2026-11-04';
  const limit = FreeCellDaily.deadline(date);
  assert.equal(FreeCellDaily.failure(date, {}).ms, 0);
  assert.equal(FreeCellDaily.failure(date, { startedAt: limit + 9000 }).ms, 0);
});
