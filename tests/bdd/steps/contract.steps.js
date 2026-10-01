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

Then('a classic card has no ring or outline', async function () {
  const style = await this.page.locator('#tableau .card').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { shadow: cs.boxShadow, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
  });
  assert.ok(!style.shadow.includes('0px 0px 0px 1px'), `ring shadow: ${style.shadow}`);
  assert.ok(style.outlineStyle === 'none' || style.outlineWidth === '0px', `outline: ${style.outlineStyle} ${style.outlineWidth}`);
});
