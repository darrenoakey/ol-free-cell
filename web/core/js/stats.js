// stats.js — pure statistics over daily history. No I/O, no DOM.
// Accepts a Spider day-map, a canonical document, or an array of records.
// Completed days drive streaks and times. Failed and attempted days stay in
// played / win-rate counts and are never thrown away.
(function (root) {
  'use strict';

  const Prng = root.OL.Prng;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function asMap(history) {
    if (!history) return {};
    if (Array.isArray(history)) {
      const map = {};
      for (const rec of history) {
        if (rec && rec.solved !== false && rec.date) map[rec.date] = rec;
      }
      return map;
    }
    if (Array.isArray(history.records)) return asMap(history.records);
    return history;
  }

  function counts(rec) {
    if (!rec || typeof rec !== 'object') return false;
    if (rec.status === 'failed' || rec.status === 'attempted') return false;
    if (rec.solved === false) return false;
    return true;
  }

  function datedEntries(history) {
    if (!history) return [];
    if (Array.isArray(history)) return history.filter((rec) => rec && rec.date);
    if (Array.isArray(history.records)) return history.records.filter((rec) => rec && rec.date);
    return Object.entries(history)
      .filter(([key, rec]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && rec && typeof rec === 'object')
      .map(([date, rec]) => ({ date, ...rec }));
  }

  function isFailed(rec) {
    return !!(rec && (rec.status === 'failed' || (rec.solved === false && rec.status !== 'attempted')));
  }

  function isAttempted(rec) {
    return !!(rec && rec.status === 'attempted');
  }

  function formatTime(ms) {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–';
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  function daysInMonth(y, m0) {
    return new Date(y, m0 + 1, 0).getDate();
  }

  function currentStreak(history, today) {
    const map = asMap(history);
    const todayRec = map[today];
    if (todayRec && !counts(todayRec)) return 0;
    let day = counts(todayRec) ? today : Prng.addDays(today, -1);
    let n = 0;
    while (counts(map[day])) {
      n++;
      day = Prng.addDays(day, -1);
    }
    return n;
  }

  function bestStreak(history) {
    const map = asMap(history);
    const days = Object.keys(map).filter((day) => counts(map[day])).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const d of days) {
      run = prev && Prng.daysBetween(prev, d) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return best;
  }

  function timeSummary(records) {
    const times = records.map((r) => r.ms).filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
    if (times.length === 0) return { count: 0, avg: null, min: null, max: null, median: null };
    const sum = times.reduce((a, b) => a + b, 0);
    const mid = times.length >> 1;
    const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
    return { count: times.length, avg: sum / times.length, min: times[0], max: times[times.length - 1], median };
  }

  function periodCounts(entries, today) {
    const weekStart = Prng.weekStart(today);
    const windows = {
      week: (rec) => rec.date >= weekStart && rec.date <= today,
      month: (rec) => rec.date.startsWith(today.slice(0, 7)),
      year: (rec) => rec.date.startsWith(today.slice(0, 4)),
      all: () => true,
    };
    const out = {};
    for (const [name, match] of Object.entries(windows)) {
      const rows = entries.filter(match);
      const wins = rows.filter(counts).length;
      const failed = rows.filter(isFailed).length;
      const attempted = rows.filter(isAttempted).length;
      const played = wins + failed + attempted;
      const times = rows.filter((rec) => counts(rec) && Number.isFinite(rec.ms)).map((rec) => rec.ms);
      out[name] = {
        played,
        wins,
        failed,
        winRate: played ? Math.round((wins / played) * 100) : 0,
        avg: times.length ? times.reduce((sum, ms) => sum + ms, 0) / times.length : null,
        best: times.length ? Math.min(...times) : null,
      };
    }
    return out;
  }

  function compute(history, today, legacyTotals) {
    const map = asMap(history);
    const days = Object.keys(map).filter((day) => counts(map[day])).sort();
    const records = days.map((d) => ({ date: d, ...map[d] }));
    const t = Prng.parseKey(today);
    const y = t.getFullYear();
    const m0 = t.getMonth();
    const monthPrefix = today.slice(0, 7);
    const weekStart = Prng.weekStart(today);

    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const start = Prng.addDays(weekStart, -7 * i);
      const end = Prng.addDays(start, 6);
      const count = days.filter((d) => d >= start && d <= end).length;
      weeks.push({ start, count, possible: 7 });
    }

    const months = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(y, m0 - i, 1);
      const prefix = Prng.dateKey(dt).slice(0, 7);
      months.push({
        key: prefix,
        label: MONTHS[dt.getMonth()],
        count: days.filter((d) => d.startsWith(prefix)).length,
        possible: daysInMonth(dt.getFullYear(), dt.getMonth()),
      });
    }

    const last = records.length ? records[records.length - 1] : null;
    const thisMonth = records.filter((r) => r.date.startsWith(monthPrefix));
    const result = {
      total: records.length,
      currentStreak: currentStreak(map, today),
      bestStreak: bestStreak(map),
      thisWeek: days.filter((d) => d >= weekStart && d <= today).length,
      thisWeekPossible: Prng.daysBetween(weekStart, today) + 1,
      thisMonth: thisMonth.length,
      thisMonthPossible: t.getDate(),
      thisYear: days.filter((d) => d.startsWith(String(y))).length,
      times: timeSummary(records),
      monthTimes: timeSummary(thisMonth),
      lastTime: last && Number.isFinite(last.ms) ? last.ms : null,
      recent: records.slice(-30).map((r) => ({ date: r.date, ms: r.ms })),
      weeks,
      months,
      legacyTotals: legacyTotals || (history && history.legacyTotals) || null,
    };
    const totals = result.legacyTotals;
    if (totals && typeof totals === 'object') {
      if (Number.isFinite(totals.solved)) result.total += totals.solved;
      if (Number.isFinite(totals.bestStreak)) result.bestStreak = Math.max(result.bestStreak, totals.bestStreak);
      if (days.length === 0 && Number.isFinite(totals.currentStreak)) result.currentStreak = totals.currentStreak;
    }
    const entries = datedEntries(history);
    result.failed = entries.filter(isFailed).length;
    result.attempted = entries.filter(isAttempted).length;
    result.wins = result.total;
    result.played = result.wins + result.failed + result.attempted;
    result.winRate = result.played ? Math.round((result.wins / result.played) * 100) : 0;
    result.periods = periodCounts(entries, today);
    result.entries = entries;
    return result;
  }

  root.OL.Stats = {
    compute, formatTime, timeSummary, currentStreak, bestStreak, daysInMonth, MONTHS, asMap,
    counts, datedEntries, periodCounts,
  };
})(globalThis);
