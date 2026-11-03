// Steps for FreeCell daily rollover: deterministic per-day deal, 11:59:59
// local expiry with a bad-luck result, suspended dailies, solved-day
// protection, and DST-correct day boundaries.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { rootUrl } from '../support/world.js';

const TZ = 'Australia/Sydney';
const PROGRESS_PREFIX = 'olfreecell.progress.';
const HISTORY_KEY = 'ol-free-cell.history.v1';

/** Wall-clock `date time` in the browser's timezone (DST-correct). */
function zoned(date, time, tz = TZ) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  let t = want;
  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(t));
    const g = (k) => Number(parts.find((p) => p.type === k).value);
    t += want - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  }
  return new Date(t);
}

async function launch(page, date, time) {
  await page.clock.install({ time: zoned(date, time) });
  await page.goto(rootUrl, { waitUntil: 'networkidle' });
  await page.locator('#overlay-loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelectorAll('#tableau .card').length === 52, null, { timeout: 20_000 });
}

Given('the date is {string} at {string}', async function (date, time) {
  await launch(this.page, date, time);
});

When('I note the foundation start', async function () {
  this.noted = await this.page.evaluate(() => {
    const foundations = Array.from(document.querySelectorAll('.foundation'));
    const tops = foundations.map((el) => (el.querySelector('.slot-card') ? el.querySelector('.slot-card').getAttribute('aria-label') : ''));
    return JSON.stringify(tops);
  });
  // Foundations start empty (ghosts); the deal itself is the fingerprint.
  const layout = await this.page.evaluate(() => JSON.stringify(
    Array.from(document.querySelectorAll('#tableau .column')).map((col) =>
      Array.from(col.children).map((c) => c.getAttribute('aria-label')),
    ),
  ));
  assert.ok(layout.length > 2, 'tableau layout captured');
  this.notedLayout = layout;
});

When('I reload the app', async function () {
  await this.page.reload({ waitUntil: 'networkidle' });
  await this.page.locator('#overlay-loading').waitFor({ state: 'hidden' });
  await this.page.waitForFunction(() => document.querySelectorAll('#tableau .card').length === 52, null, { timeout: 20_000 });
});

Then('the daily deal is the same as before', async function () {
  const layout = await this.page.evaluate(() => JSON.stringify(
    Array.from(document.querySelectorAll('#tableau .column')).map((col) =>
      Array.from(col.children).map((c) => c.getAttribute('aria-label')),
    ),
  ));
  assert.equal(layout, this.notedLayout);
});

When('the clock passes midnight', async function () {
  // Jump to just past the next local midnight whatever the start time is.
  const target = await this.page.evaluate(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
    return next.getTime();
  });
  await this.page.clock.fastForward(target - (await this.page.evaluate(() => Date.now())));
  await this.page.evaluate(() => {
    document.dispatchEvent(new Event('resume'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await this.page.waitForTimeout(400);
});

When('the date becomes {string} at {string}', async function (date, time) {
  await this.page.clock.install({ time: zoned(date, time) });
});

Then('a bad luck toast is shown', async function () {
  await this.page.locator('#toast').waitFor({ state: 'visible', timeout: 10_000 });
  const text = await this.page.locator('#toast').textContent();
  assert.match(text, /bad luck/i);
});

Then('the table moves to the next day deal', async function () {
  await this.page.waitForFunction(() => document.querySelectorAll('#tableau .card').length === 52, null, { timeout: 20_000 });
  const label = await this.page.locator('#date-label').textContent();
  assert.match(label, /Today/);
});

Then('the table shows the current day deal', async function () {
  await this.page.waitForFunction(() => document.querySelectorAll('#tableau .card').length === 52, null, { timeout: 20_000 });
});

async function dayStatus(page, date) {
  return page.evaluate(([d, key]) => {
    const raw = localStorage.getItem(key);
    if (raw) {
      const doc = JSON.parse(raw);
      const rec = (doc.records || []).find((r) => r.date === d);
      if (rec) return rec.status || (rec.solved ? 'completed' : 'failed');
    }
    return null;
  }, [date, HISTORY_KEY]);
}

async function waitForDayStatus(page, date, expected) {
  await page.waitForFunction(([d, key, want]) => {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const doc = JSON.parse(raw);
        const rec = (doc.records || []).find((r) => r.date === d);
        if (rec) return (rec.status || (rec.solved ? 'completed' : 'failed')) === want;
      } catch { /* retry */ }
    }
    return false;
  }, [date, HISTORY_KEY, expected], { timeout: 10_000 });
}

Then('the stale progress is cleared', async function () {
  await this.page.waitForFunction(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('olfreecell.progress.'));
    const today = OL.Prng.dateKey();
    return keys.every((k) => k.endsWith(today));
  }, null, { timeout: 10_000 });
});

Then('the day {string} is recorded as failed', async function (date) {
  await waitForDayStatus(this.page, date, 'failed');
});

Then('the day {string} is recorded as solved', async function (date) {
  await waitForDayStatus(this.page, date, 'completed');
});

When('I leave the daily in progress with saved progress', async function () {
  await this.page.waitForFunction(() => window.App && window.App.game && window.App.game.status === 'playing', null, { timeout: 10_000 });
  await this.page.evaluate(async () => {
    const key = 'olfreecell.progress.' + OL.Prng.dateKey();
    await OL.Store.setJSON(key, {
      cascades: window.App.game.cascades,
      freecells: window.App.game.freecells,
      foundations: window.App.game.foundations,
      foundationTops: window.App.game.foundationTops,
      moves: window.App.game.moves,
      hintsUsed: window.App.game.hintsUsed,
      startedAt: window.App.game.startedAt,
      status: 'playing',
      undos: window.App.undos,
      restarts: window.App.restarts,
      review: window.App.game.reviewState ? window.App.game.reviewState() : undefined,
    });
  });
});

When('I have a solved record for {string} with unfinished progress', async function (date) {
  await this.page.evaluate((d) => {
    const HISTORY_KEY = 'ol-free-cell.history.v1';
    const PROGRESS_PREFIX = 'olfreecell.progress.';
    const doc = {
      schemaVersion: 1,
      gameId: 'ol-free-cell',
      records: [{
        schemaVersion: 1, gameId: 'ol-free-cell', date: d,
        solved: true, status: 'completed', ms: 120000, moves: 90,
      }],
      legacyTotals: null,
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify(doc));
    localStorage.setItem(PROGRESS_PREFIX + d, JSON.stringify({
      cascades: [], freecells: [null, null, null, null], foundations: [0, 0, 0, 0],
      foundationTops: [null, null, null, null], moves: 3, hintsUsed: 0,
      startedAt: Date.now(), status: 'playing', undos: 0, restarts: 0,
    }));
  }, date);
});
