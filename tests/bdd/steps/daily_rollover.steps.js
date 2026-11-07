// Steps for FreeCell daily rollover: deterministic per-day deal, 11:59:59
// local expiry with a bad-luck result, suspended dailies, solved-day
// protection, and DST-correct day boundaries.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DEFAULT_TIME_ZONE, VIEWPORT, rootUrl } from '../support/world.js';

const HISTORY_KEY = 'ol-free-cell.history.v1';

/** The instant a wall clock in `tz` shows `date time` (DST-correct). */
function zoned(date, time, tz) {
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

function zone(world) {
  return world.timeZone || DEFAULT_TIME_ZONE;
}

/** The live game is on the table: a started game has cards off the tableau. */
async function boardReady(page) {
  await page.locator('#overlay-loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.App && App.game && !OL.Deal.busy()
    && document.querySelectorAll('#tableau .card').length === App.game.cascades.flat().length, null, { timeout: 20_000 });
}

function tableauLayout(page) {
  return page.evaluate(() => JSON.stringify(
    Array.from(document.querySelectorAll('#tableau .column')).map((col) =>
      Array.from(col.children).map((c) => c.getAttribute('aria-label')),
    ),
  ));
}

/** Keeps every toast the page shows: each one is on screen for only 1.8s. */
function recordToasts() {
  window.toastLog = [];
  document.addEventListener('DOMContentLoaded', () => {
    const toast = document.getElementById('toast');
    new MutationObserver(() => {
      if (toast.classList.contains('show')) window.toastLog.push(toast.textContent);
    }).observe(toast, { attributes: true, attributeFilter: ['class'], childList: true });
  });
}

async function launch(world, date, time) {
  await world.context.addInitScript(recordToasts);
  await world.page.clock.install({ time: zoned(date, time, zone(world)) });
  await world.page.goto(rootUrl, { waitUntil: 'networkidle' });
  await boardReady(world.page);
}

Given('the device time zone is {string}', async function (timeZone) {
  await this.context.close();
  this.timeZone = timeZone;
  this.context = await this.browser.newContext({ viewport: VIEWPORT, timezoneId: timeZone });
  this.page = await this.context.newPage();
});

Given('the date is {string} at {string}', async function (date, time) {
  await launch(this, date, time);
});

When('I note the foundation start', async function () {
  const layout = await tableauLayout(this.page);
  assert.ok(layout.length > 2, 'tableau layout captured');
  this.notedLayout = layout;
});

When('I reload the app', async function () {
  await this.page.reload({ waitUntil: 'networkidle' });
  await boardReady(this.page);
});

Then('the daily deal is the same as before', async function () {
  assert.equal(await tableauLayout(this.page), this.notedLayout);
});

Then('the daily deal differs from before', async function () {
  assert.ok(this.notedLayout, 'a deal was noted earlier in the scenario');
  assert.notEqual(await tableauLayout(this.page), this.notedLayout);
});

// Fast-forward only: the armed midnight timer has to do the work by itself.
When('the clock passes midnight', async function () {
  const remaining = await this.page.evaluate(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30).getTime() - now.getTime();
  });
  await this.page.clock.fastForward(remaining);
});

When('the wall clock reaches {string} at {string}', async function (date, time) {
  const target = zoned(date, time, zone(this)).getTime();
  const now = await this.page.evaluate(() => Date.now());
  await this.page.clock.fastForward(target - now);
});

When('the date becomes {string} at {string}', async function (date, time) {
  await this.page.clock.install({ time: zoned(date, time, zone(this)) });
});

// A suspended process fires no timers: only the wall clock moves.
When('the device was suspended until {string} at {string}', async function (date, time) {
  await this.page.clock.setSystemTime(zoned(date, time, zone(this)));
});

When('the page becomes visible', async function () {
  await this.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
});

// The event Capacitor's bridge fires on the document when iOS foregrounds the app.
When('Capacitor resumes the app', async function () {
  await this.page.evaluate(() => document.dispatchEvent(new Event('resume')));
});

Then('a bad luck toast is shown', async function () {
  await this.page.waitForFunction(() => window.toastLog.some((text) => /bad luck/i.test(text)), null, { timeout: 10_000 });
});

Then('no bad luck toast is shown', async function () {
  await boardReady(this.page);
  // The notice follows the deal-in, so give it a moment to appear if it is coming.
  await this.page.waitForTimeout(300);
  const toasts = await this.page.evaluate(() => window.toastLog);
  assert.deepEqual(toasts.filter((text) => /bad luck/i.test(text)), []);
});

/** The live game is the untouched proven deal for `date`, on screen and in state. */
async function assertFreshDeal(page, date) {
  await page.waitForFunction((d) => window.App && App.context.date === d && App.game
    && App.game.seedString === d && !OL.Deal.busy(), date, { timeout: 20_000 });
  await boardReady(page);
  const state = await page.evaluate((d) => {
    const ids = (game) => JSON.stringify(game.cascades.map((col) => col.map((card) => card.id)));
    return {
      live: ids(App.game),
      proven: ids(new Game.FreeCellGame(DealGen.generateDeal(d))),
      moves: App.game.moves,
      shownMoves: document.querySelector('#moves-value').textContent,
      status: App.game.status,
    };
  }, date);
  assert.equal(state.live, state.proven, `board is the deal for ${date}`);
  assert.equal(state.moves, 0);
  assert.equal(state.shownMoves, '0');
  assert.equal(state.status, 'playing');
}

Then('the table shows a fresh deal for {string}', async function (date) {
  await assertFreshDeal(this.page, date);
});

Then('the table is still the daily for {string}', async function (date) {
  const state = await this.page.evaluate(() => ({ date: App.context.date, moves: App.game.moves }));
  assert.equal(state.date, date);
  assert.ok(state.moves > 0, 'the started game is still on the table');
});

async function dayRecord(page, date) {
  return page.evaluate(([d, key]) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw).records || []).find((r) => r.date === d) || null;
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
  await boardReady(this.page);
  const rec = await dayRecord(this.page, date);
  assert.equal(rec.status, 'failed');
  assert.equal(rec.solved, false);
});

Then('the day {string} is recorded as solved', async function (date) {
  await waitForDayStatus(this.page, date, 'completed');
});

Then('the day {string} has no record', async function (date) {
  await boardReady(this.page);
  assert.equal(await dayRecord(this.page, date), null);
});

Then('the failure for {string} is stamped 11:59:59 of that day', async function (date) {
  await waitForDayStatus(this.page, date, 'failed');
  const rec = await dayRecord(this.page, date);
  assert.equal(rec.extra.expired, true);
  const stamp = await this.page.evaluate(
    (at) => { const d = new Date(at); return [OL.Prng.dateKey(d), d.getHours(), d.getMinutes(), d.getSeconds()]; },
    rec.extra.finishedAt,
  );
  assert.deepEqual(stamp, [date, 23, 59, 59]);
});

/** A real drag of a playable tableau card to an empty free cell. */
async function dragToFreecell(page) {
  const empty = await page.evaluate(() => App.game.freecells.indexOf(null));
  assert.ok(empty >= 0, 'a free cell is empty');
  const card = await page.locator('#tableau .card.playable').last().boundingBox();
  const cell = await page.locator('.freecell').nth(empty).boundingBox();
  assert.ok(card && cell);
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function playOneMove(page) {
  await boardReady(page);
  const before = await page.evaluate(() => App.game.moves);
  await dragToFreecell(page);
  await page.waitForFunction((moves) => App.game.moves > moves && !OL.Deal.busy(), before);
}

/** Plays the real last move of a board one card from won; App records the finish. */
async function finishOpenGame(page) {
  await boardReady(page);
  await page.evaluate(async () => {
    const game = App.game;
    const king = game.cascades.flat().find((card) => card.rank === 13);
    const suit = Cards.suitIndex(king.suit);
    game.cascades = game.cascades.map((_, i) => (i === 0 ? [king] : []));
    game.freecells = [null, null, null, null];
    game.foundations = [13, 13, 13, 13];
    game.foundations[suit] = 12;
    game.foundationTops = [null, null, null, null];
    App.beginDragCascade(0, 1);
    App.dropOnFoundation(suit);
  });
  await page.waitForFunction(() => App.game.status === 'won');
  await page.locator('#overlay-win').waitFor({ state: 'visible' });
}

When('I leave the daily in progress with saved progress', async function () {
  await playOneMove(this.page);
  await this.page.waitForFunction(() => {
    const saved = localStorage.getItem('olfreecell.progress.' + OL.Prng.dateKey());
    return saved && JSON.parse(saved).moves === App.game.moves;
  }, null, { timeout: 10_000 });
  this.notedLayout = await tableauLayout(this.page);
});

/**
 * Deals a real dead end: every card left in play is black, so nothing builds,
 * the aces are buried, and the move played here takes the last free cell.
 */
When('the game on the table gets stuck', async function () {
  await boardReady(this.page);
  await this.page.evaluate(() => {
    const game = App.game;
    const all = game.cascades.flat();
    const isBlack = (card) => card.suit === 'spades' || card.suit === 'clubs';
    const tops = all.filter((card) => isBlack(card) && card.rank !== 1);
    const buried = all.filter((card) => !tops.includes(card));
    game.freecells = [tops.pop(), tops.pop(), tops.pop(), null];
    game.cascades = Array.from({ length: 8 }, () => [tops.pop(), tops.pop()]);
    game.cascades[0] = [...buried, ...tops, ...game.cascades[0]];
    App.beginDragCascade(0, 1);
    App.dropOnFreecell(3);
  });
  await this.page.waitForFunction(() => App.game.status === 'stuck');
  await this.page.locator('#overlay-stuck').waitFor({ state: 'visible' });
});

When('I try a move on the table', async function () {
  this.movesBefore = await this.page.evaluate(() => App.game.moves);
  await dragToFreecell(this.page);
});

Then('the move did not land', async function () {
  assert.equal(await this.page.evaluate(() => App.game.moves), this.movesBefore);
  const saved = await this.page.evaluate(() => JSON.parse(localStorage.getItem(`olfreecell.progress.${App.context.date}`)));
  assert.equal(saved.moves, this.movesBefore);
});

// What an older build left behind: an archive replay saved under its past date.
Given('an old build saved an archive game for {string}', async function (date) {
  await this.page.evaluate((d) => localStorage.setItem(`olfreecell.progress.${d}`, JSON.stringify({
    cascades: [], freecells: [null, null, null, null], foundations: [0, 0, 0, 0],
    foundationTops: [null, null, null, null], moves: 7, hintsUsed: 0,
    startedAt: Date.now(), status: 'playing', undos: 0, restarts: 0,
  })), date);
});

When('I leave the archive game in progress', async function () {
  await playOneMove(this.page);
});

When('I restart the daily', async function () {
  await boardReady(this.page);
  await this.page.locator('#new-btn').click();
  await boardReady(this.page);
  await this.page.waitForFunction(() => App.game.moves === 0);
});

When('I press restart', async function () {
  await this.page.locator('#new-btn').click();
});

When('I switch to practice', async function () {
  await this.page.locator('.mode-tab[data-mode="practice"]').click();
  await this.page.waitForFunction(() => App.context.mode === 'practice');
  await boardReady(this.page);
});

When('I open the archive day {string}', async function (date) {
  await this.page.evaluate((d) => App.onArchiveDateChosen(d), date);
  await boardReady(this.page);
});

When("I open today's daily", async function () {
  await this.page.evaluate(() => App.onModeChange('daily'));
  await boardReady(this.page);
});

Given('I have solved the open daily', async function () {
  await finishOpenGame(this.page);
  await this.page.locator('#win-close').click();
});

When('I replay the solved daily with a move', async function () {
  await this.page.evaluate(() => App.onWinReplay());
  await playOneMove(this.page);
  await this.page.waitForFunction(() => localStorage.getItem('olfreecell.progress.' + OL.Prng.dateKey()));
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
