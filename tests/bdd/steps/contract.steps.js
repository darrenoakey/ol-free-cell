import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { rootUrl } from '../support/world.js';

Given('the daily app is open', async function () {
  await this.page.goto(rootUrl, { waitUntil: 'networkidle' });
  await this.page.locator('#overlay-loading').waitFor({ state: 'hidden' });
  await this.page.locator('#tableau .card').first().waitFor();
});

When('I pick the {string} table and {string} cards', async function (theme, look) {
  const themeId = theme.toLowerCase().replace(/\s+/g, '-');
  const lookId = look.toLowerCase();
  await this.page.locator(`#sheet-look .theme-pick[data-theme="${themeId}"]`).click();
  await this.page.locator(`html[data-theme="${themeId}"]`).waitFor();
  await this.page.locator('#sheet-look .look-tab[data-tab="front"]').click();
  await this.page.locator(`#sheet-look .look-pick[data-cards="${lookId}"]`).click();
  await this.page.locator(`#board[data-cards="${lookId}"]`).waitFor();
  await this.page.waitForFunction(
    ([themeKey, lookKey, themeValue, lookValue]) =>
      localStorage.getItem(themeKey) === themeValue && localStorage.getItem(lookKey) === lookValue,
    ['ol-free-cell.table.v1', 'ol-free-cell.cards.v1', themeId, lookId],
  );
});

When('I choose the {string} numbers', async function (numbers) {
  await this.page.locator('#sheet-look .look-tab[data-tab="numbers"]').click();
  await this.page.locator(`#sheet-look .number-pick[data-numbers="${numbers}"]`).click();
  await this.page.locator(`#board[data-numbers="${numbers}"]`).waitFor();
});

When('I choose the {string} faces', async function (faces) {
  await this.page.locator('#sheet-look .look-tab[data-tab="faces"]').click();
  await this.page.locator(`#sheet-look .face-pick[data-faces="${faces}"]`).click();
  await this.page.locator(`#board[data-faces="${faces}"]`).waitFor();
});

When('I reload the daily app', async function () {
  await this.page.reload({ waitUntil: 'networkidle' });
  await this.page.locator('#overlay-loading').waitFor({ state: 'hidden' });
  await this.page.locator('#tableau .card').first().waitFor();
});

Then('the table theme is {string}', async function (theme) {
  assert.equal(await this.page.locator('html').getAttribute('data-theme'), theme);
});

Then('the card look is {string}', async function (look) {
  assert.equal(await this.page.locator('#board').getAttribute('data-cards'), look);
});

Then('the board uses the {string} cards and {string} back', async function (cards, back) {
  const board = this.page.locator('#board');
  assert.equal(await board.getAttribute('data-cards'), cards);
  assert.equal(await board.getAttribute('data-back'), back);
});

Then('the appearance sheet has the tabs Table, Look, Numbers, Faces, Back and Finish', async function () {
  assert.deepEqual(await this.page.locator('#sheet-look .look-tab').allInnerTexts(), [
    'Table', 'Look', 'Numbers', 'Faces', 'Back', 'Finish',
  ]);
});

Then('the board numbers are {string}', async function (numbers) {
  assert.equal(await this.page.locator('#board').getAttribute('data-numbers'), numbers);
});

Then('the board faces are {string}', async function (faces) {
  assert.equal(await this.page.locator('#board').getAttribute('data-faces'), faces);
});

Then('a number card shows the big suit treatment', async function () {
  const display = await this.page.locator('#board .card.up:not(.court) .bigsu').first()
    .evaluate((element) => getComputedStyle(element).display);
  assert.equal(display, 'block');
});

Then('a court card shows the close figure treatment', async function () {
  const display = await this.page.locator('#board .card.up.court .court-art.close').first()
    .evaluate((element) => getComputedStyle(element).display);
  assert.notEqual(display, 'none');
});

Then('a classic card has no ring or outline', async function () {
  const style = await this.page.locator('#tableau .card').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { shadow: cs.boxShadow, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
  });
  assert.ok(!style.shadow.includes('0px 0px 0px 1px'), `ring shadow: ${style.shadow}`);
  assert.ok(style.outlineStyle === 'none' || style.outlineWidth === '0px', `outline: ${style.outlineStyle} ${style.outlineWidth}`);
});

// The drop shadow falls down and to the right, so each column must lie over the
// column to its left: a deep card never casts its shadow over the next column.
Then('the tableau columns stack left to right, each over the one to its left', async function () {
  // Judge the settled table, not cards still flying in from the deal.
  await this.page.waitForFunction(() => !globalThis.OL.Deal.busy() && !document.querySelector('.ol-in-flight'));
  const cols = await this.page.evaluate((() => [...document.querySelectorAll('#tableau .column')]
    .map((col) => [...col.querySelectorAll('.card')].map((el) => Number(getComputedStyle(el).zIndex)))
    .filter((zs) => zs.length)));
  assert.equal(cols.length, 8);
  for (let c = 1; c < cols.length; c++) {
    const below = Math.max(...cols[c - 1]);
    const above = Math.min(...cols[c]);
    if (!(above > below)) throw new Error(`column ${c} (z ${above}) does not lie over column ${c - 1} (z ${below})`);
  }
});
