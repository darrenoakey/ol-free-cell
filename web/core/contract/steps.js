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

Then('face-down cards reveal nothing', async function () {
  const paintsCards = await this.page.locator('link[href*="cards.css"]').count();
  if (!paintsCards) return;
  const report = await this.page.evaluate(() => {
    if (!globalThis.OL || !globalThis.OL.Cards) return ['card app has no OL.Cards'];
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-4000px;top:0';
    document.body.appendChild(host);
    const bad = [];
    const glyph = /[A2-9JQK]|10|[\u2660\u2665\u2666\u2663]/;
    const pseudoLeaks = (card, which) => {
      const cs = getComputedStyle(card, which);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return '';
      const content = cs.content;
      const text = content && content !== 'none' && content !== 'normal' && content !== '""';
      const image = cs.backgroundImage && cs.backgroundImage !== 'none';
      const fill = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      return text || image || fill ? `${which} ${content}` : '';
    };
    const check = (card, label) => {
      if (!card.classList.contains('down')) return;
      if ((card.innerText || '').trim() !== '') bad.push(`${label} innerText ${JSON.stringify(card.innerText)}`);
      for (const which of ['::before', '::after']) {
        const leak = pseudoLeaks(card, which);
        if (leak) bad.push(`${label} ${leak}`);
      }
      for (const el of card.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const text = (el.textContent || '').trim();
        const marked = glyph.test(text) || el.matches('.r, .s, .index, .pip, .su, .pp, .face-letter, img');
        if (!marked) continue;
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length) {
          bad.push(`${label} visible ${el.className} ${text}`);
        }
      }
    };
    for (const style of globalThis.OL.Cards.STYLES) {
      for (const finish of globalThis.OL.Cards.FINISHES) {
        const deck = document.createElement('div');
        globalThis.OL.Cards.dress(deck, style.id, finish.id);
        globalThis.OL.Cards.setGeometry(deck, 48, 70);
        for (const id of [0, 9, 12, 22]) {
          deck.appendChild(globalThis.OL.Cards.cardElement(globalThis.OL.Cards.cardFromId(id)));
        }
        host.appendChild(deck);
        for (const card of deck.querySelectorAll('.card.down')) check(card, `${style.id}/${finish.id}`);
      }
    }
    for (const card of document.querySelectorAll('.card.down')) {
      if (host.contains(card)) continue;
      check(card, 'board');
    }
    host.remove();
    return bad;
  });
  assert.deepEqual(report, []);
});

Then('the appearance sheet lists looks and themes', async function () {
  assert.ok(await this.page.locator('.theme-pick').count() >= 4);
  const cardList = this.page.locator('#card-list');
  const showCards = (await cardList.count()) > 0 && await cardList.first().isVisible();
  if (showCards) {
    assert.ok(await this.page.locator('.look-pick').count() >= 10);
  }
});
