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
  'web/js/game.js',
  'web/js/duo.js',
]) {
  vm.runInThisContext(readFileSync(join(root, file), 'utf8'), { filename: file });
}

const Duo = vm.runInThisContext('FreeCellDuo');

test('the unfolded Duo gives the whole screen to the playfield', () => {
  const folded = Duo.overlayState({ expanded: false, open: false });
  assert.equal(folded.playfieldFullWidth, false);
  assert.equal(folded.visible, false);

  const unfolded = Duo.overlayState({ expanded: true, open: false });
  assert.equal(unfolded.playfieldFullWidth, true);
  assert.equal(unfolded.visible, false, 'an unfolded Duo still opens on the table, not the sheet');

  const reading = Duo.overlayState({ expanded: true, open: true });
  assert.equal(reading.playfieldFullWidth, true, 'the sheet floats above the table, it never narrows it');
});

test('opening, closing and toggling the companion sheet are explicit transitions', () => {
  let state = Duo.reduceOverlay({ expanded: true, open: false }, 'open');
  assert.equal(state.open, true);
  state = Duo.reduceOverlay(state, 'close');
  assert.equal(state.open, false);
  state = Duo.reduceOverlay(state, 'toggle');
  assert.equal(state.open, true);
  state = Duo.reduceOverlay(state, 'toggle');
  assert.equal(state.open, false);
});

test('folding the Duo dismisses the sheet and unfolding never reopens it', () => {
  const open = Duo.reduceOverlay({ expanded: true, open: false }, 'open');
  assert.equal(open.open, true);

  const folded = Duo.reduceOverlay(open, 'collapse');
  assert.equal(folded.open, false);
  assert.equal(folded.expanded, false);

  assert.equal(Duo.reduceOverlay(folded, 'expand').open, false);
  assert.equal(Duo.reduceOverlay(folded, 'open').open, false, 'a folded Duo has no sheet to show');
});

test('selecting a tab asks to read the sheet, and unknown tabs fall back to moves', () => {
  let state = Duo.reduceOverlay({ expanded: true, open: false }, 'select-tab', 'daily');
  assert.equal(state.tab, 'daily');
  assert.equal(state.open, true);

  state = Duo.reduceOverlay(state, 'select-tab', 'nonsense');
  assert.equal(state.tab, 'moves');
  assert.equal(Duo.reduceOverlay({ expanded: true }, 'select-tab', 'daily').tab, 'daily');
});

/** The sheet is real markup: every element the reducer mirrors must exist. */
test('the companion markup carries the sheet, toggle and panel hooks the reducer drives', () => {
  const source = readFileSync(join(root, 'web/js/duo.js'), 'utf8');
  const markup = source.slice(source.indexOf('this.element.innerHTML = `'), source.indexOf('`;', source.indexOf('this.element.innerHTML = `')));
  for (const id of [
    'duo-sheet',
    'duo-companion-close',
    'duo-moves-tab',
    'duo-daily-tab',
    'duo-moves-panel',
    'duo-daily-panel',
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`), `${id} must exist in the companion markup`);
  }
  // The sheet is the only scrolling surface; its panels scroll inside it.
  assert.match(markup, /class="duo-sheet"/);
  assert.equal(markup.includes('class="duo-heading-actions"'), true);
});

test('the header exposes one companion toggle that starts collapsed', () => {
  const html = readFileSync(join(root, 'web/index.html'), 'utf8');
  const tag = html.match(/<button[^>]*id="duo-btn"[^>]*>/);
  assert.ok(tag, 'the header must own the companion toggle');
  assert.match(tag[0], /aria-expanded="false"/);
  assert.match(tag[0], /aria-controls="duo-companion"/);
  assert.match(tag[0], /aria-label="Show companion"/);
  // One toggle, and the companion element it controls really exists.
  assert.equal(html.match(/id="duo-btn"/g).length, 1);
  assert.match(html, /<aside id="duo-companion"/);
});

test('the stylesheet never gives the companion a column of its own', () => {
  const css = readFileSync(join(root, 'web/css/duo.css'), 'utf8');
  const expanded = css.slice(css.indexOf('#duo-workspace[data-duo="expanded"] {'));
  const rule = expanded.slice(0, expanded.indexOf('}'));
  assert.match(rule, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.equal(/var\(--ol-duo-primary\)/.test(css), false, 'the table must not share the row with a companion column');
  assert.match(css, /--ol-duo-companion-min: 0px;/);
  // The sheet hides itself by default and only opens through the is-open class.
  assert.match(css, /#duo-companion \{\s*display: none;/);
  assert.match(css, /#duo-companion\.is-open \{/);
});
