// cards.js — OL.Cards. Card markup, suit and court artwork, pip layouts, looks
// and finishes. A deck is any element carrying data-cards and data-layout.
// Geometry (--cw/--ch) is set on that deck, never on the document.
// Card model is {suit 0-3, rank 1-13}. Pass idToCard when a game's ids differ.
(function (root) {
  'use strict';

  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const SUIT_GLYPH = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  /** Standard 52-card id: suit*13 + (rank-1), copies allowed (id % 52). */
  function cardFromId(id) {
    const n = Number(id);
    return { id: n, suit: Math.floor(n / 13) % 4, rank: (n % 13) + 1 };
  }

  function resolveCard(cardOrId, idToCard) {
    if (cardOrId && typeof cardOrId === 'object') return cardOrId;
    if (typeof idToCard === 'function') return idToCard(cardOrId);
    return cardFromId(cardOrId);
  }

  /** Every look. `layout` picks the face arrangement, `id` picks the colours and back. */
  const STYLES = [
    { id: 'original', name: 'Original', layout: 'modern' },
    { id: 'straight', name: 'Straight', layout: 'modern' },
    { id: 'clear', name: 'Clear', layout: 'modern' },
    { id: 'index', name: 'Index', layout: 'index' },
    { id: 'picture', name: 'Picture', layout: 'trad', court: 'double' },
    { id: 'bust', name: 'Bust', layout: 'trad', court: 'bust' },
    { id: 'cropped', name: 'Cropped', layout: 'trad', court: 'cut' },
    { id: 'jewel', name: 'Jewel', layout: 'trad', court: 'double' },
    { id: 'noir', name: 'Noir', layout: 'trad', court: 'double' },
    { id: 'vintage', name: 'Vintage', layout: 'trad', court: 'double' },
    { id: 'deco', name: 'Deco', layout: 'bold' },
    { id: 'pastel', name: 'Pastel', layout: 'bold' },
    { id: 'neon', name: 'Neon', layout: 'bold' },
    { id: 'classic', name: 'Classic', layout: 'classic' },
  ];
  const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));

  /** How a look is lit, independent of the look itself. */
  const FINISHES = [
    { id: 'natural', name: 'Natural' },
    { id: 'moody', name: 'Moody' },
    { id: 'stark', name: 'Stark' },
  ];
  const FINISH_BY_ID = Object.fromEntries(FINISHES.map((f) => [f.id, f]));

  /** The four cards every look is previewed with: an ace, the busiest number card, two pictures. */
  const SAMPLE_IDS = [0, 22, 50, 38]; // A♠  10♥  Q♣  K♦

  // ------------------------------------------------------------------ pips

  // Traditional pip spots as fractions of the card (x of its width, y of its height).
  // The left gutter belongs to the index, so the pips sit in the right-hand
  // zone: three columns (L, M, R). Pips are never inverted: at this size an
  // upside-down heart reads as a spade. `size` is the pip's width as a fraction of card
  // width, chosen so no two pips touch at the smallest card the board draws.
  const L = 0.50;
  const M = 0.68;
  const R = 0.86;
  const PIPS = {
    1: { size: 0.50, spots: [[M, 0.54]] },
    2: { size: 0.28, spots: [[M, 0.22], [M, 0.78]] },
    3: { size: 0.28, spots: [[M, 0.22], [M, 0.50], [M, 0.78]] },
    4: { size: 0.25, spots: [[L, 0.23], [R, 0.23], [L, 0.77], [R, 0.77]] },
    5: { size: 0.25, spots: [[L, 0.23], [R, 0.23], [M, 0.50], [L, 0.77], [R, 0.77]] },
    6: { size: 0.24, spots: [[L, 0.22], [R, 0.22], [L, 0.50], [R, 0.50], [L, 0.78], [R, 0.78]] },
    7: { size: 0.23, spots: [[L, 0.22], [R, 0.22], [M, 0.36], [L, 0.50], [R, 0.50], [L, 0.78], [R, 0.78]] },
    8: { size: 0.23, spots: [[L, 0.22], [R, 0.22], [M, 0.36], [L, 0.50], [R, 0.50], [M, 0.64], [L, 0.78], [R, 0.78]] },
    9: { size: 0.20, spots: [[L, 0.19], [R, 0.19], [L, 0.40], [R, 0.40], [M, 0.50], [L, 0.60], [R, 0.60], [L, 0.81], [R, 0.81]] },
    10: { size: 0.20, spots: [[L, 0.19], [R, 0.19], [M, 0.295], [L, 0.40], [R, 0.40], [L, 0.60], [R, 0.60], [M, 0.705], [L, 0.81], [R, 0.81]] },
  };

  // ------------------------------------------------------------------ artwork

  const SU_PATH = [
    // spade
    '<path d="M12 1.6C13.4 5.2 20.8 9.2 20.8 14.6c0 3-2.2 4.8-4.6 4.8-1.6 0-3-.8-3.6-2.2.1 2.4.8 4 2.6 5.2H8.8c1.8-1.2 2.5-2.8 2.6-5.2-.6 1.4-2 2.2-3.6 2.2-2.4 0-4.6-1.8-4.6-4.8C3.2 9.2 10.6 5.2 12 1.6Z"/>',
    // heart
    '<path d="M12 21.6C11.2 20.9 3 14.6 3 8.6 3 5.4 5.4 3.2 8.2 3.2c1.7 0 3.1.9 3.8 2.4.7-1.5 2.1-2.4 3.8-2.4C18.6 3.2 21 5.4 21 8.6c0 6-8.2 12.3-9 13Z"/>',
    // diamond
    '<path d="M12 1.6 20 12 12 22.4 4 12Z"/>',
    // club
    '<circle cx="12" cy="7.1" r="4.7"/><circle cx="6.8" cy="14.1" r="4.7"/><circle cx="17.2" cy="14.1" r="4.7"/><path d="M12 8.2 7.6 13.6h8.8Z"/><path d="M12 12c.2 4.6 1 8 3.4 10.4H8.6C11 20 11.8 16.6 12 12Z"/>',
  ];

  // Each court is drawn once, as the top half of the person (24 wide, 21 tall:
  // crown to waist). It is shown three ways, chosen by the deck's data-court:
  //   double  mirrored through the centre, like a traditional pack
  //   bust    one head-and-torso cameo, the torso cut by a round frame
  //   cut     one larger figure whose torso runs off the bottom edge of the card
  // Colours come from the deck: robe = the suit's ink, the rest from
  // --trim/--skin/--hair/--cline (and --pane behind a bust or cut figure).
  const EYES = '<circle cx="10.9" cy="10.2" r=".38" class="cn"/><circle cx="13.1" cy="10.2" r=".38" class="cn"/>';
  const HALF = {
    13: // King: tall crown, full beard, sceptre
      '<path class="cr" d="M2.5 21c0-3.8 3.1-5.6 6.5-6.2l3 2.8 3-2.8c3.4.6 6.5 2.4 6.5 6.2Z"/>' +
      '<path class="ct" d="M8.2 14.6 12 19.2l3.8-4.6-1.2-.4L12 17l-2.6-2.8Z"/>' +
      '<path class="cs" d="M4.6 21 5.3 9.6" stroke-width=".9"/><circle class="ct" cx="5.4" cy="8.8" r="1.1"/>' +
      '<path class="ck" d="M10.7 13h2.6v2.4h-2.6Z"/>' +
      '<path class="ch" d="M8.3 8.6c-.4 4.4.9 7.4 3.7 7.6 2.8-.2 4.1-3.2 3.7-7.6l-1 .7c.3 2.6-.7 4.2-2.7 4.5-2-.3-3-1.9-2.7-4.5Z"/>' +
      '<ellipse class="ck" cx="12" cy="10.4" rx="2.9" ry="3.5"/>' + EYES +
      '<path class="ct" d="M8.2 7.6h7.6v1.7H8.2Z"/>' +
      '<path class="ct" d="M8.2 7.6 7.3 3l2.7 2.2L12 1.5l2 3.7L16.7 3l-.9 4.6Z"/>' +
      '<circle class="cr" cx="12" cy="4.4" r=".7"/>',
    12: // Queen: tiara, long hair, necklace
      '<path class="ch" d="M7.6 8c-1.7 3.2-1.7 7.2-.4 9.8l2.3-2h5l2.3 2c1.3-2.6 1.3-6.6-.4-9.8Z"/>' +
      '<path class="cr" d="M3 21c.2-3 3.2-4.6 6.4-5 .8 1.2 4.4 1.2 5.2 0 3.2.4 6.2 2 6.4 5Z"/>' +
      '<path class="cs" d="M9.4 16c.8 1.4 4.4 1.4 5.2 0" stroke-width=".9"/>' +
      '<circle class="ct" cx="10.6" cy="17.5" r=".45"/><circle class="ct" cx="12" cy="17.9" r=".45"/><circle class="ct" cx="13.4" cy="17.5" r=".45"/>' +
      '<path class="ck" d="M10.8 13.6h2.4v2.6h-2.4Z"/>' +
      '<ellipse class="ck" cx="12" cy="10.7" rx="2.8" ry="3.4"/>' + EYES.replace(/cy="10.2"/g, 'cy="10.4"') +
      '<path class="ch" d="M9 9.8c1.2-1.8 4.8-1.8 6 0-1.4-.8-4.6-.8-6 0Z"/>' +
      '<path class="ct" d="M8.6 7.6h6.8V9H8.6Z"/>' +
      '<path class="ct" d="M8.6 7.6 8.1 4.6l2.1 1.5L12 3.2l1.8 2.9 2.1-1.5-.5 3Z"/>' +
      '<circle class="cr" cx="12" cy="4.6" r=".65"/>',
    11: // Jack: feathered cap, short hair, tunic
      '<path class="cr" d="M3.4 21c0-3.4 3-5.4 6.2-6l2.4 1.6 2.4-1.6c3.2.6 6.2 2.6 6.2 6Z"/>' +
      '<path class="ct" d="M9.6 15 12 17.5l2.4-2.5-.8-.4-1.6 1.2-1.6-1.2Z"/>' +
      '<path class="cs" d="M3.6 19.4h16.8" stroke-width=".8"/>' +
      '<path class="ck" d="M10.8 13.2h2.4v2.2h-2.4Z"/>' +
      '<path class="ch" d="M8.2 8.6c-.5 2.4.1 3.8 1.2 4.4h5.2c1.1-.6 1.7-2 1.2-4.4Z"/>' +
      '<ellipse class="ck" cx="12" cy="10.9" rx="2.7" ry="3.1"/>' + EYES.replace(/cy="10.2"/g, 'cy="10.6"') +
      '<path class="cr" d="M7.6 8.6C7.3 5.4 9.9 3.6 12.6 3.8c2.8.2 4.4 2.2 4 4.8-1.6-1-7.4-1-9 0Z"/>' +
      '<path class="ct" d="M7.7 8.2c1.6-1 7.2-1 8.9 0v.9c-1.7-1-7.2-1-8.9 0Z"/>' +
      '<path class="ct" d="M15.4 5.4C17.8 3 20.4 2.6 21.4 1c-.3 3.2-2.4 5.6-5.2 6.2Z"/>',
  };

  function courtSymbols(rank) {
    const label = RANK_LABEL[rank];
    const double = `<symbol id="court-${label}" viewBox="0 0 24 42">` +
      `<g id="half-${label}">${HALF[rank]}</g>` +
      `<use href="#half-${label}" transform="rotate(180 12 21)"/></symbol>`;
    const bust = `<symbol id="bust-${label}" viewBox="0 0 24 24">` +
      '<circle class="pane" cx="12" cy="12.5" r="11.4"/>' +
      `<g clip-path="url(#bust-clip)"><g transform="translate(0 3)">${HALF[rank]}</g></g>` +
      '<circle class="ring" cx="12" cy="12.5" r="11.4"/></symbol>';
    const cut = `<symbol id="cut-${label}" viewBox="2 1.2 20 16.6" preserveAspectRatio="xMidYMax slice">` +
      `<rect class="pane" x="-8" y="-8" width="40" height="40"/>${HALF[rank]}</symbol>`;
    return double + bust + cut;
  }

  function defsMarkup() {
    const suits = SU_PATH.map((p, i) => `<symbol id="su-${i}" viewBox="0 0 24 24">${p}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${suits}<clipPath id="bust-clip"><circle cx="12" cy="12.5" r="11.4"/></clipPath>${[11, 12, 13].map(courtSymbols).join('')}</defs></svg>`;
  }

  function suit(i, cls) {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#su-${i}"/></svg>`;
  }

  // ------------------------------------------------------------------ cards

  /** The inside of one card: every arrangement, of which a deck's layout shows one. */
  function faceMarkup(card) {
    const glyph = SUIT_GLYPH[card.suit];
    const label = RANK_LABEL[card.rank];
    const court = card.rank >= 11;
    let body;
    if (court) {
      body = `<div class="face-letter">${label}</div>` +
        `<svg class="court-art double" viewBox="0 0 24 42" aria-hidden="true"><use href="#court-${label}"/>` +
        `<use href="#su-${card.suit}" class="ce" x="14.3" y="16.4" width="3.4" height="3.4"/>` +
        `<use href="#su-${card.suit}" class="ce" x="14.3" y="16.4" width="3.4" height="3.4" transform="rotate(180 12 21)"/></svg>` +
        `<svg class="court-art bust" viewBox="0 0 24 24" aria-hidden="true"><use href="#bust-${label}"/></svg>` +
        `<svg class="court-art cut" aria-hidden="true"><use href="#cut-${label}"/></svg>`;
    } else {
      const { size, spots } = PIPS[card.rank];
      const pips = spots.map(([x, y]) =>
        `<span class="pp" style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%">${suit(card.suit, 'su')}</span>`).join('');
      body = `<div class="pips${card.rank === 1 ? ' ace' : ''}" style="--pp:${size}">${pips}</div>`;
    }
    return `<div class="corner"><span class="r">${label}</span><span class="s">${glyph}</span></div>` +
      `<div class="pip">${glyph}</div>` +
      `<div class="index"><b>${label}</b>${suit(card.suit, 'su')}</div>` +
      `${body}${suit(card.suit, 'bigsu')}`;
  }

  /** A card element, face down, with its whole face inside. */
  function cardElement(card) {
    const el = document.createElement('div');
    el.className = `card down suit-${card.suit}${card.rank >= 11 ? ' court' : ''}`;
    el.dataset.id = String(card.id);
    el.dataset.rank = String(card.rank);
    el.dataset.suit = String(card.suit);
    el.innerHTML = faceMarkup(card);
    el.setAttribute('aria-label', `${RANK_LABEL[card.rank]} of ${SUITS[card.suit]}`);
    return el;
  }

  /** Point a deck at a look and a finish. Unknown ids fall back to Original / Natural. */
  function dress(deck, id, finish) {
    const style = STYLE_BY_ID[id] || STYLE_BY_ID.original;
    deck.dataset.cards = style.id;
    deck.dataset.layout = style.layout;
    deck.dataset.court = style.court || 'double';
    deck.dataset.finish = (FINISH_BY_ID[finish] || FINISH_BY_ID.natural).id;
    return style.id;
  }

  /** One picker row's cards: the back, then the four sample faces — all real cards. */
  function sampleDeck(id, finish, ids, noBack) {
    const deck = document.createElement('span');
    deck.className = 'look-cards';
    dress(deck, id, finish);
    if (!noBack) {
      const back = document.createElement('div');
      back.className = 'card down';
      deck.appendChild(back);
    }
    for (const cardId of ids || SAMPLE_IDS) {
      const el = cardElement(cardFromId(cardId));
      el.classList.replace('down', 'up');
      deck.appendChild(el);
    }
    return deck;
  }

  /** Instance-scoped card size. Never writes documentElement. */
  function setGeometry(deck, cw, ch) {
    deck.style.setProperty('--cw', typeof cw === 'number' ? cw + 'px' : String(cw));
    deck.style.setProperty('--ch', typeof ch === 'number' ? ch + 'px' : String(ch));
  }

  function installDefs() {
    if (document.getElementById('su-0')) return;
    const holder = document.createElement('div');
    holder.innerHTML = defsMarkup();
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }

  const Cards = {
    SUITS, SUIT_GLYPH, RANK_LABEL, STYLES, STYLE_BY_ID, FINISHES, FINISH_BY_ID,
    SAMPLE_IDS, PIPS, installDefs, cardElement, dress, sampleDeck, faceMarkup,
    cardFromId, resolveCard, setGeometry,
  };
  root.OL = root.OL || {};
  root.OL.Cards = Cards;
})(globalThis);
