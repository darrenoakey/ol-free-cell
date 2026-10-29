import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { rootUrl } from '../support/world.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rankLabel(cardId) {
  const [suit, rank] = cardId.split('_');
  const label = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || rank;
  return `${label}${{ clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[suit]}`;
}

function legacyProgress() {
  for (const file of [
    'web/core/js/namespace.js',
    'web/core/js/prng.js',
    'web/js/bridge.js',
    'web/js/cards.js',
    'web/js/dealgen.js',
    'web/js/game.js',
  ]) {
    vm.runInThisContext(readFileSync(join(projectRoot, file), 'utf8'), { filename: file });
  }
  const today = localDateKey();
  const deal = vm.runInThisContext('DealGen').generateDeal(today);
  const game = new globalThis.Game.FreeCellGame(deal);
  game.selectCascade(0, 1);
  game.dropOnFreecell(0);
  const progress = game.progressSnapshot(0, 0);
  progress.moves = 4;
  progress.reviewLog = undefined;
  delete progress.review;
  return { today, progress };
}

async function waitForPlayable(page) {
  await page.locator('#overlay-loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.App && App.game && !OL.Deal.busy());
  await page.locator('#tableau .card.playable').first().waitFor();
}

Given('my FreeCell history has two solved days this month', async function () {
  const today = localDateKey();
  const prefix = today.slice(0, 7);
  this.solvedDates = [`${prefix}-01`, `${prefix}-02`];
  const records = this.solvedDates.map((date, index) => ({
    schemaVersion: 1,
    gameId: 'ol-free-cell',
    date,
    solved: true,
    status: 'completed',
    ms: index === 0 ? 245000 : 400000,
    moves: index === 0 ? 61 : 74,
    extra: {},
  }));
  const document = { schemaVersion: 1, gameId: 'ol-free-cell', records, legacyTotals: null };
  await this.context.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: 'ol-free-cell.history.v1',
    value: JSON.stringify(document),
  });
});

Given('a legacy FreeCell deal is in progress at move 4', async function () {
  const { today, progress } = legacyProgress();
  this.legacyDate = today;
  await this.context.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, {
    key: `olfreecell.progress.${today}`,
    value: JSON.stringify(progress),
  });
});

When('I unfold the Duo workspace', async function () {
  await this.page.setViewportSize({ width: 669, height: 951 });
  await this.page.locator('#duo-workspace[data-duo="expanded"]').waitFor();
  await this.page.locator('#duo-companion').waitFor({ state: 'visible' });
});

When('I fold the Duo workspace', async function () {
  await this.page.setViewportSize({ width: 390, height: 844 });
  await this.page.locator('#duo-workspace[data-duo="compact"]').waitFor();
});

When('I drag a playable card to an empty freecell', async function () {
  await waitForPlayable(this.page);
  const card = this.page.locator('#tableau .card.playable[data-seq-from-top="1"]').first();
  this.draggedCardId = await card.getAttribute('data-card-id');
  this.draggedSourceColumn = Number(await card.evaluate((element) => element.closest('.column').dataset.col));
  const freecell = this.page.locator('.freecell.empty').first();
  this.draggedTargetFreecell = Number(await freecell.getAttribute('data-fc'));
  const initialMoves = await this.page.evaluate(() => App.game.moves);
  const source = await card.boundingBox();
  const target = await freecell.boundingBox();
  assert.ok(source && target);
  await this.page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await this.page.mouse.up();
  await this.page.waitForFunction((before) => App.game.moves > before && !OL.Deal.busy(), initialMoves);
});

When('I select the first move for review', async function () {
  await this.page.locator('#duo-move-list button[data-frame="1"]').click();
});

When('I step back to the initial deal', async function () {
  await this.page.getByRole('button', { name: 'Previous review position' }).click();
});

When('I return to the live position', async function () {
  await this.page.locator('#duo-review-live').click();
});

When('I select the Daily progress tab', async function () {
  await this.page.getByRole('tab', { name: 'Daily progress' }).click();
});

When('I choose the first solved day in the Duo calendar', async function () {
  await this.page.locator(`#duo-calendar .cal-day[data-date="${this.solvedDates[0]}"]`).click();
});

When('I reopen OL FreeCell', async function () {
  await this.page.reload({ waitUntil: 'networkidle' });
  await waitForPlayable(this.page);
});

Then('the Duo companion is hidden', async function () {
  await this.page.locator('#duo-workspace[data-duo="compact"]').waitFor();
  assert.equal(await this.page.locator('#duo-companion').isVisible(), false);
});

Then('the FreeCell table uses the folded width', async function () {
  await this.page.waitForFunction(() => window.App && App.game && !OL.Deal.busy());
  const dimensions = await this.page.evaluate(() => {
    const app = document.querySelector('#app').getBoundingClientRect();
    const card = document.querySelector('#tableau .card').getBoundingClientRect();
    return { appWidth: app.width, viewportWidth: innerWidth, cardRatio: card.width / card.height };
  });
  assert.ok(Math.abs(dimensions.appWidth - dimensions.viewportWidth) < 1, JSON.stringify(dimensions));
  assert.ok(Math.abs(dimensions.cardRatio - 512 / 768) < 0.01, JSON.stringify(dimensions));
});

Then('the Duo companion is visible beside the FreeCell table', async function () {
  const boxes = await this.page.evaluate(() => ({
    table: document.querySelector('#app').getBoundingClientRect().toJSON(),
    companion: document.querySelector('#duo-companion').getBoundingClientRect().toJSON(),
  }));
  assert.ok(boxes.table.width > 0 && boxes.companion.width > 0);
  assert.ok(boxes.table.x + boxes.table.width <= boxes.companion.x + 1);
});

Then('the Move history tab is selected', async function () {
  assert.equal(await this.page.getByRole('tab', { name: 'Move history' }).getAttribute('aria-selected'), 'true');
});

Then('the move history records the actual card move', async function () {
  const label = rankLabel(this.draggedCardId);
  const row = this.page.locator('#duo-move-list button[data-frame="1"]');
  await row.waitFor();
  assert.match(
    await row.textContent(),
    new RegExp(`${label}.*Cascade ${this.draggedSourceColumn + 1} → Freecell ${this.draggedTargetFreecell + 1}`),
  );
  this.actualMoveText = await row.textContent();
});

Then('the replay shows the position after move 1', async function () {
  const replay = this.page.locator('#duo-replay');
  assert.equal(await replay.getAttribute('data-frame'), '1');
  assert.equal(await replay.getAttribute('data-moves'), '1');
});

Then('the replay shows the initial deal', async function () {
  const replay = this.page.locator('#duo-replay');
  assert.equal(await replay.getAttribute('data-frame'), '0');
  assert.equal(await replay.locator('.duo-mini-tableau .duo-mini-card:not(.empty)').count(), 52);
});

Then(/^the live table remains at move (\d+)$/, async function (moves) {
  await this.page.waitForFunction(
    (expected) => App.game.moves === expected && document.querySelector('#moves-value').textContent === String(expected),
    moves,
  );
});

Then('the Duo calendar marks both solved days', async function () {
  for (const date of this.solvedDates) {
    await this.page.locator(`#duo-calendar .cal-day.solved[data-date="${date}"]`).waitFor();
  }
});

Then('the Duo statistics show 2 solved days', async function () {
  assert.equal(await this.page.locator('#duo-solved-count').textContent(), '2');
});

Then('the Duo calendar shows that day\'s time and move count', async function () {
  const detail = await this.page.locator('#duo-cal-detail').textContent();
  assert.match(detail, /4:05/);
  assert.match(detail, /61 moves/);
});

Then('the Duo calendar still shows that day\'s time and move count', async function () {
  assert.equal(await this.page.locator(`#duo-calendar .cal-day.selected[data-date="${this.solvedDates[0]}"]`).count(), 1);
  const detail = await this.page.locator('#duo-cal-detail').textContent();
  assert.match(detail, /4:05/);
  assert.match(detail, /61 moves/);
});

Then('the move history says it begins with the next move', async function () {
  assert.match(await this.page.locator('#duo-history-empty').textContent(), /Restored at move 4.*next move/);
});
