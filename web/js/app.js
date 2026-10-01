// app.js — bootstraps the app and is the UI's controller: owns the live
// FreeCellGame, wires player actions to game rules + storage, no rendering.
// Moves are drag-and-drop only (see ui.js pointer handlers).
'use strict';

const APP_ID = 'ol-free-cell';
const DESCRIPTOR = {
  id: APP_ID,
  name: 'FreeCell',
  hasDaily: true,
  hasCards: true,
  metrics: ['time', 'streak', 'solved'],
  signatureTheme: 'emerald',
  solvedMark: 'dot',
};
const PROGRESS_PREFIX = 'olfreecell.progress.';
const SETTINGS_KEY = 'olfreecell.settings';

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function $(id) {
  return document.getElementById(id);
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
  historyDoc: null,
  settings: { theme: 'emerald' },
  look: { theme: 'emerald', cards: 'classic', finish: 'natural' },
  _recordableOnFinish: true,
  calMonth: null,
  calendarPlay: false,
  selectedDate: null,
  undos: 0,
  restarts: 0,

  async init() {
    setupOrientationLock();
    UI.init(this);
    OL.Cards.installDefs();
    OL.History.registerMigrator(APP_ID, FreeCellMigrate.migrateFreeCell);
    const gathered = await FreeCellMigrate.gatherFromStore();
    const historyKey = OL.History.key(APP_ID);
    if (!(await OL.Store.get(historyKey)) && gathered.hasLegacy) {
      await OL.Store.set(historyKey, JSON.stringify(gathered.blob));
    }
    this.historyDoc = await OL.History.migrate(APP_ID);
    await this.loadLook(gathered.blob && gathered.blob.settings);
    this.stats = this.computeStats();
    this._wireSheets();
    await this.enterDaily(Prng.todayDateString());
  },

  computeStats() {
    const today = Prng.todayDateString();
    return OL.Stats.compute(this.historyDoc, today);
  },

  dayMap() {
    return OL.History.toDayMap(this.historyDoc);
  },

  recordFor(dateStr) {
    return (this.historyDoc.records || []).find((rec) => rec.date === dateStr) || null;
  },

  async loadLook(legacySettings) {
    let theme = await OL.Store.get(OL.Store.key(APP_ID, 'table'));
    let cards = await OL.Store.get(OL.Store.key(APP_ID, 'cards'));
    let finish = await OL.Store.get(OL.Store.key(APP_ID, 'finish'));
    if (!theme) {
      const saved = legacySettings || (await OL.Store.getJSON(SETTINGS_KEY, null));
      theme = saved && (saved.theme === 'midnight' || saved.theme === 'emerald') ? saved.theme : 'emerald';
    }
    if (!cards) cards = 'classic';
    if (!finish) finish = 'natural';
    this.applyLook(theme, cards, finish);
  },

  applyLook(themeId, cardsId, finishId) {
    const theme = OL.Themes.BY_ID[themeId] ? themeId : 'emerald';
    const cards = OL.Cards.dress($('board'), cardsId, finishId);
    const finish = $('board').dataset.finish;
    OL.Themes.apply(theme);
    document.body.classList.remove('theme-emerald', 'theme-midnight', 'theme-ol');
    if (theme === 'emerald' || theme === 'midnight') document.body.classList.add(`theme-${theme}`);
    else document.body.classList.add('theme-ol');
    this.look = { theme, cards, finish };
    this.settings = { theme: theme === 'midnight' ? 'midnight' : 'emerald' };
    OL.Views.fillAppearance({
      themeList: $('theme-list'),
      finishList: $('finish-list'),
      cardList: $('card-list'),
      descriptor: DESCRIPTOR,
      current: this.look,
    });
    const summary = $('look-summary');
    if (summary) summary.textContent = OL.Views.summary(theme, cards, finish);
    UI.setThemeLabel(theme);
    return this.look;
  },

  async persistLook() {
    await OL.Store.set(OL.Store.key(APP_ID, 'table'), this.look.theme);
    await OL.Store.set(OL.Store.key(APP_ID, 'cards'), this.look.cards);
    await OL.Store.set(OL.Store.key(APP_ID, 'finish'), this.look.finish);
    if (this.look.theme === 'emerald' || this.look.theme === 'midnight') {
      await OL.Store.setJSON(SETTINGS_KEY, { theme: this.look.theme });
    }
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
    const existing = this.recordFor(dateStr);
    this._recordableOnFinish = !existing;
    this.undos = 0;
    this.restarts = 0;

    let animateDeal = true;
    if (!existing) {
      const progress = await OL.Store.getJSON(PROGRESS_PREFIX + dateStr, null);
      if (progress) {
        this.game.restoreProgress(progress);
        this.undos = progress.undos || 0;
        this.restarts = progress.restarts || 0;
        animateDeal = false;
      }
    }

    UI.setLoading(false);
    UI.render(this.game, this.stats, this.context);
    if (existing) {
      const suffix = existing.solved ? ' \u00b7 Cleared \u2713' : ' \u00b7 Stuck';
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
    this.undos = 0;
    this.restarts = 0;

    UI.setLoading(false);
    UI.render(this.game, this.stats, this.context);
    UI.animateDealIn(this.game);
  },

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

  async onUndo() {
    if (!this.game || !this.game.undo()) return;
    this.undos++;
    UI.render(this.game, this.stats, this.context);
    if (this.context.mode === 'daily') await this.saveProgress();
  },

  onHint() {
    if (!this.game || this.game.status !== 'playing') return;
    UI.setLoading(true, 'Finding a winning line\u2026');
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
    this.restarts++;
    await OL.Store.remove(PROGRESS_PREFIX + this.context.date);
    const restarts = this.restarts;
    await this.enterDaily(this.context.date);
    this.restarts = restarts;
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

  onStatsRequested() {
    this.stats = this.computeStats();
    OL.Views.renderStats($('stats-body'), this.stats, DESCRIPTOR);
    OL.Chrome.openSheet('sheet-stats');
  },

  onArchiveRequested() {
    this.openCalendar(true);
  },

  onCalendarRequested() {
    this.openCalendar(false);
  },

  openCalendar(playMode) {
    const today = Prng.todayDateString();
    const base = this.context.mode === 'daily' && this.context.date ? this.context.date : today;
    const parsed = OL.Prng.parseKey(base);
    this.calMonth = { y: parsed.getFullYear(), m0: parsed.getMonth() };
    this.calendarPlay = !!playMode;
    this.selectedDate = null;
    $('cal-play').classList.add('hidden');
    this.renderCalendar();
    OL.Chrome.openSheet('sheet-calendar');
  },

  renderCalendar() {
    const today = Prng.todayDateString();
    const title = OL.Views.renderCalendar($('cal-body'), {
      history: this.dayMap(),
      today,
      firstSeen: this.firstSeen(today),
      month: this.calMonth,
      todayOpen: !this.recordFor(today),
      solvedMark: 'dot',
    });
    $('cal-title').textContent = title;
    const t = OL.Prng.parseKey(today);
    const atCurrent = this.calMonth.y === t.getFullYear() && this.calMonth.m0 === t.getMonth();
    $('cal-next').disabled = atCurrent;
  },

  firstSeen(today) {
    const dates = (this.historyDoc.records || []).map((rec) => rec.date).sort();
    return dates[0] || today;
  },

  shiftMonth(delta) {
    const d = new Date(this.calMonth.y, this.calMonth.m0 + delta, 1);
    this.calMonth = { y: d.getFullYear(), m0: d.getMonth() };
    this.renderCalendar();
  },

  async onArchiveDateChosen(dateStr) {
    OL.Chrome.closeSheet('sheet-calendar');
    await this.enterDaily(dateStr);
  },

  async onThemeToggle() {
    const next = this.look.theme === 'emerald' ? 'midnight' : 'emerald';
    this.applyLook(next, this.look.cards, this.look.finish);
    await this.persistLook();
  },

  onWinClosed() {
    UI.hideModal('overlay-win');
  },

  async onStuckRetry() {
    UI.hideModal('overlay-stuck');
    if (this.context.mode === 'daily') {
      await OL.Store.remove(PROGRESS_PREFIX + this.context.date);
      await this.enterDaily(this.context.date);
    } else {
      await this.enterPractice();
    }
  },

  async onWinReplay() {
    UI.hideModal('overlay-win');
    if (this.context.mode === 'daily') {
      await OL.Store.remove(PROGRESS_PREFIX + this.context.date);
      await this.enterDaily(this.context.date);
    } else {
      await this.enterPractice();
    }
  },

  async saveProgress() {
    if (this.context.mode !== 'daily' || !this.game) return;
    await OL.Store.setJSON(PROGRESS_PREFIX + this.context.date, {
      cascades: this.game.cascades,
      freecells: this.game.freecells,
      foundations: this.game.foundations,
      foundationTops: this.game.foundationTops,
      moves: this.game.moves,
      hintsUsed: this.game.hintsUsed,
      startedAt: this.game.startedAt,
      status: this.game.status,
      undos: this.undos,
      restarts: this.restarts,
    });
  },

  async _afterGameMove() {
    UI.render(this.game, this.stats, this.context);
    if (this.game.status === 'playing') {
      if (this.context.mode === 'daily') await this.saveProgress();
      return;
    }

    if (this.context.mode === 'daily' && this._recordableOnFinish) {
      this._recordableOnFinish = false;
      const solved = this.game.status === 'won';
      this.historyDoc = await OL.History.record(APP_ID, {
        date: this.context.date,
        solved,
        ms: this.game.elapsedMs(),
        moves: this.game.moves,
        hints: this.game.hintsUsed,
        undos: this.undos,
        restarts: this.restarts,
        extra: { finishedAt: this.game.finishedAt, status: this.game.status },
      });
      await OL.Store.remove(PROGRESS_PREFIX + this.context.date);
      this.stats = this.computeStats();
      UI.renderTopStrip(this.game, this.stats, this.context);
      const record = {
        moves: this.game.moves,
        hintsUsed: this.game.hintsUsed,
        elapsedMs: this.game.elapsedMs(),
      };
      if (solved) UI.showWin(record, this.stats.currentStreak, this.context.isToday);
      else UI.showStuck({ ...record, cardsRemaining: this.game.cardsRemaining() });
    } else {
      const record = {
        moves: this.game.moves,
        hintsUsed: this.game.hintsUsed,
        elapsedMs: this.game.elapsedMs(),
      };
      if (this.game.status === 'won') UI.showWin(record, this.stats.currentStreak, false);
      else UI.showStuck({ ...record, cardsRemaining: this.game.cardsRemaining() });
    }
  },

  _wireSheets() {
    $('cal-btn').addEventListener('click', () => this.onCalendarRequested());
    $('statistics-btn').addEventListener('click', () => this.onStatsRequested());
    $('look-btn').addEventListener('click', () => {
      OL.Chrome.closeSheet('sheet-stats');
      OL.Chrome.openSheet('sheet-look');
    });
    $('help-btn').addEventListener('click', () => {
      OL.Chrome.closeSheet('sheet-stats');
      UI.showModal('overlay-rules');
    });
    $('cal-prev').addEventListener('click', () => this.shiftMonth(-1));
    $('cal-next').addEventListener('click', () => this.shiftMonth(1));
    $('cal-body').addEventListener('click', (event) => {
      const day = event.target.closest('.cal-day[data-date]');
      if (!day || day.classList.contains('future')) return;
      this.selectedDate = day.dataset.date;
      document.querySelectorAll('.cal-day.selected').forEach((el) => el.classList.remove('selected'));
      day.classList.add('selected');
      const detail = document.getElementById('cal-detail');
      if (detail) detail.innerHTML = OL.Views.dayDetail(this.dayMap(), day.dataset.date, Prng.todayDateString());
      const play = $('cal-play');
      play.classList.toggle('hidden', !this.calendarPlay);
      if (this.calendarPlay) this.onArchiveDateChosen(day.dataset.date);
    });
    $('cal-play').addEventListener('click', () => {
      if (this.selectedDate) this.onArchiveDateChosen(this.selectedDate);
    });
    $('theme-picker').addEventListener('click', (event) => {
      const btn = event.target.closest('.theme-pick');
      if (!btn || !OL.Themes.BY_ID[btn.dataset.theme]) return;
      this.applyLook(btn.dataset.theme, this.look.cards, this.look.finish);
      this.persistLook();
    });
    $('card-list').addEventListener('click', (event) => {
      const btn = event.target.closest('.look-pick');
      if (!btn || !OL.Cards.STYLE_BY_ID[btn.dataset.cards]) return;
      this.applyLook(this.look.theme, btn.dataset.cards, this.look.finish);
      this.persistLook();
    });
    $('finish-list').addEventListener('click', (event) => {
      const btn = event.target.closest('.finish-pick');
      if (!btn || !OL.Cards.FINISH_BY_ID[btn.dataset.finish]) return;
      this.applyLook(this.look.theme, this.look.cards, btn.dataset.finish);
      this.persistLook();
    });
    OL.Chrome.bindSheetDismiss(document);
  },
};
window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  document.getElementById('win-replay').addEventListener('click', () => App.onWinReplay());
});
