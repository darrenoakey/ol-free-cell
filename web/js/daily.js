// daily.js — the rules that decide when a daily is over. Pure: no DOM, no
// storage, and no clock except the local calendar behind OL.Prng.
(function (root) {
  'use strict';

  /** A record that closes its day for good. Failed and attempted days do not. */
  function isSolved(record) {
    return !!record && record.solved !== false && record.status !== 'failed' && record.status !== 'attempted';
  }

  /** 11:59:59 of a local day: one second before the next local midnight. */
  function deadline(date) {
    return root.OL.Prng.parseKey(root.OL.Prng.addDays(date, 1)).getTime() - 1000;
  }

  /**
   * Whether saved progress is a daily played on its own day. Older builds
   * also saved archive replays under the past date; those began after the
   * day ended, so they never count as starting it.
   */
  function startedInTime(date, progress) {
    if (!progress || progress.status !== 'playing') return false;
    return !Number.isFinite(progress.startedAt) || progress.startedAt <= deadline(date);
  }

  /** The bad-luck result for a started daily, timed at its own deadline. */
  function failure(date, progress) {
    const finishedAt = deadline(date);
    return {
      date,
      solved: false,
      status: 'failed',
      ms: Number.isFinite(progress.startedAt) ? Math.max(0, finishedAt - progress.startedAt) : 0,
      moves: progress.moves || 0,
      hints: progress.hintsUsed || 0,
      undos: progress.undos || 0,
      restarts: progress.restarts || 0,
      extra: { expired: true, finishedAt },
    };
  }

  root.FreeCellDaily = { isSolved, deadline, startedInTime, failure };
})(globalThis);
