// ui.js — DOM rendering + animation. Owns no game rules; calls back into app.js.
// Card moves are drag-and-drop (pointer events). No click-to-play.
'use strict';

const UI = {
  els: {},
  controller: null,

  // Active pointer drag state (null when idle).
  _drag: null,
  _suppressClickUntil: 0,

  init(controller) {
    this.controller = controller;
    const $ = (id) => document.getElementById(id);
    this.els = {
      dateLabel: $('date-label'),
      streakValue: $('streak-value'),
      homeValue: $('home-value'),
      movesValue: $('moves-value'),
      board: $('board'),
      columns: Array.from(document.querySelectorAll('.column')),
      freecells: Array.from(document.querySelectorAll('.freecell')),
      foundations: Array.from(document.querySelectorAll('.foundation')),
      undoBtn: $('undo-btn'),
      hintBtn: $('hint-btn'),
      newBtn: $('new-btn'),
      modeTabs: Array.from(document.querySelectorAll('.mode-tab')),
      menuBtn: $('menu-btn'),
      statsBtn: $('stats-btn'),
      toast: $('toast'),
      loading: $('overlay-loading'),
      loadingText: $('loading-text'),
    };
    this._wireStatic();
  },

  _wireStatic() {
    const c = this.controller;
    const board = this.els.board;

    // Drag / drop is the only way to move cards.
    board.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    board.addEventListener('pointermove', (e) => this._onPointerMove(e));
    board.addEventListener('pointerup', (e) => this._onPointerUp(e));
    board.addEventListener('pointercancel', (e) => this._onPointerCancel(e));
    board.addEventListener('lostpointercapture', () => {
      if (this._drag) this._endDrag(false);
    });

    // Block residual click synthesis after a drag on iOS/WebKit.
    board.addEventListener(
      'click',
      (e) => {
        if (Date.now() < this._suppressClickUntil) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );

    this.els.undoBtn.addEventListener('click', () => c.onUndo());
    this.els.hintBtn.addEventListener('click', () => c.onHint());
    this.els.newBtn.addEventListener('click', () => c.onNewGameRequested());
    this.els.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => c.onModeChange(tab.dataset.mode));
    });
    this.els.menuBtn.addEventListener('click', () => this.showModal('overlay-menu'));
    this.els.statsBtn.addEventListener('click', () => c.onStatsRequested());

    document.getElementById('menu-close').addEventListener('click', () => this.hideModal('overlay-menu'));
    document.getElementById('menu-archive').addEventListener('click', () => {
      this.hideModal('overlay-menu');
      c.onArchiveRequested();
    });
    document.getElementById('menu-theme').addEventListener('click', () => c.onThemeToggle());
    document.getElementById('menu-rules').addEventListener('click', () => {
      this.hideModal('overlay-menu');
      this.showModal('overlay-rules');
    });
    document.getElementById('rules-close').addEventListener('click', () => this.hideModal('overlay-rules'));

    document.getElementById('win-close').addEventListener('click', () => c.onWinClosed());
    document.getElementById('stuck-retry').addEventListener('click', () => c.onStuckRetry());
    document.getElementById('stuck-close').addEventListener('click', () => this.hideModal('overlay-stuck'));
    document.getElementById('stats-close').addEventListener('click', () => this.hideModal('overlay-stats'));

    document.getElementById('cal-prev').addEventListener('click', () => c.onCalendarShift(-1));
    document.getElementById('cal-next').addEventListener('click', () => c.onCalendarShift(1));
    document.getElementById('cal-close').addEventListener('click', () => this.hideModal('overlay-calendar'));
  },

  // ---- drag / drop -------------------------------------------------------

  _onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (this._drag) return;
    if (!this.controller || !this.controller.canInteract || !this.controller.canInteract()) return;

    const cardEl = e.target.closest('.card.playable');
    if (!cardEl || !this.els.board.contains(cardEl)) return;

    const colEl = cardEl.closest('.column');
    const fcEl = cardEl.closest('.freecell');
    let source = null;

    if (colEl) {
      const col = Number(colEl.dataset.col);
      const count = Number(cardEl.dataset.seqFromTop) || 1;
      if (!this.controller.beginDragCascade(col, count)) return;
      source = { kind: 'col', index: col, count };
    } else if (fcEl) {
      const fc = Number(fcEl.dataset.fc);
      if (!this.controller.beginDragFreecell(fc)) return;
      source = { kind: 'fc', index: fc, count: 1 };
    } else {
      return;
    }

    e.preventDefault();
    const grabCards = this._collectDragCardEls(source);
    if (!grabCards.length) {
      this.controller.cancelDrag();
      return;
    }

    const firstRect = grabCards[0].getBoundingClientRect();
    const ghost = this._buildDragGhost(grabCards, firstRect);
    document.body.appendChild(ghost);

    // Hide source cards while the ghost rides the pointer.
    grabCards.forEach((el) => el.classList.add('drag-source-hidden'));

    this._drag = {
      pointerId: e.pointerId,
      source,
      grabCards,
      ghost,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: firstRect.left,
      originTop: firstRect.top,
      offsetX: e.clientX - firstRect.left,
      offsetY: e.clientY - firstRect.top,
      moved: false,
      hoverEl: null,
    };

    try {
      this.els.board.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    document.body.classList.add('is-dragging');
    this._markDropTargets(true);
    this._positionGhost(e.clientX, e.clientY);
  },

  _onPointerMove(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy > 36) {
      d.moved = true;
      d.ghost.classList.add('active');
    }
    if (d.moved) {
      this._positionGhost(e.clientX, e.clientY);
      this._updateHoverTarget(e.clientX, e.clientY);
    }
  },

  _onPointerUp(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();

    if (d.moved) {
      this._suppressClickUntil = Date.now() + 400;
      const target = this._hitTestDrop(e.clientX, e.clientY);
      // Tear down the ghost/drag lock BEFORE committing the move so render()
      // is not suppressed by the mid-drag guard.
      this._teardownDragVisuals(d);
      this._drag = null;
      const ok = target ? this._applyDrop(target) : false;
      if (!ok) {
        this._shakeDrop(target);
        this.controller.cancelDrag();
      }
    } else {
      // Tap without drag — keep selection highlighted, no move.
      this._teardownDragVisuals(d);
      this._drag = null;
      this.controller.refreshAfterSelect();
    }
  },

  _onPointerCancel(e) {
    const d = this._drag;
    if (!d || (e && e.pointerId !== d.pointerId)) return;
    this._teardownDragVisuals(d);
    this._drag = null;
    this.controller.cancelDrag();
  },

  _teardownDragVisuals(d) {
    if (!d) return;
    if (d.ghost && d.ghost.parentNode) d.ghost.remove();
    d.grabCards.forEach((el) => el.classList.remove('drag-source-hidden'));
    if (d.hoverEl) d.hoverEl.classList.remove('drop-hover');
    d.hoverEl = null;
    document.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
    this._markDropTargets(false);
    document.body.classList.remove('is-dragging');
    try {
      if (d.pointerId != null) this.els.board.releasePointerCapture(d.pointerId);
    } catch (_) {
      /* ignore */
    }
  },

  _endDrag(success, opts) {
    const d = this._drag;
    if (!d) return;
    this._teardownDragVisuals(d);
    this._drag = null;
    if (!success) {
      if (opts && opts.keepSelection) {
        this.controller.refreshAfterSelect();
      } else {
        this.controller.cancelDrag();
      }
    }
  },

  _collectDragCardEls(source) {
    if (source.kind === 'col') {
      const colEl = this.els.columns[source.index];
      const cards = Array.from(colEl.querySelectorAll('.card'));
      return cards.slice(Math.max(0, cards.length - source.count));
    }
    const fcEl = this.els.freecells[source.index];
    const card = fcEl.querySelector('.card');
    return card ? [card] : [];
  },

  _buildDragGhost(cardEls, firstRect) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.width = `${firstRect.width}px`;

    const sampleWidth = firstRect.width || 42;
    const cardHeight = sampleWidth * (768 / 512);
    const fanGap = Math.max(14, cardHeight * 0.22);

    cardEls.forEach((src, i) => {
      const clone = src.cloneNode(true);
      clone.classList.remove('selected', 'drag-source-hidden', 'hint-glow');
      clone.style.position = 'absolute';
      clone.style.left = '0';
      clone.style.top = `${i * fanGap}px`;
      clone.style.width = '100%';
      clone.style.zIndex = String(i + 1);
      clone.draggable = false;
      ghost.appendChild(clone);
    });

    ghost.style.height = `${(cardEls.length - 1) * fanGap + cardHeight}px`;
    return ghost;
  },

  _positionGhost(clientX, clientY) {
    const d = this._drag;
    if (!d || !d.ghost) return;
    const x = clientX - d.offsetX;
    const y = clientY - d.offsetY;
    d.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  },

  _markDropTargets(on) {
    this.els.columns.forEach((el) => el.classList.toggle('drop-target', on));
    this.els.freecells.forEach((el) => el.classList.toggle('drop-target', on));
    this.els.foundations.forEach((el) => el.classList.toggle('drop-target', on));
  },

  _clearHover() {
    if (this._drag && this._drag.hoverEl) {
      this._drag.hoverEl.classList.remove('drop-hover');
      this._drag.hoverEl = null;
    }
    document.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
  },

  _resolveTargetFromEl(el) {
    if (!el) return null;
    const col = el.closest && el.closest('.column');
    if (col && this.els.board.contains(col)) {
      return { kind: 'col', index: Number(col.dataset.col), el: col };
    }
    const fc = el.closest && el.closest('.freecell');
    if (fc && this.els.board.contains(fc)) {
      return { kind: 'fc', index: Number(fc.dataset.fc), el: fc };
    }
    const found = el.closest && el.closest('.foundation');
    if (found && this.els.board.contains(found)) {
      return { kind: 'found', index: Number(found.dataset.found), el: found };
    }
    return null;
  },

  _hitTestDrop(clientX, clientY) {
    const d = this._drag;
    // Hide ghost so elementsFromPoint sees the board underneath.
    if (d && d.ghost) d.ghost.style.visibility = 'hidden';
    const stack = document.elementsFromPoint(clientX, clientY);
    if (d && d.ghost) d.ghost.style.visibility = '';

    for (const el of stack) {
      if (d && (el === d.ghost || d.ghost.contains(el))) continue;
      // Don't treat the cards we're dragging (still in DOM, hidden) as a target
      // of their own source column unless the pointer is over that column area —
      // dropping on source column is a no-op cancel.
      const target = this._resolveTargetFromEl(el);
      if (target) return target;
    }
    return null;
  },

  _updateHoverTarget(clientX, clientY) {
    const target = this._hitTestDrop(clientX, clientY);
    const nextEl = target ? target.el : null;
    const d = this._drag;
    if (!d) return;
    if (d.hoverEl === nextEl) return;
    if (d.hoverEl) d.hoverEl.classList.remove('drop-hover');
    d.hoverEl = nextEl;
    if (nextEl) nextEl.classList.add('drop-hover');
  },

  _applyDrop(target) {
    if (!target || !this.controller) return false;
    if (target.kind === 'col') return this.controller.dropOnCascade(target.index);
    if (target.kind === 'fc') return this.controller.dropOnFreecell(target.index);
    if (target.kind === 'found') return this.controller.dropOnFoundation(target.index);
    return false;
  },

  _shakeDrop(target) {
    if (!target) return;
    if (target.kind === 'col') this.shakeCascade(target.index);
    else if (target.kind === 'fc') this.shakeFreecell(target.index);
    else if (target.kind === 'found') {
      const el = this.els.foundations[target.index];
      if (!el) return;
      el.classList.remove('shake');
      // eslint-disable-next-line no-unused-expressions
      void el.offsetWidth;
      el.classList.add('shake');
    }
  },

  // ---- modals / chrome ---------------------------------------------------

  showModal(id) {
    document.getElementById(id).classList.remove('hidden');
  },
  hideModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  setMode(mode) {
    this.els.modeTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
  },

  setLoading(visible, text) {
    if (text) this.els.loadingText.textContent = text;
    this.els.loading.classList.toggle('hidden', !visible);
  },

  toast(message) {
    const el = this.els.toast;
    el.textContent = message;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 250);
    }, 1800);
  },

  cardFrontEl(card) {
    const wrap = document.createElement('div');
    wrap.className = 'card face-up';
    wrap.dataset.cardId = card.id;
    const img = document.createElement('img');
    img.src = `assets/cards/${Cards.cardImageFile(card)}`;
    img.alt = `${Cards.cardLabel(card)} of ${card.suit}`;
    img.draggable = false;
    img.className = 'card-face';
    wrap.appendChild(img);
    return wrap;
  },

  // ---- full board render -------------------------------------------------

  renderTopStrip(game, stats, context) {
    const label = context.isToday
      ? "Today's Challenge"
      : context.mode === 'practice'
        ? 'Practice Round'
        : context.date;
    this.els.dateLabel.textContent = label;
    this.els.streakValue.textContent = stats ? stats.currentStreak : 0;
    this.els.homeValue.textContent = `${game.cardsHome()}/52`;
    this.els.movesValue.textContent = game.moves;
  },

  renderCascades(game) {
    const sampleWidth = this.els.columns[0].getBoundingClientRect().width || 42;
    const cardHeight = sampleWidth * (768 / 512);
    const fanGap = Math.max(14, cardHeight * 0.22);
    const maxCards = Math.max(7, ...game.cascades.map((c) => c.length));
    const columnHeight = fanGap * Math.max(0, maxCards - 1) + cardHeight + 4;

    this.els.columns.forEach((colEl, col) => {
      colEl.innerHTML = '';
      colEl.style.height = `${columnHeight}px`;
      const cards = game.cascades[col];
      const seq = DealGen.sequenceLength(cards);
      const sel = game.selection;
      const selectedHere = sel && sel.type === 'col' && sel.index === col;

      for (let i = 0; i < cards.length; i++) {
        const el = this.cardFrontEl(cards[i]);
        el.style.top = `${i * fanGap}px`;
        el.style.zIndex = String(i + 1);
        const fromTop = cards.length - i;
        if (fromTop <= seq) {
          el.classList.add('playable');
          el.dataset.seqFromTop = String(fromTop);
        } else {
          el.classList.add('buried');
        }
        if (selectedHere && fromTop <= sel.count) {
          el.classList.add('selected');
        }
        colEl.appendChild(el);
      }
      colEl.classList.toggle('empty', cards.length === 0);
    });
  },

  renderSlots(game) {
    this.els.freecells.forEach((el, i) => {
      el.innerHTML = '';
      const card = game.freecells[i];
      el.classList.toggle('empty', !card);
      el.classList.toggle(
        'selected',
        !!(game.selection && game.selection.type === 'fc' && game.selection.index === i),
      );
      if (card) {
        const img = this.cardFrontEl(card);
        img.classList.add('playable', 'slot-card');
        el.appendChild(img);
      }
    });

    this.els.foundations.forEach((el, i) => {
      el.innerHTML = '';
      const top = game.foundationTops[i];
      el.classList.toggle('empty', !top);
      if (top) {
        const img = this.cardFrontEl(top);
        img.classList.add('slot-card');
        el.appendChild(img);
      } else {
        const ghost = document.createElement('div');
        ghost.className = 'foundation-ghost';
        ghost.textContent = Cards.SUIT_SYMBOL[Cards.SUITS[i]];
        ghost.classList.toggle('red', Cards.SUIT_RED[Cards.SUITS[i]]);
        el.appendChild(ghost);
      }
    });
  },

  render(game, stats, context) {
    // Never stomp the board mid-drag — the ghost owns the visual.
    if (this._drag) return;
    this.renderTopStrip(game, stats, context);
    this.renderCascades(game);
    this.renderSlots(game);
    this.els.undoBtn.classList.toggle('disabled', game.history.length === 0 || game.status !== 'playing');
    this.els.hintBtn.classList.toggle('disabled', game.status !== 'playing');
  },

  rectOf(el) {
    return el.getBoundingClientRect();
  },

  shakeCascade(col) {
    const colEl = this.els.columns[col];
    if (!colEl) return;
    colEl.classList.remove('shake');
    // eslint-disable-next-line no-unused-expressions
    void colEl.offsetWidth;
    colEl.classList.add('shake');
  },

  shakeFreecell(fc) {
    const el = this.els.freecells[fc];
    if (!el) return;
    el.classList.remove('shake');
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth;
    el.classList.add('shake');
  },

  _positionFixed(el, rect) {
    el.style.position = 'fixed';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    el.style.margin = '0';
  },

  flyCard(card, fromRect, toEl) {
    if (!fromRect || !toEl) return;
    const destRect = this.rectOf(toEl);
    const img = this.cardFrontEl(card);
    img.classList.add('flying-card');
    this._positionFixed(img, fromRect);
    document.body.appendChild(img);
    requestAnimationFrame(() => {
      img.style.transition = 'transform .28s cubic-bezier(.22,.85,.35,1)';
      const dx = destRect.left + destRect.width / 2 - (fromRect.left + fromRect.width / 2);
      const dy = destRect.top + destRect.height / 2 - (fromRect.top + fromRect.height / 2);
      const scale = destRect.width / Math.max(1, fromRect.width);
      img.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    });
    img.addEventListener('transitionend', () => img.remove(), { once: true });
  },

  cascadeTopEl(col) {
    return this.els.columns[col].lastElementChild;
  },

  freecellEl(fc) {
    return this.els.freecells[fc];
  },

  foundationEl(i) {
    return this.els.foundations[i];
  },

  animateDealIn(game) {
    const originEl = this.els.freecells[0] || this.els.columns[0];
    const origin = this.rectOf(originEl);
    let delay = 0;
    for (let col = 0; col < 8; col++) {
      const cards = game.cascades[col];
      for (let row = 0; row < cards.length; row++) {
        const colEl = this.els.columns[col];
        const cardEl = colEl.children[row];
        if (!cardEl) continue;
        const destRect = this.rectOf(cardEl);
        cardEl.style.visibility = 'hidden';
        const clone = this.cardFrontEl(cards[row]);
        clone.classList.add('flying-card');
        this._positionFixed(clone, origin);
        clone.style.opacity = '0.001';
        document.body.appendChild(clone);
        const d = delay;
        setTimeout(() => {
          clone.style.opacity = '1';
          clone.style.transition = 'transform .34s cubic-bezier(.22,.85,.35,1)';
          const dx = destRect.left - origin.left;
          const dy = destRect.top - origin.top;
          clone.style.transform = `translate(${dx}px, ${dy}px)`;
          clone.addEventListener(
            'transitionend',
            () => {
              clone.remove();
              cardEl.style.visibility = 'visible';
            },
            { once: true },
          );
        }, d);
        delay += 18;
      }
    }
  },

  highlightHint(move) {
    const glow = (el) => {
      if (!el) return;
      el.classList.add('hint-glow');
      setTimeout(() => el.classList.remove('hint-glow'), 1500);
    };
    if (!move) return;
    if (move.type === 'col-to-found' || move.type === 'col-to-fc' || move.type === 'col-to-col') {
      const col = move.col !== undefined ? move.col : move.src;
      glow(this.cascadeTopEl(col));
      if (move.type === 'col-to-col') glow(this.els.columns[move.dest]);
      if (move.type === 'col-to-found') {
        const si = Cards.suitIndex(move.card.suit);
        glow(this.foundationEl(si));
      }
      if (move.type === 'col-to-fc') glow(this.freecellEl(move.fc));
    } else if (move.type === 'fc-to-found' || move.type === 'fc-to-col') {
      glow(this.freecellEl(move.fc));
      if (move.type === 'fc-to-col') glow(this.els.columns[move.dest]);
      if (move.type === 'fc-to-found') {
        const si = Cards.suitIndex(move.card.suit);
        glow(this.foundationEl(si));
      }
    }
  },

  showWin(record, streak, isToday) {
    document.getElementById('win-summary').textContent = isToday
      ? "You've cleared today's FreeCell!"
      : 'Archive round cleared!';
    document.getElementById('win-moves').textContent = record.moves;
    document.getElementById('win-time').textContent = this.formatTime(record.elapsedMs);
    document.getElementById('win-hints').textContent = record.hintsUsed;
    document.getElementById('win-streak-value').textContent = streak;
    document.querySelector('.win-streak').style.display = isToday ? '' : 'none';
    this.showModal('overlay-win');
    Confetti.burst();
  },

  showStuck(record) {
    const left = record.cardsRemaining;
    document.getElementById('stuck-summary').textContent =
      `${left} card${left === 1 ? '' : 's'} still out. Undo a few moves or restart the deal.`;
    this.showModal('overlay-stuck');
  },

  renderStats(stats) {
    document.getElementById('s-played').textContent = stats.played;
    const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    document.getElementById('s-winpct').textContent = `${pct}%`;
    document.getElementById('s-streak').textContent = stats.currentStreak;
    document.getElementById('s-best').textContent = stats.bestStreak;
    this.showModal('overlay-stats');
  },

  formatTime(ms) {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  setThemeLabel(theme) {
    document.getElementById('theme-label').textContent = theme === 'emerald' ? 'Emerald' : 'Midnight';
  },

  renderCalendar(year, month, completions, todayStr) {
    document.getElementById('cal-title').textContent = new Date(year, month, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d) => {
      const h = document.createElement('div');
      h.className = 'cal-dow';
      h.textContent = d;
      grid.appendChild(h);
    });
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < startWeekday; i++) {
      grid.appendChild(document.createElement('div'));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('button');
      cell.className = 'cal-cell';
      cell.innerHTML = `<span class="cal-day">${day}</span>`;
      const isFuture = dateStr > todayStr;
      if (isFuture) {
        cell.classList.add('future');
        cell.disabled = true;
      } else {
        const comp = completions[dateStr];
        if (comp) {
          cell.classList.add(comp.status === 'won' ? 'won' : 'stuck');
          cell.innerHTML += `<span class="cal-badge">${comp.status === 'won' ? '\u2713' : '\u2715'}</span>`;
        }
        if (dateStr === todayStr) cell.classList.add('today');
        cell.addEventListener('click', () => this.controller.onArchiveDateChosen(dateStr));
      }
      grid.appendChild(cell);
    }
  },
};

window.UI = UI;
