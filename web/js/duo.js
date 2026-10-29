// duo.js — iPhone Duo companion: read-only move review and real daily progress.
// The live game is never mutated by review navigation.
(function (root) {
  'use strict';

  const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const SUITS = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
  const FOUNDATIONS = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];

  function cardName(card) {
    if (!card) return 'card';
    return `${RANKS[card.rank] || card.rank}${SUITS[card.suit] || ''}`;
  }

  function describeEntry(entry) {
    if (!entry) return 'Initial deal';
    if (entry.kind === 'undo') return `Undo to move ${entry.after.moves}`;
    const move = entry.move || {};
    const card = cardName(move.card);
    if (move.type === 'col-to-fc') return `${card} · Cascade ${move.col + 1} → Freecell ${move.fc + 1}`;
    if (move.type === 'fc-to-col') return `${card} · Freecell ${move.fc + 1} → Cascade ${move.dest + 1}`;
    if (move.type === 'fc-to-found') return `${card} · Freecell ${move.fc + 1} → ${FOUNDATIONS[Cards.suitIndex(move.card.suit)]} foundation`;
    if (move.type === 'col-to-found') return `${card} · Cascade ${move.col + 1} → ${FOUNDATIONS[Cards.suitIndex(move.card.suit)]} foundation`;
    if (move.type === 'col-to-col') {
      const count = move.count > 1 ? ` (${move.count} cards)` : '';
      return `${card}${count} · Cascade ${move.src + 1} → Cascade ${move.dest + 1}`;
    }
    if (move.type === 'fc-to-fc') return `${card} · Freecell ${move.from + 1} → Freecell ${move.fc + 1}`;
    return 'FreeCell move';
  }

  function reviewFrames(review) {
    const base = review && review.base ? review.base : null;
    const entries = review && Array.isArray(review.entries) ? review.entries : [];
    return [{ label: 'Initial deal', snapshot: base }, ...entries.map((entry, index) => ({
      label: describeEntry(entry),
      snapshot: entry.after,
      entry,
      event: index + 1,
    }))];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  class Companion {
    constructor(controller, element) {
      this.controller = controller;
      this.element = element;
      this.tab = 'moves';
      this.reviewIndex = null;
      this.selectedDate = null;
      this.calMonth = null;
    }

    init() {
      this.element.innerHTML = `
        <div class="duo-heading">
          <div><span class="duo-eyebrow">Unfolded workspace</span><h2>FreeCell companion</h2></div>
          <span class="duo-live-badge">LIVE</span>
        </div>
        <div class="duo-tabs" role="tablist" aria-label="Companion views">
          <button id="duo-moves-tab" class="duo-tab" role="tab" aria-selected="true" aria-controls="duo-moves-panel">Move history</button>
          <button id="duo-daily-tab" class="duo-tab" role="tab" aria-selected="false" aria-controls="duo-daily-panel">Daily progress</button>
        </div>
        <section id="duo-moves-panel" class="duo-panel" role="tabpanel" aria-labelledby="duo-moves-tab">
          <div class="duo-review-head">
            <div><span class="duo-section-label">READ-ONLY REPLAY</span><p id="duo-review-status">Live position</p></div>
            <button id="duo-review-live" class="duo-small-button" type="button">Live</button>
          </div>
          <div id="duo-replay" class="duo-replay" data-testid="replay-position" aria-live="polite"></div>
          <div class="duo-review-controls">
            <button id="duo-review-prev" class="duo-small-button" type="button" aria-label="Previous review position">← Earlier</button>
            <button id="duo-review-next" class="duo-small-button" type="button" aria-label="Next review position">Later →</button>
          </div>
          <div class="duo-history-heading"><span class="duo-section-label">ACTUAL MOVES</span><span id="duo-event-count">0 events</span></div>
          <div id="duo-move-list" class="duo-move-list"></div>
        </section>
        <section id="duo-daily-panel" class="duo-panel hidden" role="tabpanel" aria-labelledby="duo-daily-tab">
          <div id="duo-daily-stats" class="duo-daily-stats"></div>
          <div class="duo-calendar-head">
            <button id="duo-cal-prev" class="duo-small-button" type="button" aria-label="Previous Duo month">←</button>
            <h3 id="duo-cal-title">Daily calendar</h3>
            <button id="duo-cal-next" class="duo-small-button" type="button" aria-label="Next Duo month">→</button>
          </div>
          <div id="duo-calendar"></div>
          <button id="duo-play-date" class="ctrl-btn primary hidden" type="button">Play this day</button>
        </section>`;

      this.element.querySelector('#duo-moves-tab').addEventListener('click', () => this.selectTab('moves'));
      this.element.querySelector('#duo-daily-tab').addEventListener('click', () => this.selectTab('daily'));
      this.element.querySelector('#duo-review-live').addEventListener('click', () => this.selectLive());
      this.element.querySelector('#duo-review-prev').addEventListener('click', () => this.shiftReview(-1));
      this.element.querySelector('#duo-review-next').addEventListener('click', () => this.shiftReview(1));
      this.element.querySelector('#duo-move-list').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-frame]');
        if (button) this.selectReview(Number(button.dataset.frame));
      });
      this.element.querySelector('#duo-cal-prev').addEventListener('click', () => this.shiftMonth(-1));
      this.element.querySelector('#duo-cal-next').addEventListener('click', () => this.shiftMonth(1));
      this.element.querySelector('#duo-calendar').addEventListener('click', (event) => {
        const day = event.target.closest('.cal-day[data-date]');
        if (!day || day.classList.contains('future')) return;
        this.selectDate(day.dataset.date);
      });
      this.element.querySelector('#duo-play-date').addEventListener('click', () => {
        if (this.selectedDate) this.controller.onArchiveDateChosen(this.selectedDate);
      });
      this.resetCalendar();
      this.refresh();
    }

    selectTab(tab) {
      this.tab = tab;
      const moves = tab === 'moves';
      this.element.querySelector('#duo-moves-tab').setAttribute('aria-selected', String(moves));
      this.element.querySelector('#duo-daily-tab').setAttribute('aria-selected', String(!moves));
      this.element.querySelector('#duo-moves-panel').classList.toggle('hidden', !moves);
      this.element.querySelector('#duo-daily-panel').classList.toggle('hidden', moves);
      this.refresh();
    }

    selectReview(index) {
      const count = this.controller.game ? this.controller.game.reviewLog.length : 0;
      this.reviewIndex = Math.max(0, Math.min(count, index));
      this.renderMoves();
    }

    selectLive() {
      this.reviewIndex = null;
      this.renderMoves();
    }

    shiftReview(delta) {
      const count = this.controller.game ? this.controller.game.reviewLog.length : 0;
      const current = this.reviewIndex === null ? count : this.reviewIndex;
      this.selectReview(current + delta);
    }

    refresh() {
      if (!this.controller.game || !this.element.querySelector('#duo-move-list')) return;
      if (this.reviewIndex !== null) {
        this.reviewIndex = Math.min(this.reviewIndex, this.controller.game.reviewLog.length);
      }
      this.renderMoves();
      this.renderDaily();
    }

    renderMoves() {
      const game = this.controller.game;
      const review = game.reviewState();
      const frames = reviewFrames(review);
      const liveIndex = frames.length - 1;
      const index = this.reviewIndex === null ? liveIndex : this.reviewIndex;
      const frame = frames[index];
      const reviewing = this.reviewIndex !== null;
      const status = this.element.querySelector('#duo-review-status');
      status.textContent = reviewing
        ? `Reviewing ${index} of ${review.entries.length} · live table untouched`
        : `Live · move ${game.moves}`;
      this.element.querySelector('#duo-review-live').disabled = !reviewing;
      this.element.querySelector('#duo-review-prev').disabled = index <= 0;
      this.element.querySelector('#duo-review-next').disabled = reviewing ? index >= liveIndex : true;
      this.element.querySelector('#duo-event-count').textContent = `${review.entries.length} event${review.entries.length === 1 ? '' : 's'}`;
      this.renderReplay(frame.snapshot, index, reviewing);

      const list = this.element.querySelector('#duo-move-list');
      if (review.entries.length === 0) {
        list.innerHTML = `<p class="duo-empty" id="duo-history-empty">${game.moves > 0
          ? `Restored at move ${game.moves}. History begins with your next move.`
          : 'Your actual moves will appear here as you play.'}</p>`;
        return;
      }
      list.innerHTML = review.entries.map((entry, entryIndex) => {
        const frameNumber = entryIndex + 1;
        const selected = reviewing && frameNumber === index;
        return `<button class="duo-move${selected ? ' selected' : ''}" data-frame="${frameNumber}" ${selected ? 'aria-current="true"' : ''} aria-label="Review event ${frameNumber}: ${escapeHtml(describeEntry(entry))}">
          <span class="duo-move-number">${entry.kind === 'undo' ? '↶' : frameNumber}</span>
          <span>${escapeHtml(describeEntry(entry))}<small>Position: move ${entry.after.moves}</small></span>
        </button>`;
      }).reverse().join('');
    }

    renderReplay(snapshot, index, reviewing) {
      const replay = this.element.querySelector('#duo-replay');
      replay.dataset.frame = String(index);
      replay.dataset.moves = String(snapshot.moves);
      replay.setAttribute('aria-label', `${reviewing ? 'Review' : 'Live'} position at move ${snapshot.moves}`);
      const cells = snapshot.freecells.map((card) => `<span class="duo-mini-card${card ? '' : ' empty'}">${card ? escapeHtml(cardName(card)) : '·'}</span>`).join('');
      const foundations = snapshot.foundations.map((rank, suit) => `<span class="duo-mini-card${rank ? '' : ' empty'}">${rank ? `${RANKS[rank] || rank}${Object.values(SUITS)[suit]}` : Object.values(SUITS)[suit]}</span>`).join('');
      const cascades = snapshot.cascades.map((cards, column) => `<div class="duo-mini-column" aria-label="Cascade ${column + 1}, ${cards.length} cards">
        ${cards.map((card) => `<span class="duo-mini-card">${escapeHtml(cardName(card))}</span>`).join('') || '<span class="duo-mini-card empty">·</span>'}
      </div>`).join('');
      replay.innerHTML = `<div class="duo-mini-slots"><div>${cells}</div><div>${foundations}</div></div><div class="duo-mini-tableau">${cascades}</div>`;
    }

    resetCalendar() {
      const today = Prng.todayDateString();
      const date = OL.Prng.parseKey(today);
      this.calMonth = { y: date.getFullYear(), m0: date.getMonth() };
    }

    shiftMonth(delta) {
      const date = new Date(this.calMonth.y, this.calMonth.m0 + delta, 1);
      this.calMonth = { y: date.getFullYear(), m0: date.getMonth() };
      this.selectedDate = null;
      this.renderDaily();
    }

    selectDate(date) {
      this.selectedDate = date;
      this.renderDaily();
    }

    renderDaily() {
      const today = Prng.todayDateString();
      const stats = this.controller.stats || this.controller.computeStats();
      this.element.querySelector('#duo-daily-stats').innerHTML = `
        <div><strong id="duo-solved-count">${stats.total}</strong><span>Solved</span></div>
        <div><strong>${stats.currentStreak}</strong><span>Streak</span></div>
        <div><strong>${stats.winRate}%</strong><span>Win rate</span></div>
        <div><strong>${OL.Stats.formatTime(stats.times.best)}</strong><span>Fastest</span></div>`;
      const title = OL.Views.renderCalendar(this.element.querySelector('#duo-calendar'), {
        history: this.controller.dayMap(),
        today,
        firstSeen: this.controller.firstSeen(today),
        month: this.calMonth,
        todayOpen: !this.controller.recordFor(today),
        solvedMark: 'dot',
      });
      this.element.querySelector('#duo-cal-title').textContent = title;
      const detail = this.element.querySelector('#duo-calendar .cal-detail');
      detail.id = 'duo-cal-detail';
      if (this.selectedDate) {
        const selected = this.element.querySelector(`#duo-calendar .cal-day[data-date="${this.selectedDate}"]`);
        if (selected) selected.classList.add('selected');
        detail.innerHTML = OL.Views.dayDetail(this.controller.dayMap(), this.selectedDate, today);
      }
      const current = OL.Prng.parseKey(today);
      this.element.querySelector('#duo-cal-next').disabled = this.calMonth.y === current.getFullYear()
        && this.calMonth.m0 === current.getMonth();
      this.element.querySelector('#duo-play-date').classList.toggle('hidden', !this.selectedDate);
    }
  }

  root.FreeCellDuo = { Companion, cardName, describeEntry, reviewFrames };
})(globalThis);
