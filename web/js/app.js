// app.js — bootstraps the app and is the UI's controller: owns the live
// FreeCellGame, wires player actions to game rules + storage, no rendering.
// Moves are drag-and-drop only (see ui.js pointer handlers).
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
  settings: { theme: 'emerald' },
  _recordableOnFinish: true,
  calYear: 0,
  calMonth: 0,

  async init() {
    setupOrientationLock();
    UI.init(this);
    await Storage.init();
    this.settings = await GameStats.getSettings();
    const theme = this.settings.theme === 'midnight' ? 'midnight' : 'emerald';
    this.settings = { theme };
    document.body.className = `theme-${theme}`;
    // setupOrientationLock() already stamps native-ios on real iOS/Capacitor.
    UI.setThemeLabel(theme);
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

  // ---- drag API (called by ui.js) ----------------------------------------

  canInteract() {
    return !!(this.game && this.game.status === 'playing');
  },

  beginDragCascade(col, count) {
    if (!this.canInteract()) return false;
    return this.game.selectCascade(col, count || 1);
  },

  beginDragFreecell(fc) {
    if (!this.canInteract()) return false;
    return this.game.selectFreecell(fc);
  },

  cancelDrag() {
    if (!this.game) return;
    this.game.clearSelection();
    UI.render(this.game, this.stats, this.context);
  },

  refreshAfterSelect() {
    if (!this.game) return;
    UI.render(this.game, this.stats, this.context);
  },

  dropOnCascade(dest) {
    if (!this.canInteract()) return false;
    const move = this.game.dropOnCascade(dest);
    if (move) {
      this._afterGameMove();
      return true;
    }
    UI.shakeCascade(dest);
    return false;
  },

  dropOnFreecell(fc) {
    if (!this.canInteract()) return false;
    const move = this.game.dropOnFreecell(fc);
    if (move) {
      this._afterGameMove();
      return true;
    }
    UI.shakeFreecell(fc);
    return false;
  },

  dropOnFoundation(suitIndex) {
    if (!this.canInteract()) return false;
    const move = this.game.dropOnFoundation(suitIndex);
    if (move) {
      this._afterGameMove();
      return true;
    }
    return false;
  },

  // ---- chrome actions ----------------------------------------------------

  async onUndo() {
    if (!this.game || !this.game.undo()) return;
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
        UI.toast('No forced win from here \u2014 try Undo');
        return;
      }
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
    await GameStats.setSettings({ theme: this.settings.theme });
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
        UI.showWin(record, stats.currentStreak, this.context.isToday);
      } else {
        UI.showStuck({ ...record, cardsRemaining: this.game.cardsRemaining() });
      }
    } else {
      const record = {
        moves: this.game.moves,
        hintsUsed: this.game.hintsUsed,
        elapsedMs: this.game.elapsedMs(),
      };
      if (this.game.status === 'won') {
        UI.showWin(record, this.stats.currentStreak, false);
      } else {
        UI.showStuck({ ...record, cardsRemaining: this.game.cardsRemaining() });
      }
    }
  },
};
window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  document.getElementById('win-replay').addEventListener('click', () => App.onWinReplay());
});
