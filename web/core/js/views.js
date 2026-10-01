// views.js — calendar, statistics and the appearance sheet.
// Driven by a game descriptor so controls that do not apply are never rendered.
(function (root) {
  'use strict';

  const Prng = root.OL.Prng;
  const Stats = root.OL.Stats;
  const Cards = root.OL.Cards;
  const Themes = root.OL.Themes;
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const WEB_ICON = '<svg class="cal-web" viewBox="0 0 100 100"><use href="#web-mark"/></svg>';
  const DOT = '<span class="cal-dot" aria-hidden="true"></span>';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function longDate(key) {
    const d = Prng.parseKey(key);
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function tile(value, label, gold) {
    return `<div class="tile${gold ? ' gold' : ''}"><span>${value}</span><label>${label}</label></div>`;
  }

  function markFor(solvedMark) {
    return solvedMark === 'dot' ? DOT : WEB_ICON;
  }

  function renderCalendar(body, { history, today, firstSeen, month, todayOpen, solvedMark }) {
    const { y, m0 } = month;
    const first = new Date(y, m0, 1);
    const lead = (first.getDay() + 6) % 7;
    const n = Stats.daysInMonth(y, m0);
    const prefix = Prng.dateKey(first).slice(0, 7);
    const mark = markFor(solvedMark);
    let html = '<div class="cal-grid">';
    for (const d of DOW) html += `<div class="cal-dow">${d}</div>`;
    for (let i = 0; i < lead; i++) html += '<div class="cal-day blank"></div>';
    for (let day = 1; day <= n; day++) {
      const key = `${prefix}-${String(day).padStart(2, '0')}`;
      const rec = history[key];
      const state = root.OL.History && root.OL.History.dayStatus
        ? root.OL.History.dayStatus(rec, key, today, firstSeen)
        : (rec ? 'solved' : (key > today ? 'future' : 'missed'));
      const cls = ['cal-day'];
      let extra = '';
      let label = `${longDate(key)}`;
      if (state === 'solved') {
        cls.push('solved');
        extra = `${mark}<span class="cal-time">${Stats.formatTime(rec.ms)}</span>`;
        label += `, solved in ${Stats.formatTime(rec.ms)}`;
      } else if (state === 'failed') {
        cls.push('failed');
        label += ', failed';
      } else if (state === 'attempted') {
        cls.push('attempted');
        label += ', in progress';
      } else if (state === 'future') {
        cls.push('future');
      } else if (state === 'missed') {
        cls.push('missed');
        label += ', not attempted';
      }
      if (key === today) {
        cls.push('today');
        if (state === 'open' && todayOpen) cls.push('open');
      }
      html += `<button class="${cls.join(' ')}" data-date="${key}" aria-label="${esc(label)}"><span>${day}</span>${extra}</button>`;
    }
    html += '</div>';

    const monthRecs = Object.keys(history).filter((k) => k.startsWith(prefix) && history[k] && history[k].status !== 'failed' && history[k].status !== 'attempted' && history[k].solved !== false).map((k) => history[k]);
    const times = Stats.timeSummary(monthRecs);
    const possible = prefix === today.slice(0, 7) ? Number(today.slice(8)) : (prefix < today ? n : 0);
    html += '<div class="cal-summary">' +
      tile(`${monthRecs.length}<small>/${possible || n}</small>`, 'Solved', true) +
      tile(Stats.formatTime(times.avg), 'Average') +
      tile(Stats.formatTime(times.min), 'Fastest') +
      '</div>';
    html += `<div class="cal-detail" id="cal-detail">${rootDetail(history, today, todayOpen)}</div>`;
    body.innerHTML = html;
    return `${MONTH_NAMES[m0]} ${y}`;
  }

  function rootDetail(history, today, todayOpen) {
    const rec = history[today];
    if (rec && rec.status !== 'failed' && rec.status !== 'attempted' && rec.solved !== false) {
      return `Today solved in <strong>${Stats.formatTime(rec.ms)}</strong>. See you tomorrow.`;
    }
    if (rec && rec.status === 'failed') return 'Today was not completed. The streak pauses here.';
    if (rec && rec.status === 'attempted') return 'Today is in progress.';
    return todayOpen ? 'Today&rsquo;s deal is waiting. Tap any gold day for its details.' : 'Tap any gold day for its details.';
  }

  function dayDetail(history, key, today) {
    const rec = history[key];
    if (rec && (rec.status === 'failed' || rec.solved === false)) {
      return `${esc(longDate(key))}<br>Not completed.`;
    }
    if (rec && rec.status === 'attempted') return `${esc(longDate(key))}<br>Started, not finished.`;
    if (rec) {
      const bits = [`<strong>${Stats.formatTime(rec.ms)}</strong>`];
      if (Number.isFinite(rec.moves)) bits.push(`${rec.moves} moves`);
      if (rec.restarts) bits.push(`${rec.restarts} restart${rec.restarts === 1 ? '' : 's'}`);
      if (rec.hints) bits.push(`${rec.hints} hint${rec.hints === 1 ? '' : 's'}`);
      return `${esc(longDate(key))}<br>${bits.join(' &middot; ')}`;
    }
    if (key === today) return `${esc(longDate(key))}<br>Still open &mdash; solve it before midnight.`;
    if (key > today) return `${esc(longDate(key))}<br>Not dealt yet.`;
    return `${esc(longDate(key))}<br>Not solved.`;
  }

  function barChart(items, { height = 110, labelEvery = 1 } = {}) {
    const n = items.length;
    const w = 320;
    const slot = w / n;
    const bw = Math.min(18, slot * 0.62);
    const max = Math.max(1, ...items.map((i) => i.possible));
    const base = height - 16;
    let svg = `<svg viewBox="0 0 ${w} ${height}" role="img">`;
    items.forEach((it, k) => {
      const x = k * slot + (slot - bw) / 2;
      const full = ((base - 12) * it.possible) / max;
      const h = ((base - 12) * it.count) / max;
      svg += `<rect class="bar-empty" x="${x}" y="${base - full}" width="${bw}" height="${full}" rx="${bw / 3}"/>`;
      if (it.count > 0) {
        svg += `<rect class="bar-fill" x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="${bw / 3}"/>`;
        svg += `<text class="val" x="${x + bw / 2}" y="${base - h - 3}" text-anchor="middle">${it.count}</text>`;
      }
      if ((n - 1 - k) % labelEvery === 0) {
        svg += `<text x="${x + bw / 2}" y="${height - 3}" text-anchor="middle">${esc(it.label)}</text>`;
      }
    });
    return `${svg}</svg>`;
  }

  function timeChart(recent, avg) {
    const timed = recent.filter((r) => Number.isFinite(r.ms));
    if (timed.length < 2) return '<div class="empty-note">Solve a few days to see your times trend.</div>';
    const w = 320;
    const h = 110;
    const max = Math.max(...timed.map((r) => r.ms)) * 1.1;
    const x = (i) => 8 + (i * (w - 16)) / (timed.length - 1);
    const y = (ms) => h - 14 - ((h - 26) * ms) / max;
    const pts = timed.map((r, i) => `${x(i).toFixed(1)},${y(r.ms).toFixed(1)}`);
    let svg = `<svg viewBox="0 0 ${w} ${h}" role="img">`;
    svg += `<polyline class="time-line" points="${pts.join(' ')}"/>`;
    if (avg) {
      svg += `<line class="time-avg" x1="8" x2="${w - 8}" y1="${y(avg)}" y2="${y(avg)}" stroke-dasharray="3 4"/>`;
      svg += `<text x="${w - 8}" y="${y(avg) - 4}" text-anchor="end">avg ${Stats.formatTime(avg)}</text>`;
    }
    timed.forEach((r, i) => { svg += `<circle class="time-dot" cx="${x(i)}" cy="${y(r.ms)}" r="2.6"/>`; });
    svg += `<text x="8" y="${h - 2}">${esc(timed[0].date.slice(5))}</text>`;
    svg += `<text x="${w - 8}" y="${h - 2}" text-anchor="end">${esc(timed[timed.length - 1].date.slice(5))}</text>`;
    return `${svg}</svg>`;
  }

  function wants(descriptor, metric) {
    if (!descriptor || !descriptor.metrics) return true;
    return descriptor.metrics.includes(metric);
  }

  function renderStats(body, s, descriptor) {
    const t = s.times;
    let html = '<div class="tiles">' +
      tile(String(s.total), 'Solved', true) +
      tile(String(s.currentStreak), 'Streak') +
      tile(String(s.bestStreak), 'Best streak') +
      tile(`${s.thisWeek}<small>/${s.thisWeekPossible}</small>`, 'This week') +
      tile(`${s.thisMonth}<small>/${s.thisMonthPossible}</small>`, 'This month') +
      tile(String(s.thisYear), 'This year') +
      tile(String(s.played == null ? s.total : s.played), 'Played') +
      tile(`${s.winRate == null ? 100 : s.winRate}%`, 'Win rate') +
      '</div>';
    if (s.periods) {
      html += '<div class="section-title">Periods</div><table class="stats-table"><tr><th></th><th>Played</th><th>Win%</th><th>Avg</th><th>Best</th></tr>';
      for (const name of ['week', 'month', 'year', 'all']) {
        const row = s.periods[name];
        html += `<tr><td>${name}</td><td>${row.played}</td><td>${row.played ? row.winRate + '%' : '–'}</td><td>${Stats.formatTime(row.avg)}</td><td>${Stats.formatTime(row.best)}</td></tr>`;
      }
      html += '</table>';
    }
    if (root.OL.Awards) {
      const awards = root.OL.Awards.evaluate(s);
      html += '<div class="section-title">Awards</div><div class="awards">';
      for (const award of awards) {
        html += `<div class="award${award.earned ? ' earned' : ''}" data-award="${esc(award.id)}"><strong>${esc(award.name)}</strong><small>${esc(award.detail)}</small></div>`;
      }
      html += '</div>';
    }
    if (wants(descriptor, 'time')) {
      html += '<div class="section-title">Solve times</div><div class="tiles">' +
        tile(Stats.formatTime(t.avg), 'Average', true) +
        tile(Stats.formatTime(t.min), 'Fastest') +
        tile(Stats.formatTime(t.max), 'Slowest') +
        tile(Stats.formatTime(t.median), 'Median') +
        tile(Stats.formatTime(s.lastTime), 'Last') +
        tile(Stats.formatTime(s.monthTimes.avg), 'Month avg') +
        '</div>';
      html += `<div class="section-title">Recent times</div><div class="chart">${timeChart(s.recent, t.avg)}</div>`;
    }
    const weeks = s.weeks.map((w) => {
      const d = Prng.parseKey(w.start);
      return { ...w, label: `${d.getDate()}/${d.getMonth() + 1}` };
    });
    html += `<div class="section-title">Days solved per week</div><div class="chart">${barChart(weeks, { labelEvery: 2 })}</div>`;
    html += `<div class="section-title">Days solved per month</div><div class="chart">${barChart(s.months, { labelEvery: 1 })}</div>`;
    body.innerHTML = html;
  }

  /**
   * Fill the appearance sheet. Inapplicable sections are left empty and hidden.
   * `ids` names the existing Spider containers so the live markup does not move.
   */
  /** Explicit list wins; otherwise the contrast-safe catalogue for the descriptor. */
  function themeChoices(descriptor, override) {
    if (Array.isArray(override)) return override;
    return Themes.forDescriptor(descriptor || { id: 'olspider', hasCards: true });
  }

  /** The sheet an appearance list lives in, when it lives in one (the gallery's lists do not). */
  function sheetPanelOf(el) {
    return el && el.closest ? el.closest('.sheet-panel') : null;
  }

  function ensureBackList(cardList, backList) {
    if (backList) return backList;
    if (!cardList || !cardList.parentElement) return null;
    const panel = sheetPanelOf(cardList);
    let el = (panel || cardList.parentElement).querySelector('[data-ol-backs]');
    if (!el) {
      el = document.createElement('div');
      el.dataset.olBacks = '';
      el.className = 'back-row';
      if (panel) panel.insertBefore(el, panel.querySelector('.sheet-close'));
      else cardList.parentElement.insertBefore(el, cardList);
      if (!panel) {
        const kicker = document.createElement('p');
        kicker.className = 'theme-kicker';
        kicker.textContent = 'Backs';
        cardList.parentElement.insertBefore(kicker, el);
      }
    }
    return el;
  }

  // ------------------------------------------------------------------ tabs

  const TABS = [
    { id: 'table', label: 'Table' },
    { id: 'front', label: 'Front' },
    { id: 'back', label: 'Back' },
    { id: 'finish', label: 'Finish' },
  ];

  function node(tag, className, attrs) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  /** Show one tab's pane. The choice is remembered on the panel for the next open. */
  function showTab(panel, id) {
    const tabs = [...panel.querySelectorAll('.look-tab')].filter((t) => !t.hidden);
    const wanted = tabs.find((t) => t.dataset.tab === id) || tabs[0];
    if (!wanted) return;
    panel.dataset.olTab = wanted.dataset.tab;
    for (const tab of panel.querySelectorAll('.look-tab')) {
      const on = tab === wanted;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    }
    for (const pane of panel.querySelectorAll('.look-pane')) pane.hidden = pane.dataset.pane !== wanted.dataset.tab;
  }

  /**
   * Turn a flat appearance sheet into tabs: Table, Front, Back, Finish. One live
   * preview of the whole card sits above the tabs and the Done button stays
   * pinned below, so nothing needs a scroll to reach. The lists keep their ids,
   * classes and listeners; they are only moved into a pane.
   */
  function mountTabs(panel, lists) {
    if (panel.dataset.olTabs) return;
    panel.dataset.olTabs = '1';
    const preview = node('div', 'look-preview', { 'aria-label': 'Preview' });
    const tabbar = node('div', 'look-tabs', { role: 'tablist', 'aria-label': 'Appearance' });
    const body = node('div', 'look-body');
    // A list moves with its own wrapper (an app may listen on it); a wrapper that
    // holds more than one list stays put and only the list moves.
    const all = Object.values(lists).filter(Boolean);
    const unit = (list) => {
      if (!list) return null;
      const parent = list.parentElement;
      if (parent && parent !== panel && parent.parentElement === panel && all.filter((l) => parent.contains(l)).length === 1) return parent;
      return list;
    };
    for (const tab of TABS) {
      const btn = node('button', 'look-tab', { type: 'button', role: 'tab', 'data-tab': tab.id, 'aria-label': tab.label });
      btn.textContent = tab.label;
      tabbar.appendChild(btn);
      const pane = node('div', 'look-pane', { role: 'tabpanel', 'data-pane': tab.id, 'aria-label': tab.label });
      body.appendChild(pane);
      if (lists[tab.id]) pane.appendChild(unit(lists[tab.id]));
    }
    tabbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.look-tab');
      if (btn && !btn.hidden) showTab(panel, btn.dataset.tab);
    });
    // The old headings and wrappers are replaced by the tabs.
    for (const old of panel.querySelectorAll('.theme-kicker, #theme-picker, #finish-picker, #card-picker')) {
      if (!body.contains(old)) old.hidden = true;
    }
    const done = panel.querySelector('.sheet-close');
    if (done) panel.insertBefore(preview, done); else panel.appendChild(preview);
    panel.insertBefore(tabbar, done || null);
    panel.insertBefore(body, done || null);
    showTab(panel, 'table');
  }

  /** Refresh the preview and which tabs apply. Called after every fill. */
  function refreshTabs(panel, current, showCards) {
    const preview = panel.querySelector('.look-preview');
    panel.classList.toggle('look-tabbed', showCards);
    preview.hidden = !showCards;
    preview.textContent = '';
    if (showCards) {
      preview.appendChild(Cards.sampleDeck(current.cards, current.finish, Cards.SAMPLE_IDS, false, current.back));
      const text = node('span', 'look-preview-text');
      text.textContent = summary(current.theme, current.cards, current.finish, current.back);
      preview.appendChild(text);
    }
    for (const tab of panel.querySelectorAll('.look-tab')) tab.hidden = !showCards && tab.dataset.tab !== 'table';
    panel.querySelector('.look-tabs').hidden = !showCards;
    showTab(panel, panel.dataset.olTab || 'table');
  }

  function fillAppearance({ themeList, finishList, cardList, descriptor, current, themeKicker, finishKicker, cardKicker, themes }) {
    const showCards = !descriptor || descriptor.hasCards !== false;
    const themeListItems = themeChoices(descriptor, themes);
    const panel = sheetPanelOf(themeList || cardList);
    const backList = showCards ? ensureBackList(cardList, arguments[0].backList) : null;
    if (panel && !panel.dataset.olTabs) {
      mountTabs(panel, { table: themeList, front: cardList, back: backList, finish: finishList });
    }
    if (themeKicker) themeKicker.hidden = false;
    if (themeList) {
      themeList.textContent = '';
      for (const theme of themeListItems) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-pick';
        btn.dataset.theme = theme.id;
        btn.setAttribute('aria-label', theme.name);
        btn.setAttribute('aria-pressed', theme.id === current.theme ? 'true' : 'false');
        const swatch = document.createElement('span');
        swatch.className = `swatch ${theme.id}`;
        swatch.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.textContent = theme.name;
        btn.append(swatch, name);
        themeList.appendChild(btn);
      }
    }
    if (finishKicker) finishKicker.hidden = !showCards;
    if (finishList) {
      finishList.textContent = '';
      finishList.hidden = !showCards;
      if (showCards) {
        for (const finish of Cards.FINISHES) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'finish-pick';
          btn.dataset.finish = finish.id;
          btn.setAttribute('aria-label', `${finish.name} finish`);
          btn.setAttribute('aria-pressed', finish.id === current.finish ? 'true' : 'false');
          const name = document.createElement('span');
          name.textContent = finish.name;
          btn.append(Cards.sampleDeck(current.cards, finish.id, [Cards.SAMPLE_IDS[0], Cards.SAMPLE_IDS[3]], true), name);
          finishList.appendChild(btn);
        }
      }
    }
    if (backList) {
      backList.textContent = '';
      backList.hidden = !showCards;
      for (const back of Cards.BACKS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'back-pick';
        btn.dataset.back = back.id;
        btn.setAttribute('aria-label', `${back.name} back`);
        btn.setAttribute('aria-pressed', back.id === (current.back || Cards.defaultBack(current.cards)) ? 'true' : 'false');
        const name = document.createElement('span');
        name.textContent = back.name;
        btn.append(Cards.sampleDeck(current.cards, current.finish, panel ? [] : [Cards.SAMPLE_IDS[0]], false, back.id), name);
        backList.appendChild(btn);
      }
    }
    if (cardKicker) cardKicker.hidden = !showCards;
    if (cardList) {
      cardList.textContent = '';
      cardList.hidden = !showCards;
      if (showCards) {
        for (const style of Cards.STYLES) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'look-pick';
          btn.dataset.cards = style.id;
          btn.setAttribute('aria-label', style.name);
          btn.setAttribute('aria-pressed', style.id === current.cards ? 'true' : 'false');
          const name = document.createElement('span');
          name.className = 'look-name';
          name.textContent = style.name;
          btn.append(name, Cards.sampleDeck(style.id, current.finish, null, !!panel));
          cardList.appendChild(btn);
        }
      }
    }
    if (panel) refreshTabs(panel, current, showCards);
  }

  function summary(themeId, cardsId, finishId, backId) {
    const theme = Themes.BY_ID[themeId] || Themes.BY_ID.twilight;
    const look = Cards.STYLE_BY_ID[cardsId] || Cards.STYLE_BY_ID.original;
    const finish = Cards.FINISH_BY_ID[finishId] || Cards.FINISH_BY_ID.natural;
    const finishName = finish.id === 'natural' ? '' : ` · ${finish.name}`;
    const back = backId && Cards.BACK_BY_ID[backId];
    const backName = back && back.id !== Cards.defaultBack(look) ? ` · ${back.name} back` : '';
    return `${theme.name} · ${look.name}${finishName}${backName}`;
  }

  root.OL.Views = {
    renderCalendar, renderStats, fillAppearance, themeChoices, summary, dayDetail, longDate, MONTH_NAMES,
  };
})(globalThis);
