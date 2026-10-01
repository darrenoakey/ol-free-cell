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
    { id: 'close', name: 'Close', layout: 'trad', court: 'close' },
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

  /**
   * Every distinct shipped back. Spider's Original, Straight and Clear looks
   * share one CSS back, so it is listed once. FreeCell's card-back.svg is
   * byte-identical to classic.svg. Golf's card-back.svg is Fairway.
   * Bridge, FreeCell, Golf and Classic faces are one PNG deck.
   * ol-bridge/cardmaker archives are a design tool, not a shipped look.
   */
  const BACKS = [
    { id: 'original', name: 'Original', file: null, sources: ['ol-spider'] },
    { id: 'index', name: 'Index', file: 'index.svg', sources: ['ol-spider'] },
    { id: 'picture', name: 'Picture', file: 'picture.svg', sources: ['ol-spider'] },
    { id: 'bust', name: 'Bust', file: 'bust.svg', sources: ['ol-spider'] },
    { id: 'cropped', name: 'Cropped', file: 'cropped.svg', sources: ['ol-spider'] },
    { id: 'close', name: 'Close', file: 'close.svg', sources: ['ol-spider'] },
    { id: 'jewel', name: 'Jewel', file: 'jewel.svg', sources: ['ol-spider'] },
    { id: 'noir', name: 'Noir', file: 'noir.svg', sources: ['ol-spider'] },
    { id: 'vintage', name: 'Vintage', file: 'vintage.svg', sources: ['ol-spider'] },
    { id: 'deco', name: 'Deco', file: 'deco.svg', sources: ['ol-spider'] },
    { id: 'pastel', name: 'Pastel', file: 'pastel.svg', sources: ['ol-spider'] },
    { id: 'neon', name: 'Neon', file: 'neon.svg', sources: ['ol-spider'] },
    { id: 'classic', name: 'Classic', file: 'classic.svg', sources: ['ol-bridge', 'ol-free-cell', 'ol-core'] },
    { id: 'fairway', name: 'Fairway', file: 'fairway.svg', sources: ['ol-golf'] },
  ];
  const BACK_BY_ID = Object.fromEntries(BACKS.map((b) => [b.id, b]));

  /** The back a look wears until the player picks another. */
  function defaultBack(styleOrId) {
    const style = typeof styleOrId === 'string' ? (STYLE_BY_ID[styleOrId] || STYLE_BY_ID.original) : styleOrId;
    if (style.back && BACK_BY_ID[style.back]) return style.back;
    if (BACK_BY_ID[style.id] && BACK_BY_ID[style.id].file) return style.id;
    return 'original';
  }

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

  // Court figures are illustrations, one per rank and suit, in core/assets/courts.
  // A card shows one of them four ways, chosen by the deck's data-court:
  //   double  the head-and-shoulders twice, the second turned over, like a traditional pack
  //   bust    one head-and-torso cameo in a round frame
  //   cut     one larger figure whose torso runs off the bottom edge
  //   close   zoomed in: the face sits in the bottom-right corner and its right edge is cropped
  // cards.css paints the picture; the markup below only provides the windows.

  function defsMarkup() {
    const suits = SU_PATH.map((p, i) => `<symbol id="su-${i}" viewBox="0 0 24 24">${p}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${suits}</defs></svg>`;
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
        '<div class="court-art double"><i></i><i></i></div>' +
        '<div class="court-art bust"></div>' +
        '<div class="court-art cut"></div>' +
        '<div class="court-art close"></div>';
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

  /** Point a deck at a look, a finish, and an optional back. Unknown ids fall back. */
  function dress(deck, id, finish, back) {
    const style = STYLE_BY_ID[id] || STYLE_BY_ID.original;
    deck.dataset.cards = style.id;
    deck.dataset.layout = style.layout;
    deck.dataset.court = style.court || 'double';
    deck.dataset.finish = (FINISH_BY_ID[finish] || FINISH_BY_ID.natural).id;
    deck.dataset.back = (BACK_BY_ID[back] || BACK_BY_ID[defaultBack(style)]).id;
    return style.id;
  }

  /** One picker row's cards: the back, then the four sample faces — all real cards. */
  function sampleDeck(id, finish, ids, noBack, back) {
    const deck = document.createElement('span');
    deck.className = 'look-cards';
    dress(deck, id, finish, back);
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

  /**
   * Minimum face-up fan, in pixels, that keeps the rank and suit index
   * inside the visible strip. `cardHeight` is the rendered card height.
   * Width is taken as the wider Spider aspect (height / 1.45) so FreeCell
   * and Golf, which are narrower, still fit. Classic has no markup index:
   * the PNG's own rank and suit pip end at y=240 of the 768px art (the
   * jack's hook; a ten ends higher). The fan must keep that strip visible.
   */
  const CLASSIC_INDEX_BOTTOM = 240 / 768;

  function minStackOffset(look, cardHeight) {
    const ch = Number(cardHeight);
    if (!Number.isFinite(ch) || ch <= 0) return 0;
    const style = STYLE_BY_ID[look] || STYLE_BY_ID.original;
    const cw = ch / 1.45;
    const layout = style.layout;
    let bottom;
    if (layout === 'index') {
      bottom = 2 + cw * 0.34 * 0.82 + cw * 0.23 + 4;
    } else if (layout === 'trad') {
      bottom = 2 + cw * 0.27 * 0.82 + cw * 0.22 + 4;
    } else if (layout === 'bold') {
      bottom = 2 + cw * 0.38 + 4;
    } else if (layout === 'classic') {
      bottom = ch * CLASSIC_INDEX_BOTTOM + 2;
    } else {
      bottom = 1 + cw * 0.40 + 4;
    }
    return Math.ceil(bottom);
  }

  function installDefs() {
    if (document.getElementById('su-0')) return;
    const holder = document.createElement('div');
    holder.innerHTML = defsMarkup();
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }

  const Cards = {
    SUITS, SUIT_GLYPH, RANK_LABEL, STYLES, STYLE_BY_ID, FINISHES, FINISH_BY_ID,
    BACKS, BACK_BY_ID, defaultBack,
    SAMPLE_IDS, PIPS, installDefs, cardElement, dress, sampleDeck, faceMarkup,
    cardFromId, resolveCard, setGeometry, minStackOffset,
  };
  root.OL = root.OL || {};
  root.OL.Cards = Cards;
})(globalThis);
