// ui.js — DOM rendering + animation. Owns no game rules; calls back into app.js.
'use strict';

const UI = {
  els: {},
  controller: null,
  _lastTap: null,

  init(controller) {
    this.controller = controller;
    const $ = (id) => document.getElementById(id);
    this.els = {
      dateLabel: $('date-label'),
      streakValue: $('streak-value'),
      homeValue: $('home-value'),
      movesValue: $('moves-value'),
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
    this.els.columns.forEach((col) => {
      col.addEventListener('click', (e) => {
        const cardEl = e.target.closest('.card');
        let count = 1;
        if (cardEl && cardEl.dataset.seqFromTop) {
          count = Number(cardEl.dataset.seqFromTop) || 1;
        }
        c.onCascadeClick(Number(col.dataset.col), count);
      });
    });
    this.els.freecells.forEach((fc) => {
      fc.addEventListener('click', () => c.onFreecellClick(Number(fc.dataset.fc)));
    });
    this.els.foundations.forEach((f) => {
      f.addEventListener('click', () => c.onFoundationClick(Number(f.dataset.found)));
    });
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
    document.getElementById('menu-sound').addEventListener('click', () => c.onSoundToggle());
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
    const img = document.createElement('img');
    img.className = 'card face-up';
    img.src = `assets/cards/${Cards.cardImageFile(card)}`;
    img.alt = `${Cards.cardLabel(card)} of ${card.suit}`;
    img.draggable = false;
    img.dataset.cardId = card.id;
    return img;
  },

  // ---- full board render ----

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
      colEl.classList.toggle('drop-target', !!(sel && cards.length === 0));
    });
  },

  renderSlots(game) {
    this.els.freecells.forEach((el, i) => {
      el.innerHTML = '';
      const card = game.freecells[i];
      el.classList.toggle('empty', !card);
      el.classList.toggle('selected', !!(game.selection && game.selection.type === 'fc' && game.selection.index === i));
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
    colEl.classList.remove('shake');
    // eslint-disable-next-line no-unused-expressions
    void colEl.offsetWidth;
    colEl.classList.add('shake');
  },

  shakeFreecell(fc) {
    const el = this.els.freecells[fc];
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
  setSoundLabel(on) {
    document.getElementById('sound-label').textContent = on ? 'On' : 'Off';
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
