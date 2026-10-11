import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { rootUrl } from '../support/world.js';

const colors = {
  cream: 'rgb(247, 243, 232)',
  feltBase: 'rgb(11, 86, 58)',
  feltEdge: 'rgb(6, 58, 39)',
  feltHighlight: 'rgb(23, 122, 81)',
  gold: 'rgb(244, 211, 123)',
  secondary: 'rgb(213, 232, 220)',
};

const tokens = {
  cream: '#f7f3e8',
  feltBase: '#0b563a',
  feltEdge: '#063a27',
  feltHighlight: '#177a51',
  gold: '#f4d37b',
  secondary: '#d5e8dc',
};

async function css(page, selector, property) {
  return page.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);
}

Given('I launch OL FreeCell at the root', async function () {
  await this.page.goto(rootUrl, { waitUntil: 'networkidle' });
  await this.page.locator('#overlay-loading').waitFor({ state: 'hidden' });
});

Then('the daily FreeCell table is visible', async function () {
  await assert.doesNotReject(() => this.page.getByRole('heading', { name: 'OL FreeCell' }).waitFor());
  await assert.doesNotReject(() => this.page.locator('#board').waitFor());
});

Then('all 52 cards are dealt across eight tableau columns', async function () {
  assert.equal(await this.page.locator('#tableau .column').count(), 8);
  await this.page.waitForFunction(() => document.querySelectorAll('#tableau .card').length === 52);
});

Then('the gameplay controls retain their accessible names', async function () {
  for (const name of ['Menu', 'Stats', 'Undo', 'Hint', 'New game']) {
    assert.equal(await this.page.getByRole('button', { name, exact: true }).count(), 1, `${name} button`);
  }
});

Then('the fresh deal starts at the bottom centre and lands one card at a time', async function () {
  await this.page.getByRole('button', { name: 'New game', exact: true }).click();
  const observation = await this.page.evaluate(() => new Promise((resolve) => {
    let first = null;
    const landed = [];
    let frames = 0;
    const sample = () => {
      const board = document.querySelector('#board');
      const cards = Array.from(document.querySelectorAll('#tableau .card'));
      const flying = cards.filter((card) => card.classList.contains('ol-in-flight'));
      if (!first && cards.length === 52 && flying.length === 52) {
        const boardRect = board.getBoundingClientRect();
        first = {
          board: { x: boardRect.left + boardRect.width / 2, bottom: Math.min(boardRect.bottom, innerHeight) },
          cards: cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          }),
        };
      }
      if (first) landed.push(cards.length - flying.length);
      if (first && !OL.Deal.busy()) return resolve({ first, landed, frames });
      if (++frames > 500) return resolve({ first, landed, frames, timedOut: true });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  assert.ok(!observation.timedOut, 'deal should finish while sampled by requestAnimationFrame');
  assert.ok(observation.first, 'all cards should begin in flight before any lands');
  assert.equal(observation.first.cards.length, 52);
  for (const card of observation.first.cards) {
    assert.ok(Math.abs(card.x - observation.first.board.x) < 2, `start x ${card.x} should be board centre ${observation.first.board.x}`);
    assert.ok(card.y >= observation.first.board.bottom, `start y ${card.y} should be at the bottom edge ${observation.first.board.bottom}`);
  }
  assert.ok(observation.landed.some((count) => count > 0 && count < 52), 'cards should land incrementally rather than all at once');
});

Then('the table background layers the shared felt SVG', async function () {
  const felt = await css(this.page, 'body', '--ol-felt');
  assert.match(felt, /^url\(/, 'core should supply the felt SVG token');
  const usesFeltLayer = await this.page.evaluate(() => Array.from(document.styleSheets).some((sheet) => {
    try {
      return Array.from(sheet.cssRules).some((rule) =>
        rule.selectorText?.includes('body.theme-emerald') && rule.style.backgroundImage.includes('var(--ol-felt)'));
    } catch (_) {
      return false;
    }
  }));
  assert.equal(usesFeltLayer, true, 'FreeCell board background should layer the shared felt SVG');
});

Then('the emerald theme uses the sunlit felt palette', async function () {
  assert.equal(await css(this.page, 'body', '--text'), tokens.cream);
  assert.equal(await css(this.page, 'body', '--text-dim'), tokens.secondary);
  assert.equal(await css(this.page, 'body', '--felt-1'), tokens.feltBase);
  assert.equal(await css(this.page, 'body', '--felt-2'), tokens.feltHighlight);
  assert.equal(await css(this.page, 'body', '--felt-3'), tokens.feltEdge);
});

Then('the table uses cream cards with soft shadows', async function () {
  const card = this.page.locator('#tableau .card').first();
  await card.waitFor();
  // Classic is the default and shows only its PNG art; cream is the drawn looks' plate.
  await this.page.getByRole('button', { name: 'Statistics' }).click();
  await this.page.locator('#look-btn').click();
  await this.page.locator('#sheet-look .look-tab[data-tab="front"]').click();
  await this.page.locator('#sheet-look .look-pick[data-cards="original"]').click();
  await this.page.locator('#board[data-cards="original"]').waitFor();
  await this.page.locator('#sheet-look .sheet-close, #sheet-look [data-close]').first().click();
  await this.page.locator('#sheet-look.hidden').waitFor({ state: 'attached' });
  assert.equal(await css(this.page, '#tableau .card', 'background-color'), colors.cream);
  const shadowLayers = (await css(this.page, '#tableau .card', 'box-shadow')).split('),').length;
  assert.ok(shadowLayers <= 2, `expected at most two card shadow layers, got ${shadowLayers}`);
});

Then('selected cards and legal drop targets remain unmistakable', async function () {
  const playableCard = this.page.locator('#tableau .card.playable').last();
  await playableCard.click();
  await this.page.waitForTimeout(150);
  const selectedOutline = await css(this.page, '#tableau .card.selected', 'box-shadow');

  const cardBounds = await this.page.locator('#tableau .card.selected').last().boundingBox();
  const freecellBounds = await this.page.locator('.freecell').first().boundingBox();
  assert.ok(cardBounds && freecellBounds);
  await this.page.mouse.move(cardBounds.x + cardBounds.width / 2, cardBounds.y + cardBounds.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(freecellBounds.x + freecellBounds.width / 2, freecellBounds.y + freecellBounds.height / 2, { steps: 4 });
  const dropOutline = await css(this.page, '.slot.drop-hover', 'box-shadow');
  await this.page.mouse.up();

  assert.match(selectedOutline, /244, 211, 123/);
  assert.match(dropOutline, /213, 232, 220/);
});

When('I open the menu', async function () {
  await this.page.getByRole('button', { name: 'Menu', exact: true }).click();
  await this.page.getByRole('heading', { name: 'Menu', exact: true }).waitFor();
});

When('I choose the Midnight theme', async function () {
  await this.page.getByRole('button', { name: /Theme: Emerald/ }).click();
  await this.page.locator('body.theme-midnight').waitFor();
});

Then('the Midnight table is softer than the old severe theme', async function () {
  assert.equal(await css(this.page, 'body', '--text'), tokens.cream);
  assert.equal(await css(this.page, 'body', '--text-dim'), tokens.secondary);
  assert.equal(await css(this.page, 'body', '--felt-1'), '#1b4652');
  assert.equal(await css(this.page, 'body', '--felt-2'), '#2d6469');
});

Then('warm gold remains reserved for emphasis', async function () {
  assert.equal(await css(this.page, 'body', '--gold'), tokens.gold);
  assert.notEqual(await css(this.page, 'body', '--accent'), tokens.gold);
  assert.notEqual(await css(this.page, 'body', 'color'), colors.gold);
  assert.equal(await css(this.page, '.ctrl-btn.primary', 'color'), 'rgb(23, 49, 38)');
});
