// dealgen.js — shuffles a deck, deals a FreeCell layout, and proves it is
// solvable with an iterative DFS (+ safe autoplay) before it is ever shown.
//
// Layout: 8 cascades filled L→R depths 7,7,7,7,6,6,6,6 (classic FreeCell).
// 4 empty freecells, 4 empty foundations (one per suit, Ace→King).
//
// Move legality (Microsoft FreeCell rules):
//   - Tableau builds down by alternating colour.
//   - Foundations build up by suit from Ace.
//   - Single cards may move to empty freecells.
//   - Contiguous properly-built sequences may move as a unit when enough
//     freecells + empty cascades are available (the standard "supermove").
//
// Solvability: every deal shown is proven winnable by FreeCellSolver from
// the initial position. Unsolvable / budget-exhausted shuffles are rejected
// and the seed is re-derived deterministically until one passes.
'use strict';

const CASCADE_COUNT = 8;
const FREECELL_COUNT = 4;
const CASCADE_DEPTHS = [7, 7, 7, 7, 6, 6, 6, 6];

function shuffleDeck(deck, rng) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Deal a shuffled 52-card deck into 8 FreeCell cascades. */
function dealFromDeck(deck) {
  const cascades = Array.from({ length: CASCADE_COUNT }, () => []);
  let idx = 0;
  for (let col = 0; col < CASCADE_COUNT; col++) {
    for (let r = 0; r < CASCADE_DEPTHS[col]; r++) {
      cascades[col].push(deck[idx++]);
    }
  }
  return { cascades };
}

function cloneCascades(cascades) {
  return cascades.map((c) => c.slice());
}

function cloneFreecells(fc) {
  return fc.slice();
}

function cloneFoundations(f) {
  return f.slice();
}

/**
 * How many cards may be moved as a unit onto `destCol` given current
 * freecells and empty cascades. Destination empty-cascade is NOT counted
 * as a helper (classic FreeCell formula).
 */
function moveCapacity(freecells, cascades, destCol) {
  let emptyFc = 0;
  for (let i = 0; i < FREECELL_COUNT; i++) if (!freecells[i]) emptyFc++;
  let emptyCas = 0;
  for (let c = 0; c < CASCADE_COUNT; c++) {
    if (c !== destCol && cascades[c].length === 0) emptyCas++;
  }
  return (emptyFc + 1) * (1 << emptyCas);
}

/** Length of the properly-built sequence ending at the cascade top. */
function sequenceLength(cascade) {
  if (cascade.length === 0) return 0;
  let n = 1;
  for (let i = cascade.length - 1; i > 0; i--) {
    if (Cards.buildsOn(cascade[i], cascade[i - 1])) n++;
    else break;
  }
  return n;
}

function minFoundation(foundations) {
  let m = foundations[0];
  for (let i = 1; i < 4; i++) if (foundations[i] < m) m = foundations[i];
  return m;
}

/**
 * Baker-style safe foundation autoplay: a card may be auto-homed when its
 * rank is at most min(foundations)+2 (A/2 always). Never blocks a win.
 */
function isSafeFoundationMove(card, foundations) {
  const si = Cards.suitIndex(card.suit);
  if (foundations[si] + 1 !== card.rank) return false;
  if (card.rank <= 2) return true;
  return card.rank <= minFoundation(foundations) + 2;
}

/** Pack freecell cards into the lowest-index slots (nulls at the end). */
function packFreecells(freecells) {
  const cards = [];
  for (let i = 0; i < FREECELL_COUNT; i++) {
    if (freecells[i]) cards.push(freecells[i]);
  }
  const out = [null, null, null, null];
  for (let i = 0; i < cards.length; i++) out[i] = cards[i];
  return out;
}

function autoplaySafe(state) {
  let moved = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < FREECELL_COUNT; i++) {
      const card = state.freecells[i];
      if (!card) continue;
      if (isSafeFoundationMove(card, state.foundations)) {
        state.foundations[Cards.suitIndex(card.suit)] = card.rank;
        state.freecells[i] = null;
        moved++;
        progress = true;
      }
    }
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const col = state.cascades[c];
      if (col.length === 0) continue;
      const card = col[col.length - 1];
      if (isSafeFoundationMove(card, state.foundations)) {
        state.foundations[Cards.suitIndex(card.suit)] = card.rank;
        col.pop();
        moved++;
        progress = true;
      }
    }
  }
  if (moved) state.freecells = packFreecells(state.freecells);
  return moved;
}

function cardsHome(foundations) {
  return foundations[0] + foundations[1] + foundations[2] + foundations[3];
}

/** Fast-ish state key. Cascades keep identity; freecells sorted (slots interchangeable). */
function encodeState(state) {
  const parts = new Array(CASCADE_COUNT + 2);
  for (let c = 0; c < CASCADE_COUNT; c++) {
    const col = state.cascades[c];
    let s = '';
    for (let i = 0; i < col.length; i++) s += col[i].id + ',';
    parts[c] = s;
  }
  const fcIds = [];
  for (let i = 0; i < FREECELL_COUNT; i++) {
    if (state.freecells[i]) fcIds.push(state.freecells[i].id);
  }
  fcIds.sort();
  parts[CASCADE_COUNT] = fcIds.join(',');
  parts[CASCADE_COUNT + 1] = state.foundations.join('.');
  return parts.join('|');
}

function makeInitialState(deal) {
  return {
    cascades: cloneCascades(deal.cascades),
    freecells: [null, null, null, null],
    foundations: [0, 0, 0, 0],
  };
}

/**
 * Enumerate legal non-autoplay moves. Foundation-bound first for solver bias.
 * Prunes pure empty↔empty whole-column slides.
 */
function generateMoves(state) {
  const moves = [];
  const { cascades, freecells, foundations } = state;

  // freecell → foundation
  for (let i = 0; i < FREECELL_COUNT; i++) {
    const card = freecells[i];
    if (!card) continue;
    const si = Cards.suitIndex(card.suit);
    if (foundations[si] + 1 === card.rank) {
      moves.push({ type: 'fc-to-found', fc: i, card, pri: 0 });
    }
  }
  // cascade top → foundation
  for (let c = 0; c < CASCADE_COUNT; c++) {
    const col = cascades[c];
    if (!col.length) continue;
    const card = col[col.length - 1];
    const si = Cards.suitIndex(card.suit);
    if (foundations[si] + 1 === card.rank) {
      moves.push({ type: 'col-to-found', col: c, card, pri: 0 });
    }
  }

  // cascade → cascade
  for (let src = 0; src < CASCADE_COUNT; src++) {
    const scol = cascades[src];
    if (!scol.length) continue;
    const seqLen = sequenceLength(scol);
    for (let dest = 0; dest < CASCADE_COUNT; dest++) {
      if (dest === src) continue;
      const dcol = cascades[dest];
      const cap = moveCapacity(freecells, cascades, dest);
      const maxMove = Math.min(seqLen, cap);
      if (maxMove <= 0) continue;

      if (dcol.length === 0) {
        // Onto empty: only move the single top card OR a partial sequence that
        // uncovers something (not the entire column — pure slide is a no-op
        // for progress and floods the tree).
        const n = Math.min(maxMove, seqLen === scol.length ? Math.max(1, seqLen - 0) : maxMove);
        // Prefer single card onto empty (classic play); allow full seq if not whole column
        if (seqLen < scol.length) {
          // longest buildable chunk that isn't the whole remaining? whole seq ok if buried cards exist
          const take = Math.min(maxMove, seqLen);
          const moving = scol[scol.length - take];
          moves.push({ type: 'col-to-col', src, dest, count: take, card: moving, pri: 2 });
        } else {
          // whole column is a built sequence — moving to empty only rearranges;
          // allow single-card peel only if seqLen > 1 would still leave cards? whole col empty-slide skip.
          // Single card from a single-card column onto empty is also useless (empty↔empty).
          // Skip all whole-built-column → empty moves.
        }
        continue;
      }

      // Onto non-empty: longest legal build
      for (let n = maxMove; n >= 1; n--) {
        const moving = scol[scol.length - n];
        if (Cards.buildsOn(moving, dcol[dcol.length - 1])) {
          moves.push({
            type: 'col-to-col',
            src,
            dest,
            count: n,
            card: moving,
            pri: n > 1 ? 1 : 2,
          });
          break;
        }
      }
    }
  }

  // freecell → cascade
  for (let i = 0; i < FREECELL_COUNT; i++) {
    const card = freecells[i];
    if (!card) continue;
    for (let dest = 0; dest < CASCADE_COUNT; dest++) {
      const dcol = cascades[dest];
      if (dcol.length === 0) {
        // freecell to empty — lower priority (often reversible thrash)
        moves.push({ type: 'fc-to-col', fc: i, dest, card, pri: 3 });
      } else if (Cards.buildsOn(card, dcol[dcol.length - 1])) {
        moves.push({ type: 'fc-to-col', fc: i, dest, card, pri: 1 });
      }
    }
  }

  // cascade top → freecell (only first empty slot; slots are interchangeable)
  let freeSlot = -1;
  for (let i = 0; i < FREECELL_COUNT; i++) {
    if (!freecells[i]) {
      freeSlot = i;
      break;
    }
  }
  if (freeSlot >= 0) {
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const col = cascades[c];
      if (!col.length) continue;
      // Don't freecell a card that can already go to foundation (covered above)
      const card = col[col.length - 1];
      const si = Cards.suitIndex(card.suit);
      if (foundations[si] + 1 === card.rank) continue;
      moves.push({ type: 'col-to-fc', col: c, fc: freeSlot, card, pri: 3 });
    }
  }

  moves.sort((a, b) => a.pri - b.pri);
  return moves;
}

function applyMove(state, move) {
  const next = {
    cascades: cloneCascades(state.cascades),
    freecells: cloneFreecells(state.freecells),
    foundations: cloneFoundations(state.foundations),
  };
  switch (move.type) {
    case 'fc-to-found': {
      const card = next.freecells[move.fc];
      next.freecells[move.fc] = null;
      next.foundations[Cards.suitIndex(card.suit)] = card.rank;
      break;
    }
    case 'col-to-found': {
      const card = next.cascades[move.col].pop();
      next.foundations[Cards.suitIndex(card.suit)] = card.rank;
      break;
    }
    case 'col-to-col': {
      const src = next.cascades[move.src];
      const chunk = src.splice(src.length - move.count, move.count);
      next.cascades[move.dest].push(...chunk);
      break;
    }
    case 'fc-to-col': {
      const card = next.freecells[move.fc];
      next.freecells[move.fc] = null;
      next.cascades[move.dest].push(card);
      break;
    }
    case 'col-to-fc': {
      const card = next.cascades[move.col].pop();
      next.freecells[move.fc] = card;
      break;
    }
    default:
      break;
  }
  autoplaySafe(next);
  next.freecells = packFreecells(next.freecells);
  return next;
}


/**
 * Iterative DFS FreeCell solver with transposition table.
 * Records one winning successor move per proven-win state so hints
 * follow a real solution path instead of thrashing reversible moves.
 */
class FreeCellSolver {
  constructor(deal, maxStates) {
    this.deal = deal;
    this.maxStates = maxStates || 80_000;
    this.memo = new Map(); // key -> true (won) | false (lost)
    this.winMove = new Map(); // key -> move that leads to a win
    this.explored = 0;
    this.aborted = false;
  }

  solvableFrom(state) {
    this.explored = 0;
    this.aborted = false;
    this.memo.clear();
    this.winMove.clear();

    const start = {
      cascades: cloneCascades(state.cascades),
      freecells: cloneFreecells(state.freecells),
      foundations: cloneFoundations(state.foundations),
    };
    autoplaySafe(start);
    if (cardsHome(start.foundations) === 52) return true;

    const startKey = encodeState(start);
    // Frame fields:
    //   pendingMove — move from parent that produced this frame (null for root)
    //   childMove   — move currently being explored toward a child
    //   winChildMove — first child move that produced a win
    const stack = [];
    const onPath = new Set();

    stack.push({
      state: start,
      key: startKey,
      moves: null,
      idx: 0,
      sawWin: false,
      pendingMove: null,
      childMove: null,
      winChildMove: null,
    });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (cardsHome(frame.state.foundations) === 52) {
        this.memo.set(frame.key, true);
        // Notify parent: the pendingMove that led here is a winning move
        const wonMove = frame.pendingMove;
        stack.pop();
        onPath.delete(frame.key);
        if (stack.length) {
          const parent = stack[stack.length - 1];
          parent.sawWin = true;
          if (!parent.winChildMove) parent.winChildMove = wonMove;
        }
        continue;
      }

      const cached = this.memo.get(frame.key);
      if (cached === true) {
        const wonMove = frame.pendingMove;
        stack.pop();
        onPath.delete(frame.key);
        if (stack.length) {
          const parent = stack[stack.length - 1];
          parent.sawWin = true;
          if (!parent.winChildMove) parent.winChildMove = wonMove;
        }
        continue;
      }
      if (cached === false) {
        stack.pop();
        onPath.delete(frame.key);
        continue;
      }

      // First visit: generate moves
      if (frame.moves === null) {
        if (onPath.has(frame.key)) {
          stack.pop();
          continue;
        }
        this.explored++;
        if (this.explored > this.maxStates) {
          this.aborted = true;
          return false;
        }
        onPath.add(frame.key);
        frame.moves = generateMoves(frame.state);
        frame.idx = 0;
        frame.sawWin = false;
        frame.winChildMove = null;
      }

      // Already found a winning child — finalize as win
      if (frame.sawWin) {
        this.memo.set(frame.key, true);
        if (frame.winChildMove) this.winMove.set(frame.key, frame.winChildMove);
        const wonMove = frame.pendingMove;
        stack.pop();
        onPath.delete(frame.key);
        if (stack.length) {
          const parent = stack[stack.length - 1];
          parent.sawWin = true;
          if (!parent.winChildMove) parent.winChildMove = wonMove;
        }
        continue;
      }

      if (frame.idx >= frame.moves.length) {
        this.memo.set(frame.key, false);
        stack.pop();
        onPath.delete(frame.key);
        continue;
      }

      const move = frame.moves[frame.idx++];
      const next = applyMove(frame.state, move);
      const nextKey = encodeState(next);

      if (cardsHome(next.foundations) === 52) {
        frame.sawWin = true;
        frame.winChildMove = move;
        this.memo.set(nextKey, true);
        continue;
      }
      if (this.memo.get(nextKey) === true) {
        frame.sawWin = true;
        frame.winChildMove = move;
        continue;
      }
      if (this.memo.get(nextKey) === false) continue;
      if (onPath.has(nextKey)) continue;

      stack.push({
        state: next,
        key: nextKey,
        moves: null,
        idx: 0,
        sawWin: false,
        pendingMove: move,
        childMove: null,
        winChildMove: null,
      });
    }

    return this.memo.get(startKey) === true;
  }

  /**
   * Next move on a recorded winning line from this state, or null.
   */
  bestMoveFrom(state) {
    const start = {
      cascades: cloneCascades(state.cascades),
      freecells: cloneFreecells(state.freecells),
      foundations: cloneFoundations(state.foundations),
    };
    autoplaySafe(start);
    if (cardsHome(start.foundations) === 52) return null;

    const key = encodeState(start);
    // Reuse cached solution path when possible; otherwise re-solve.
    if (this.memo.get(key) !== true || !this.winMove.has(key)) {
      if (!this.solvableFrom(start) || this.aborted) return null;
    }
    return this.winMove.get(encodeState(start)) || null;
  }
}

/**
 * Generate a deal for seedString, retrying derived seeds until the solver
 * proves solvability. Deterministic for a given seed string.
 */
function generateDeal(seedString, options) {
  const opts = options || {};
  const maxAttempts = opts.maxAttempts || 120;
  const maxStates = opts.maxStates || 80_000;
  const baseSeed = Prng.hashSeed(seedString);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = (baseSeed + attempt * 0x9e3779b1) >>> 0;
    const rng = Prng.mulberry32(seed);
    const deck = shuffleDeck(Cards.freshDeck(), rng);
    const deal = dealFromDeck(deck);
    const solver = new FreeCellSolver(deal, maxStates);
    const initial = makeInitialState(deal);
    const solvable = solver.solvableFrom(initial);
    if (solvable && !solver.aborted) {
      // Keep the proving solver so winMove/memo are warm for hints.
      return {
        deal,
        solver,
        seedString,
        attempt,
        explored: solver.explored,
      };
    }
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
const DealGen = {
  CASCADE_COUNT,
  FREECELL_COUNT,
  CASCADE_DEPTHS,
  shuffleDeck,
  dealFromDeck,
  moveCapacity,
  sequenceLength,
  autoplaySafe,
  generateMoves,
  applyMove,
  makeInitialState,
  encodeState,
  FreeCellSolver,
  generateDeal,
  cardsHome,
  isSafeFoundationMove,
  cloneCascades,
  cloneFreecells,
  cloneFoundations,
};
