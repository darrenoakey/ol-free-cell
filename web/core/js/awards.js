// awards.js — awards derived from shared history. No separate save, no game loop.
// Add an entry here and every daily app that renders OL.Views shows it.
(function (root) {
  'use strict';

  const AWARDS = [
    { id: 'first-win', name: 'First win', detail: 'Complete a day', test: (stats) => stats.wins >= 1 || stats.total >= 1 },
    { id: 'ten-wins', name: 'Ten wins', detail: 'Complete ten days', test: (stats) => (stats.wins || stats.total) >= 10 },
    { id: 'streak-3', name: 'Three-day streak', detail: 'Three completed days in a row', test: (stats) => stats.bestStreak >= 3 },
    { id: 'streak-7', name: 'Week streak', detail: 'Seven completed days in a row', test: (stats) => stats.bestStreak >= 7 },
    { id: 'streak-30', name: 'Month streak', detail: 'Thirty completed days in a row', test: (stats) => stats.bestStreak >= 30 },
    {
      id: 'no-hint',
      name: 'No hints',
      detail: 'Complete a day without a hint',
      test: (_stats, entries) => entries.some((rec) => rec && rec.solved !== false && rec.status !== 'failed' && rec.hints === 0),
    },
  ];
  const BY_ID = Object.fromEntries(AWARDS.map((award) => [award.id, award]));

  function evaluate(stats, history) {
    const source = history || (stats && stats.entries) || stats;
    const entries = root.OL.Stats.datedEntries ? root.OL.Stats.datedEntries(source) : [];
    return AWARDS.map((award) => ({
      id: award.id,
      name: award.name,
      detail: award.detail,
      earned: !!award.test(stats, entries),
    }));
  }

  root.OL.Awards = { AWARDS, BY_ID, evaluate };
})(globalThis);
