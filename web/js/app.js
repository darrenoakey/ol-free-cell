// app.js — bootstraps the app and is the UI's controller: owns the live
// FreeCellGame, wires player actions to game rules + storage, no rendering.
'use strict';

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function setupOrientationLock() {
  const isCapacitor = window.Capacitor !== undefined;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isCapacitor || isIOS) {
    document.body.classList.add('native-ios');
  }
  function updateOrientation() {
    document.body.classList.remove('landscape-left', 'landscape-right');
    const angle = screen.orientation ? screen.orientation.angle : window.orientation || 0;
    if (window.innerWidth > window.innerHeight) {
      document.body.classList.add(angle === 90 || angle === -270 ? 'landscape-left' : 'landscape-right');
    }
  }
  window.addEventListener('orientationchange', () => setTimeout(updateOrientation, 100));
  window.addEventListener('resize', updateOrientation);
  updateOrientation();
}

const App = {
  game: null,
  context: { mode: 'daily', date: null, isToday: true },
  stats: null,
  settings: { theme: 'emerald', sound: true },
  _recordableOnFinish: true,
  calYear: 0,
  calMonth: 0,

  async init() {
    setupOrientationLock();
    UI.init(this);
    await Storage.init();
    this.settings = await GameStats.getSettings();
    const theme = this.settings.theme === 'midnight' ? 'midnight' : 'emerald';
    document.body.className = `theme-${theme}`;
    if (
      window.Capacitor ||
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ) {
      document.body.classList.add('native-ios');
    }
    Sound.enabled = this.settings.sound !== false;
    UI.setThemeLabel(theme);
    UI.setSoundLabel(Sound.enabled);
    this.stats = await GameStats.getStats();
    await this.enterDaily(Prng.todayDateString());
  },

  async enterDaily(dateStr) {
    const today = Prng.todayDateString();
    this.context = { mode: 'daily', date: dateStr, isToday: dateStr === today };
    UI.setMode('daily');
    UI.setLoading(true, this.context.isToday ? "Shuffling today's challenge\u2026" : `Shuffling ${dateStr}\u2026`);
    await nextFrame();

    const dealResult = DealGen.generateDeal(dateStr);
    if (!dealResult) {
      UI.setLoading(false);
      UI.toast('Could not prove a deal — try again');
      return;
    }
    this.game = new Game.FreeCellGame(dealResult);

    const completion = await GameStats.getCompletion(dateStr);
    this._recordableOnFinish = !completion;

    let animateDeal = true;
    if (!completion) {
      const progress = await GameStats.loadProgress(dateStr);
      if (progress) {
        this.game.restoreProgress(progress);
        animateDeal = false;
      }
    }

    UI.setLoading(false);
    UI.render(this.game, this.stats, this.context);
    if (completion) {
      const suffix = completion.status === 'won' ? ' \u00b7 Cleared \u2713' : ' \u00b7 Stuck';
      UI.els.dateLabel.textContent += suffix;
    }
    if (animateDeal) UI.animateDealIn(this.game);
  },

  async enterPractice(seed) {
    this.context = { mode: 'practice', date: null, isToday: false };
    UI.setMode('practice');
    UI.setLoading(true, 'Shuffling a practice round\u2026');
    await nextFrame();

    const s = seed || `practice-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const dealResult = DealGen.generateDeal(s);
    if (!dealResult) {
      UI.setLoading(false);
      UI.toast('Could not prove a deal — try again');
      return;
    }
    this.game = new Game.FreeCellGame(dealResult);
    this._recordableOnFinish = false;

    UI.setLoading(false);
    UI.render(this.game, this.stats, this.context);
    UI.animateDealIn(this.game);
  },

  // ---- player actions ----

  onCascadeClick(col, count) {
    if (!this.game || this.game.status !== 'playing') return;
    const g = this.game;
    const sel = g.selection;

    // Empty cascade as destination
    if (g.cascades[col].length === 0) {
      if (sel) {
        const move = g.dropOnCascade(col);
        if (move) {
          Sound.play();
          this._afterGameMove();
        } else {
          Sound.reject();
          UI.shakeCascade(col);
        }
      }
      return;
    }

    // Already selected this cascade → try quick-play (auto destination)
    if (sel && sel.type === 'col' && sel.index === col) {
      const move = g.quickPlayCascade(col);
      if (move) {
        Sound.play();
        this._afterGameMove();
      } else {
        g.clearSelection();
        UI.render(g, this.stats, this.context);
      }
      return;
    }

    // Selection exists on another source → try drop here
    if (sel) {
      const move = g.dropOnCascade(col);
      if (move) {
        Sound.play();
        this._afterGameMove();
        return;
      }
      // Illegal drop — reselect this cascade instead
    }

    // Select this cascade's sequence (from tapped card)
    if (g.selectCascade(col, count || 1)) {
      Sound.draw();
      UI.render(g, this.stats, this.context);
    }
  },

  onFreecellClick(fc) {
    if (!this.game || this.game.status !== 'playing') return;
    const g = this.game;
    const sel = g.selection;

    if (sel) {
      // Try drop onto this freecell
      if (!g.freecells[fc]) {
        const move = g.dropOnFreecell(fc);
        if (move) {
          Sound.play();
          this._afterGameMove();
          return;
        }
      }
      // Clicking occupied freecell while selected elsewhere → quick or reselect
      if (g.freecells[fc] && sel.type === 'fc' && sel.index === fc) {
        const move = g.quickPlayFreecell(fc);
        if (move) {
          Sound.play();
          this._afterGameMove();
        } else {
          g.clearSelection();
          UI.render(g, this.stats, this.context);
        }
        return;
      }
    }

    if (g.freecells[fc]) {
      if (sel && sel.type === 'fc' && sel.index === fc) {
        const move = g.quickPlayFreecell(fc);
        if (move) {
          Sound.play();
          this._afterGameMove();
        } else {
          g.clearSelection();
          UI.render(g, this.stats, this.context);
        }
      } else {
        g.selectFreecell(fc);
        Sound.draw();
        UI.render(g, this.stats, this.context);
      }
    } else if (sel) {
      const move = g.dropOnFreecell(fc);
      if (move) {
        Sound.play();
        this._afterGameMove();
      } else {
        Sound.reject();
        UI.shakeFreecell(fc);
      }
    }
  },

  onFoundationClick(suitIndex) {
    if (!this.game || this.game.status !== 'playing') return;
    const g = this.game;
    if (!g.selection) return;
    const move = g.dropOnFoundation(suitIndex);
    if (move) {
      Sound.play();
      this._afterGameMove();
    } else {
      Sound.reject();
    }
  },

  async onUndo() {
    if (!this.game || !this.game.undo()) return;
    Sound.undo();
    UI.render(this.game, this.stats, this.context);
    if (this.context.mode === 'daily') await GameStats.saveProgress(this.context.date, this.game);
  },

  onHint() {
    if (!this.game || this.game.status !== 'playing') return;
    UI.setLoading(true, 'Finding a winning line\u2026');
    // Yield so the spinner paints; solver can take a beat.
    setTimeout(() => {
      const move = this.game.hint();
      UI.setLoading(false);
      if (!move) {
        Sound.reject();
        UI.toast('No forced win from here \u2014 try Undo');
        return;
      }
      Sound.hint();
      UI.highlightHint(move);
    }, 30);
  },

  async onNewGameRequested() {
    if (this.context.mode === 'practice') {
      await this.enterPractice();
      return;
    }
    await GameStats.clearProgress(this.context.date);
    await this.enterDaily(this.context.date);
  },

  async onModeChange(mode) {
    if (mode === 'daily') {
      const today = Prng.todayDateString();
      if (this.context.mode === 'daily' && this.context.date === today) return;
      await this.enterDaily(today);
    } else if (this.context.mode !== 'practice') {
      await this.enterPractice();
    }
  },

  async onStatsRequested() {
    this.stats = await GameStats.getStats();
    UI.renderStats(this.stats);
  },

  async onArchiveRequested() {
    const today = Prng.todayDateString();
    const base = this.context.mode === 'daily' && this.context.date ? this.context.date : today;
    const [y, m] = base.split('-').map(Number);
    this.calYear = y;
    this.calMonth = m - 1;
    await this._renderCalendar();
    UI.showModal('overlay-calendar');
  },

  async onCalendarShift(delta) {
    this.calMonth += delta;
    if (this.calMonth < 0) {
      this.calMonth = 11;
      this.calYear--;
    } else if (this.calMonth > 11) {
      this.calMonth = 0;
      this.calYear++;
    }
    await this._renderCalendar();
  },

  async _renderCalendar() {
    const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();
    const completions = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${this.calYear}-${String(this.calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      // eslint-disable-next-line no-await-in-loop
      const c = await GameStats.getCompletion(ds);
      if (c) completions[ds] = c;
    }
    UI.renderCalendar(this.calYear, this.calMonth, completions, Prng.todayDateString());
  },

  async onArchiveDateChosen(dateStr) {
    UI.hideModal('overlay-calendar');
    await this.enterDaily(dateStr);
  },

  async onThemeToggle() {
    this.settings.theme = this.settings.theme === 'emerald' ? 'midnight' : 'emerald';
    document.body.classList.remove('theme-emerald', 'theme-midnight');
    document.body.classList.add(`theme-${this.settings.theme}`);
    UI.setThemeLabel(this.settings.theme);
    await GameStats.setSettings(this.settings);
  },

  async onSoundToggle() {
    Sound.enabled = !Sound.enabled;
    this.settings.sound = Sound.enabled;
    UI.setSoundLabel(Sound.enabled);
    await GameStats.setSettings(this.settings);
  },

  onWinClosed() {
    UI.hideModal('overlay-win');
  },

  async onStuckRetry() {
    UI.hideModal('overlay-stuck');
    if (this.context.mode === 'daily') {
      await GameStats.clearProgress(this.context.date);
      await this.enterDaily(this.context.date);
    } else {
      await this.enterPractice();
    }
  },

  async onWinReplay() {
    UI.hideModal('overlay-win');
    if (this.context.mode === 'daily') {
      await GameStats.clearProgress(this.context.date);
      await this.enterDaily(this.context.date);
    } else {
      await this.enterPractice();
    }
  },

  async _afterGameMove() {
    UI.render(this.game, this.stats, this.context);
    if (this.game.status === 'playing') {
      if (this.context.mode === 'daily') await GameStats.saveProgress(this.context.date, this.game);
      return;
    }

    if (this.context.mode === 'daily' && this._recordableOnFinish) {
      this._recordableOnFinish = false;
      const { record, stats } = await GameStats.recordCompletion(this.context.date, this.game);
      this.stats = stats;
      UI.renderTopStrip(this.game, this.stats, this.context);
      if (this.game.status === 'won') {
        Sound.win();
        UI.showWin(record, stats.currentStreak, this.context.isToday);
      } else {
        Sound.stuck();
        UI.showStuck({ ...record, cardsRemaining: this.game.cardsRemaining() });
      }
    } else {
      const record = {
        moves: this.game.moves,
        hintsUsed: this.game.hintsUsed,
        elapsedMs: this.game.elapsedMs(),
      };
      if (this.game.status === 'won') {
        Sound.win();
        UI.showWin(record, this.stats.currentStreak, false);
      } else {
        Sound.stuck();
        UI.showStuck({ ...record, cardsRemaining: this.game.cardsRemaining() });
      }
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  document.getElementById('win-replay').addEventListener('click', () => App.onWinReplay());
});
