// Client-side mirror of the Pusoy Dos rules, used only to show which cards can be
// played. The server checks every play.
export const RANK_ORDER = "3456789TJQKA2";
export const SUIT_ORDER = "dchs"; // low to high: diamond, club, heart, spade
export const SUIT_SYMBOL = { s: "♠", h: "♥", c: "♣", d: "♦" };
export const SUIT_NAME = { s: "Spades", h: "Hearts", c: "Clubs", d: "Diamonds" };
export const cardValue = (c) => RANK_ORDER.indexOf(c[0]) * 4 + SUIT_ORDER.indexOf(c[1]);
export const sortByRank = (cards) => [...cards].sort((a, b) => cardValue(a) - cardValue(b));
export const sortBySuit = (cards) =>
  [...cards].sort((a, b) => SUIT_ORDER.indexOf(a[1]) - SUIT_ORDER.indexOf(b[1]) || cardValue(a) - cardValue(b));
export const rankLabel = (c) => (c[0] === "T" ? "10" : c[0]);

// May `card` be played on `top`? Same suit, or the same number (which changes the suit).
export const canFollow = (card, top) => !top || card[1] === top[1] || card[0] === top[0];