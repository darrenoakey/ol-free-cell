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
      const cls = ['cal-day'];
      let extra = '';
      let label = `${longDate(key)}`;
      if (rec) {
        cls.push('solved');
        extra = `${mark}<span class="cal-time">${Stats.formatTime(rec.ms)}</span>`;
        label += `, solved in ${Stats.formatTime(rec.ms)}`;
      } else if (key > today) {
        cls.push('future');
      } else if (key < today && firstSeen && key >= firstSeen) {
        cls.push('missed');
        label += ', not solved';
      }
      if (key === today) {
        cls.push('today');
        if (!rec && todayOpen) cls.push('open');
      }
      html += `<button class="${cls.join(' ')}" data-date="${key}" aria-label="${esc(label)}"><span>${day}</span>${extra}</button>`;
    }
    html += '</div>';

    const monthRecs = Object.keys(history).filter((k) => k.startsWith(prefix)).map((k) => history[k]);
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
    if (history[today]) return `Today solved in <strong>${Stats.formatTime(history[today].ms)}</strong>. See you tomorrow.`;
    return todayOpen ? 'Today&rsquo;s deal is waiting. Tap any gold day for its details.' : 'Tap any gold day for its details.';
  }

  function dayDetail(history, key, today) {
    const rec = history[key];
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
    svg += '<defs><linearGradient id="bar-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset=".55" stop-color="#e9c46a"/><stop offset="1" stop-color="#b98f35"/></linearGradient></defs>';
    items.forEach((it, k) => {
      const x = k * slot + (slot - bw) / 2;
      const full = ((base - 12) * it.possible) / max;
      const h = ((base - 12) * it.count) / max;
      svg += `<rect x="${x}" y="${base - full}" width="${bw}" height="${full}" rx="${bw / 3}" fill="rgba(255,255,255,0.07)"/>`;
      if (it.count > 0) {
        svg += `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="${bw / 3}" fill="url(#bar-g)"/>`;
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
    svg += '<defs><linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9c46a" stop-opacity=".35"/><stop offset="1" stop-color="#e9c46a" stop-opacity="0"/></linearGradient></defs>';
    svg += `<path d="M${pts[0]} L${pts.join(' L')} L${x(timed.length - 1).toFixed(1)},${h - 14} L${x(0).toFixed(1)},${h - 14} Z" fill="url(#area-g)"/>`;
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#e9c46a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (avg) {
      svg += `<line x1="8" x2="${w - 8}" y1="${y(avg)}" y2="${y(avg)}" stroke="rgba(243,220,160,.45)" stroke-dasharray="3 4"/>`;
      svg += `<text x="${w - 8}" y="${y(avg) - 4}" text-anchor="end">avg ${Stats.formatTime(avg)}</text>`;
    }
    timed.forEach((r, i) => { svg += `<circle cx="${x(i)}" cy="${y(r.ms)}" r="2.6" fill="#fff3cc"/>`; });
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
      '</div>';
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

  function fillAppearance({ themeList, finishList, cardList, descriptor, current, themeKicker, finishKicker, cardKicker, themes }) {
    const showCards = !descriptor || descriptor.hasCards !== false;
    const themeListItems = themeChoices(descriptor, themes);
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
          btn.append(name, Cards.sampleDeck(style.id, current.finish));
          cardList.appendChild(btn);
        }
      }
    }
  }

  function summary(themeId, cardsId, finishId) {
    const theme = Themes.BY_ID[themeId] || Themes.BY_ID.twilight;
    const look = Cards.STYLE_BY_ID[cardsId] || Cards.STYLE_BY_ID.original;
    const finish = Cards.FINISH_BY_ID[finishId] || Cards.FINISH_BY_ID.natural;
    const finishName = finish.id === 'natural' ? '' : ` · ${finish.name}`;
    return `${theme.name} · ${look.name}${finishName}`;
  }

  root.OL.Views = {
    renderCalendar, renderStats, fillAppearance, themeChoices, summary, dayDetail, longDate, MONTH_NAMES,
  };
})(globalThis);
