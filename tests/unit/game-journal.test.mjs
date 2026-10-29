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

function provenGame() {
  const deal = vm.runInThisContext('DealGen').generateDeal('iphone-duo-journal-fixture');
  return new globalThis.Game.FreeCellGame(deal);
}

function moveToFreecell(game, column = 0, freecell = 0) {
  const card = game.cascades[column].at(-1);
  assert.equal(game.selectCascade(column, 1), true);
  assert.ok(game.dropOnFreecell(freecell));
  return card;
}

test('actual moves produce independent replay snapshots and readable descriptions', () => {
  const game = provenGame();
  const initialCount = game.cascades.flat().length;
  const card = moveToFreecell(game);

  assert.equal(initialCount, 52);
  assert.equal(game.moves, 1);
  assert.equal(game.reviewLog.length, 1);
  assert.equal(game.reviewLog[0].kind, 'move');
  assert.equal(game.reviewLog[0].after.freecells[0].id, card.id);
  assert.equal(game.reviewLog[0].after.cascades.flat().length, 51);
  assert.match(globalThis.FreeCellDuo.describeEntry(game.reviewLog[0]), /Cascade 1 → Freecell 1/);

  const frames = globalThis.FreeCellDuo.reviewFrames(game.reviewState());
  assert.equal(frames.length, 2);
  assert.equal(frames[0].snapshot.cascades.flat().length, 52);
  assert.equal(frames[1].snapshot.freecells[0].id, card.id);
});

test('undo is an append-only review event and never changes earlier frames', () => {
  const game = provenGame();
  const card = moveToFreecell(game);
  const reviewBeforeUndo = game.reviewState();
  assert.equal(game.undo(), true);

  assert.equal(game.moves, 0);
  assert.equal(game.reviewLog.length, 2);
  assert.equal(game.reviewLog[1].kind, 'undo');
  assert.equal(game.reviewLog[1].after.freecells[0], null);
  assert.equal(game.reviewLog[0].after.freecells[0].id, card.id);
  assert.equal(globalThis.FreeCellDuo.describeEntry(game.reviewLog[1]), 'Undo to move 0');
  assert.deepEqual(game.reviewState().entries[0], reviewBeforeUndo.entries[0]);
});

test('review data survives the real progress serialization round trip', () => {
  const original = provenGame();
  const card = moveToFreecell(original);
  const progress = JSON.parse(JSON.stringify(original.progressSnapshot(2, 3)));
  const restored = provenGame();
  restored.restoreProgress(progress);

  assert.equal(restored.moves, 1);
  assert.equal(restored.reviewLog.length, 1);
  assert.equal(restored.reviewBase.cascades.flat().length, 52);
  assert.equal(restored.reviewLog[0].after.freecells[0].id, card.id);
  assert.equal(progress.undos, 2);
  assert.equal(progress.restarts, 3);

  const copy = restored.reviewState();
  copy.entries[0].after.freecells[0] = null;
  assert.equal(restored.reviewLog[0].after.freecells[0].id, card.id);
});

test('legacy progress keeps its move count and starts a journal at the next move', () => {
  const original = provenGame();
  moveToFreecell(original);
  const modern = original.progressSnapshot(0, 0);
  const legacy = { ...modern, moves: 4 };
  delete legacy.review;

  const restored = provenGame();
  restored.restoreProgress(legacy);
  assert.equal(restored.moves, 4);
  assert.equal(restored.reviewBase.moves, 4);
  assert.equal(restored.reviewLog.length, 0);

  moveToFreecell(restored, 1, 1);
  assert.equal(restored.moves, 5);
  assert.equal(restored.reviewLog.length, 1);
  assert.equal(restored.reviewLog[0].after.moves, 5);
  assert.match(globalThis.FreeCellDuo.describeEntry(restored.reviewLog[0]), /Cascade 2 → Freecell 2/);
});
