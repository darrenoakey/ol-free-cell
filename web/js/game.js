// game.js — live FreeCell rules engine: legal moves, undo, hints, win/stuck.
// Wraps a DealGen deal + its proof-of-solvability solver.
'use strict';

class FreeCellGame {
  constructor(dealResult) {
    if (!dealResult) {
      throw new Error('FreeCellGame requires a proven dealResult from DealGen.generateDeal');
    }
    this.deal = dealResult.deal;
    this.solver = dealResult.solver;
    this.seedString = dealResult.seedString;
    this.attempt = dealResult.attempt || 0;

    this.cascades = DealGen.cloneCascades(dealResult.deal.cascades);
    this.freecells = [null, null, null, null];
    this.foundations = [0, 0, 0, 0];
    // foundationTops[suitIndex] = card object of current top (for rendering)
    this.foundationTops = [null, null, null, null];

    this.history = [];
    this.moves = 0;
    this.hintsUsed = 0;
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.status = 'playing'; // playing | won | stuck

    // Selection for two-tap / drag-style play: { type:'col'|'fc', index, count }
    this.selection = null;

    DealGen.autoplaySafe(this._stateView());
    this._syncFoundationTopsFromRanks();
    this._checkEnd();
  }

  _stateView() {
    return {
      cascades: this.cascades,
      freecells: this.freecells,
      foundations: this.foundations,
    };
  }

  _syncFoundationTopsFromRanks() {
    // After bulk restore we may only know ranks; tops are rebuilt when cards move.
    // If tops are missing but rank > 0, synthesize a placeholder card for render.
    for (let i = 0; i < 4; i++) {
      const rank = this.foundations[i];
      if (rank === 0) {
        this.foundationTops[i] = null;
      } else if (!this.foundationTops[i] || this.foundationTops[i].rank !== rank) {
        this.foundationTops[i] = {
          suit: Cards.SUITS[i],
          rank,
          id: `${Cards.SUITS[i]}_${rank}`,
        };
      }
    }
  }

  /** Restores a previously saved in-progress round. Undo history is not preserved. */
  restoreProgress(progress) {
    this.cascades = progress.cascades.map((col) => col.map((c) => ({ ...c })));
    this.freecells = progress.freecells.map((c) => (c ? { ...c } : null));
    this.foundations = progress.foundations.slice();
    this.foundationTops = (progress.foundationTops || [null, null, null, null]).map((c) =>
      c ? { ...c } : null,
    );
    this._syncFoundationTopsFromRanks();
    this.moves = progress.moves;
    this.hintsUsed = progress.hintsUsed;
    this.startedAt = progress.startedAt;
    this.history = [];
    this.selection = null;
    this.status = 'playing';
    this.finishedAt = null;
    this._checkEnd();
  }

  cardsRemaining() {
    return 52 - DealGen.cardsHome(this.foundations);
  }

  cardsHome() {
    return DealGen.cardsHome(this.foundations);
  }

  _snapshot() {
    return {
      cascades: DealGen.cloneCascades(this.cascades),
      freecells: DealGen.cloneFreecells(this.freecells),
      foundations: DealGen.cloneFoundations(this.foundations),
      foundationTops: this.foundationTops.map((c) => (c ? { ...c } : null)),
      moves: this.moves,
    };
  }

  _restoreSnap(snap) {
    this.cascades = snap.cascades;
    this.freecells = snap.freecells;
    this.foundations = snap.foundations;
    this.foundationTops = snap.foundationTops;
    this.moves = snap.moves;
    this.selection = null;
    this.status = 'playing';
    this.finishedAt = null;
  }

  clearSelection() {
    this.selection = null;
  }

  selectCascade(col, count) {
    if (this.status !== 'playing') return false;
    const cascade = this.cascades[col];
    if (!cascade.length) {
      this.selection = null;
      return false;
    }
    const seq = DealGen.sequenceLength(cascade);
    const n = Math.min(count || 1, seq);
    this.selection = { type: 'col', index: col, count: n };
    return true;
  }

  selectFreecell(fc) {
    if (this.status !== 'playing') return false;
    if (!this.freecells[fc]) {
      this.selection = null;
      return false;
    }
    this.selection = { type: 'fc', index: fc, count: 1 };
    return true;
  }

  /**
   * Attempt to move the current selection onto a cascade, freecell, or
   * foundation. Returns a move descriptor on success, or null.
   */
  dropOnCascade(dest) {
    if (!this.selection || this.status !== 'playing') return null;
    const sel = this.selection;
    if (sel.type === 'col' && sel.index === dest) {
      this.selection = null;
      return null;
    }

    let move = null;
    if (sel.type === 'col') {
      const src = sel.index;
      const scol = this.cascades[src];
      const n = sel.count;
      const cap = DealGen.moveCapacity(this.freecells, this.cascades, dest);
      if (n > cap) {
        this.selection = null;
        return null;
      }
      const moving = scol[scol.length - n];
      const dcol = this.cascades[dest];
      if (dcol.length === 0 || Cards.buildsOn(moving, dcol[dcol.length - 1])) {
        move = { type: 'col-to-col', src, dest, count: n, card: moving };
      }
    } else if (sel.type === 'fc') {
      const card = this.freecells[sel.index];
      const dcol = this.cascades[dest];
      if (card && (dcol.length === 0 || Cards.buildsOn(card, dcol[dcol.length - 1]))) {
        move = { type: 'fc-to-col', fc: sel.index, dest, card };
      }
    }

    if (!move) {
      this.selection = null;
      return null;
    }
    return this._commit(move);
  }

  dropOnFreecell(fc) {
    if (!this.selection || this.status !== 'playing') return null;
    const sel = this.selection;
    if (this.freecells[fc]) {
      // Occupied — if selecting another freecell card, just reselect.
      if (sel.type === 'fc' && sel.index !== fc) {
        this.selectFreecell(fc);
        return null;
      }
      this.selection = null;
      return null;
    }
    if (sel.type === 'col' && sel.count === 1) {
      const card = this.cascades[sel.index][this.cascades[sel.index].length - 1];
      const move = { type: 'col-to-fc', col: sel.index, fc, card };
      return this._commit(move);
    }
    if (sel.type === 'fc') {
      // Move freecell to freecell
      const card = this.freecells[sel.index];
      if (!card || sel.index === fc) {
        this.selection = null;
        return null;
      }
      const snap = this._snapshot();
      this.history.push(snap);
      this.freecells[fc] = card;
      this.freecells[sel.index] = null;
      this.moves++;
      this.selection = null;
      const auto = this._runAutoplay();
      this._checkEnd();
      return { type: 'fc-to-fc', from: sel.index, fc, card, autoplay: auto };
    }
    this.selection = null;
    return null;
  }

  dropOnFoundation(suitIndex) {
    if (!this.selection || this.status !== 'playing') return null;
    const sel = this.selection;
    let card = null;
    let move = null;
    if (sel.type === 'col' && sel.count === 1) {
      card = this.cascades[sel.index][this.cascades[sel.index].length - 1];
      if (Cards.suitIndex(card.suit) === suitIndex && this.foundations[suitIndex] + 1 === card.rank) {
        move = { type: 'col-to-found', col: sel.index, card };
      }
    } else if (sel.type === 'fc') {
      card = this.freecells[sel.index];
      if (card && Cards.suitIndex(card.suit) === suitIndex && this.foundations[suitIndex] + 1 === card.rank) {
        move = { type: 'fc-to-found', fc: sel.index, card };
      }
    }
    if (!move) {
      this.selection = null;
      return null;
    }
    return this._commit(move);
  }

  /** One-tap helper: try to auto-place cascade top or freecell card somewhere sensible. */
  quickPlayCascade(col) {
    if (this.status !== 'playing') return null;
    const cascade = this.cascades[col];
    if (!cascade.length) return null;
    const card = cascade[cascade.length - 1];
    const si = Cards.suitIndex(card.suit);
    if (this.foundations[si] + 1 === card.rank) {
      return this._commit({ type: 'col-to-found', col, card });
    }
    // Try build onto another cascade (single card)
    for (let dest = 0; dest < 8; dest++) {
      if (dest === col) continue;
      const dcol = this.cascades[dest];
      if (dcol.length && Cards.buildsOn(card, dcol[dcol.length - 1])) {
        const cap = DealGen.moveCapacity(this.freecells, this.cascades, dest);
        if (cap >= 1) return this._commit({ type: 'col-to-col', src: col, dest, count: 1, card });
      }
    }
    // Empty freecell
    for (let i = 0; i < 4; i++) {
      if (!this.freecells[i]) {
        return this._commit({ type: 'col-to-fc', col, fc: i, card });
      }
    }
    // Empty cascade
    for (let dest = 0; dest < 8; dest++) {
      if (dest !== col && this.cascades[dest].length === 0) {
        return this._commit({ type: 'col-to-col', src: col, dest, count: 1, card });
      }
    }
    return null;
  }

  quickPlayFreecell(fc) {
    if (this.status !== 'playing') return null;
    const card = this.freecells[fc];
    if (!card) return null;
    const si = Cards.suitIndex(card.suit);
    if (this.foundations[si] + 1 === card.rank) {
      return this._commit({ type: 'fc-to-found', fc, card });
    }
    for (let dest = 0; dest < 8; dest++) {
      const dcol = this.cascades[dest];
      if (dcol.length === 0 || Cards.buildsOn(card, dcol[dcol.length - 1])) {
        return this._commit({ type: 'fc-to-col', fc, dest, card });
      }
    }
    return null;
  }

  _commit(move) {
    const snap = this._snapshot();
    this.history.push(snap);

    switch (move.type) {
      case 'col-to-found': {
        const card = this.cascades[move.col].pop();
        const si = Cards.suitIndex(card.suit);
        this.foundations[si] = card.rank;
        this.foundationTops[si] = card;
        break;
      }
      case 'fc-to-found': {
        const card = this.freecells[move.fc];
        this.freecells[move.fc] = null;
        const si = Cards.suitIndex(card.suit);
        this.foundations[si] = card.rank;
        this.foundationTops[si] = card;
        break;
      }
      case 'col-to-col': {
        const src = this.cascades[move.src];
        const chunk = src.splice(src.length - move.count, move.count);
        this.cascades[move.dest].push(...chunk);
        break;
      }
      case 'col-to-fc': {
        const card = this.cascades[move.col].pop();
        this.freecells[move.fc] = card;
        break;
      }
      case 'fc-to-col': {
        const card = this.freecells[move.fc];
        this.freecells[move.fc] = null;
        this.cascades[move.dest].push(card);
        break;
      }
      default:
        this.history.pop();
        return null;
    }

    this.moves++;
    this.selection = null;
    if (move.type === 'col-to-fc' || move.type === 'fc-to-col' || move.type === 'fc-to-found') {
      this._packFreecells();
    }
    const autoplay = this._runAutoplay();
    this._checkEnd();
    return { ...move, autoplay };
  }

  _runAutoplay() {
    const moved = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < 4; i++) {
        const card = this.freecells[i];
        if (card && DealGen.isSafeFoundationMove(card, this.foundations)) {
          this.freecells[i] = null;
          const si = Cards.suitIndex(card.suit);
          this.foundations[si] = card.rank;
          this.foundationTops[si] = card;
          moved.push({ from: 'fc', index: i, card });
          progress = true;
        }
      }
      for (let c = 0; c < 8; c++) {
        const col = this.cascades[c];
        if (!col.length) continue;
        const card = col[col.length - 1];
        if (DealGen.isSafeFoundationMove(card, this.foundations)) {
          col.pop();
          const si = Cards.suitIndex(card.suit);
          this.foundations[si] = card.rank;
          this.foundationTops[si] = card;
          moved.push({ from: 'col', index: c, card });
          progress = true;
        }
      }
    }
    this._packFreecells();
    return moved;
  }

  _packFreecells() {
    const cards = [];
    for (let i = 0; i < 4; i++) if (this.freecells[i]) cards.push(this.freecells[i]);
    this.freecells = [null, null, null, null];
    for (let i = 0; i < cards.length; i++) this.freecells[i] = cards[i];
  }

  undo() {
    if (this.history.length === 0) return false;
    const snap = this.history.pop();
    this._restoreSnap(snap);
    return true;
  }

  hint() {
    if (this.status !== 'playing') return null;
    const move = this.solver.bestMoveFrom(this._stateView());
    if (move) this.hintsUsed++;
    return move;
  }

  isSolvableFromHere() {
    return this.solver.solvableFrom(this._stateView());
  }

  legalMoves() {
    if (this.status !== 'playing') return [];
    return DealGen.generateMoves(this._stateView());
  }

  _checkEnd() {
    if (this.cardsHome() === 52) {
      this.status = 'won';
      this.finishedAt = Date.now();
      return;
    }
    const moves = DealGen.generateMoves(this._stateView());
    if (moves.length === 0) {
      this.status = 'stuck';
      this.finishedAt = Date.now();
    }
  }

  elapsedMs() {
    return (this.finishedAt || Date.now()) - this.startedAt;
  }
}

// eslint-disable-next-line no-unused-vars
const Game = { FreeCellGame };
