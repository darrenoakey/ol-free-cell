// cards.js — the 52-card model shared by the dealer, solver, and renderer.
'use strict';

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const SUIT_SYMBOL = { clubs: '\u2663', diamonds: '\u2666', hearts: '\u2665', spades: '\u2660' };
const SUIT_RED = { clubs: false, diamonds: true, hearts: true, spades: false };

// Rank is stored internally as 1 (Ace) .. 13 (King).
const RANK_LABEL = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ suit, rank, id: `${suit}_${rank}` });
    }
  }
  return deck;
}

function cardLabel(card) {
  return RANK_LABEL[card.rank];
}

function cardImageFile(card) {
  return `${card.suit}_${RANK_LABEL[card.rank]}.png`;
}

function isRed(card) {
  return SUIT_RED[card.suit];
}

/** FreeCell tableau build: descending rank, alternating colour. */
function buildsOn(moving, target) {
  if (!moving || !target) return false;
  return moving.rank === target.rank - 1 && isRed(moving) !== isRed(target);
}

/** Foundation build: same suit, ascending from Ace. */
function buildsFoundation(moving, foundationRank, foundationSuit) {
  if (!moving) return false;
  if (foundationRank === 0) return moving.rank === 1; // Ace starts empty foundation
  return moving.suit === foundationSuit && moving.rank === foundationRank + 1;
}

function suitIndex(suit) {
  return SUITS.indexOf(suit);
}

// eslint-disable-next-line no-unused-vars
const Cards = {
  SUITS,
  SUIT_SYMBOL,
  RANK_LABEL,
  freshDeck,
  cardLabel,
  cardImageFile,
  isRed,
  buildsOn,
  buildsFoundation,
  suitIndex,
};
