// storage.js — Capacitor Preferences (iCloud-synced key/value) with a
// localStorage fallback for the browser. All access is async.
'use strict';

const Storage = {
  _native: false,

  async init() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
      this._native = true;
      const migrated = await this._getItem('__migrated');
      if (!migrated) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          // eslint-disable-next-line no-await-in-loop
          await this._setItem(key, localStorage.getItem(key));
        }
        await this._setItem('__migrated', 'true');
      }
    }
  },

  async _getItem(key) {
    if (this._native) {
      const { value } = await window.Capacitor.Plugins.Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  },

  async _setItem(key, value) {
    if (this._native) {
      await window.Capacitor.Plugins.Preferences.set({ key, value });
    } else {
      localStorage.setItem(key, value);
    }
  },

  async _removeItem(key) {
    if (this._native) {
      await window.Capacitor.Plugins.Preferences.remove({ key });
    } else {
      localStorage.removeItem(key);
    }
  },

  async getJSON(key, fallback) {
    const raw = await this._getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },

  async setJSON(key, value) {
    await this._setItem(key, JSON.stringify(value));
  },

  async remove(key) {
    await this._removeItem(key);
  },
};

const STATS_KEY = 'olfreecell.stats';
const SETTINGS_KEY = 'olfreecell.settings';
const completionKey = (dateString) => `olfreecell.completed.${dateString}`;
const progressKey = (dateString) => `olfreecell.progress.${dateString}`;

const DEFAULT_STATS = {
  played: 0,
  won: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastWonDate: null,
};

/** Everything durable about the daily-challenge meta-game. */
const GameStats = {
  async getStats() {
    return Storage.getJSON(STATS_KEY, DEFAULT_STATS);
  },

  async getCompletion(dateString) {
    return Storage.getJSON(completionKey(dateString), null);
  },

  async recordCompletion(dateString, game) {
    const record = {
      status: game.status,
      moves: game.moves,
      hintsUsed: game.hintsUsed,
      elapsedMs: game.elapsedMs(),
      finishedAt: game.finishedAt,
    };
    await Storage.setJSON(completionKey(dateString), record);
    await Storage.remove(progressKey(dateString));

    const stats = await this.getStats();
    stats.played++;
    if (game.status === 'won') {
      stats.won++;
      const yesterday = Prng.addDays(dateString, -1);
      const wonYesterday = stats.lastWonDate === yesterday;
      stats.currentStreak = wonYesterday ? stats.currentStreak + 1 : 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      stats.lastWonDate = dateString;
    } else {
      stats.currentStreak = 0;
    }
    await Storage.setJSON(STATS_KEY, stats);
    return { record, stats };
  },

  async saveProgress(dateString, game) {
    await Storage.setJSON(progressKey(dateString), {
      cascades: game.cascades,
      freecells: game.freecells,
      foundations: game.foundations,
      foundationTops: game.foundationTops,
      moves: game.moves,
      hintsUsed: game.hintsUsed,
      startedAt: game.startedAt,
      status: game.status,
    });
  },

  async loadProgress(dateString) {
    return Storage.getJSON(progressKey(dateString), null);
  },

  async clearProgress(dateString) {
    await Storage.remove(progressKey(dateString));
  },

  async getSettings() {
    return Storage.getJSON(SETTINGS_KEY, { theme: 'emerald' });
  },

  async setSettings(settings) {
    await Storage.setJSON(SETTINGS_KEY, settings);
  },
};
