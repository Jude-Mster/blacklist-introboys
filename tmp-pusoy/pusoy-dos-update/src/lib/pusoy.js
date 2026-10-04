// Client-side mirror of the Pusoy Dos rules, used only to label the cards you've
// picked. The server checks every play.
export const RANK_ORDER = "3456789TJQKA2";
export const SUIT_ORDER = "dchs"; // low to high: diamond, club, heart, spade
export const cardValue = (c) => RANK_ORDER.indexOf(c[0]) * 4 + SUIT_ORDER.indexOf(c[1]);
export const sortByRank = (cards) => [...cards].sort((a, b) => cardValue(a) - cardValue(b));
export const sortBySuit = (cards) =>
  [...cards].sort((a, b) => SUIT_ORDER.indexOf(a[1]) - SUIT_ORDER.indexOf(b[1]) || cardValue(a) - cardValue(b));

const FIVE = ["", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];

export function classify(input) {
  const cards = sortByRank(input);
  const n = cards.length;
  if (n === 0) return null;
  const top = cards[n - 1];
  const sameRank = cards.every((c) => c[0] === cards[0][0]);
  if (n === 1) return { type: "single", cat: 0, key: cardValue(top), label: "Single" };
  if (n === 2) return sameRank ? { type: "pair", cat: 0, key: cardValue(top), label: "Pair" } : null;
  if (n === 3) return sameRank ? { type: "triple", cat: 0, key: RANK_ORDER.indexOf(top[0]), label: "Three of a kind" } : null;
  if (n !== 5) return null;
  const counts = {};
  for (const c of cards) counts[c[0]] = (counts[c[0]] || 0) + 1;
  const groups = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const ranks = cards.map((c) => RANK_ORDER.indexOf(c[0]));
  const straight = groups.length === 5 && !ranks.includes(12) && ranks[4] - ranks[0] === 4;
  let cat = 0, key = 0;
  if (straight && flush) { cat = 5; key = cardValue(top); }
  else if (groups[0][1] === 4) { cat = 4; key = RANK_ORDER.indexOf(groups[0][0]); }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 3; key = RANK_ORDER.indexOf(groups[0][0]); }
  else if (flush) { cat = 2; key = cardValue(top); }
  else if (straight) { cat = 1; key = cardValue(top); }
  else return null;
  return { type: "five", cat, key, label: FIVE[cat] };
}

export function beats(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.cat !== b.cat) return a.cat > b.cat;
  return a.key > b.key;
}
