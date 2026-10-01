// Shared Then/When steps. The consuming app defines "the daily app is open".
import { Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

async function closeOpenSheets(page) {
  for (let i = 0; i < 4; i++) {
    const open = page.locator('.sheet:not(.hidden)');
    if (!(await open.count())) return;
    const close = open.first().locator('.sheet-close, [data-close]').first();
    if (await close.count()) await close.click();
    await open.first().waitFor({ state: 'hidden', timeout: 5000 });
  }
}

When('the calendar is opened', async function () {
  await closeOpenSheets(this.page);
  await this.page.getByRole('button', { name: 'Calendar' }).click();
  await this.page.locator('.cal-grid, #sheet-calendar').first().waitFor({ state: 'visible' });
});

Then('the calendar grid is visible', async function () {
  assert.ok(await this.page.locator('.cal-grid').isVisible());
  assert.ok(await this.page.locator('.cal-day').count() > 7);
});

When('the statistics are opened', async function () {
  if (await this.page.locator('#sheet-stats:not(.hidden)').count()) return;
  await closeOpenSheets(this.page);
  await this.page.getByRole('button', { name: 'Statistics' }).click();
  await this.page.locator('#stats-body .tile, .tiles .tile').first().waitFor({ state: 'visible' });
});

Then('stats tiles are present', async function () {
  const tiles = await this.page.locator('.tile').count();
  assert.ok(tiles >= 6, `expected stats tiles, saw ${tiles}`);
  for (const label of ['Solved', 'Streak', 'Best streak']) {
    const tile = this.page.locator('#sheet-stats:not(.hidden)').getByText(label, { exact: true }).first();
    assert.ok(await tile.isVisible(), label);
  }
});

When('the appearance sheet is opened', async function () {
  if (await this.page.locator('#sheet-look:not(.hidden)').count()) return;
  if (!(await this.page.locator('#sheet-stats:not(.hidden)').count())) {
    await closeOpenSheets(this.page);
    const stats = this.page.getByRole('button', { name: 'Statistics' });
    if (await stats.count()) await stats.click();
  }
  const appearance = this.page.getByRole('button', { name: /table|appearance|cards/i }).first();
  if (await appearance.count()) await appearance.click();
  await this.page.locator('.theme-pick').first().waitFor({ state: 'visible' });
});

Then('the appearance sheet lists looks and themes', async function () {
  assert.ok(await this.page.locator('.theme-pick').count() >= 4);
  const cardList = this.page.locator('#card-list');
  const showCards = (await cardList.count()) > 0 && await cardList.first().isVisible();
  if (showCards) {
    assert.ok(await this.page.locator('.look-pick').count() >= 10);
  }
});
