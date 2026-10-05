// Blackjack side bets. Both are decided by the first cards dealt and nothing else.
// What each side bet returns per point staked, the stake included ("25 to 1" returns 26).
// Worked out for an endless shoe so each side bet returns about 94 to 95% over time.
export const PAIRS_RETURNS = { perfect: 26, coloured: 11, mixed: 6 };
export const PLUS3_RETURNS = { suited_trips: 101, straight_flush: 36, trips: 26, straight: 11, flush: 6 };
const RED = 'hd';
const rankNo = (c: string) => 'A23456789TJQK'.indexOf(c[0]) + 1; // Ace = 1 ... King = 13

export function sidePairs(cards: string[]) {
  const [a, b] = cards;
  if (a[0] !== b[0]) return { name: '', returns: 0 };
  if (a[1] === b[1]) return { name: 'Perfect pair', returns: PAIRS_RETURNS.perfect };
  if (RED.includes(a[1]) === RED.includes(b[1])) return { name: 'Coloured pair', returns: PAIRS_RETURNS.coloured };
  return { name: 'Mixed pair', returns: PAIRS_RETURNS.mixed };
}
export function sidePlus3(cards: string[], dealerUp: string) {
  const three = [cards[0], cards[1], dealerUp];
  const ranks = three.map(rankNo).sort((x, y) => x - y);
  const flush = three.every((c) => c[1] === three[0][1]);
  const trips = ranks[0] === ranks[2];
  // Three in a row; the Ace can sit below the 2 or above the King.
  const straight = (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2]) || (ranks[0] === 1 && ranks[1] === 12 && ranks[2] === 13);
  if (trips && flush) return { name: 'Suited three of a kind', returns: PLUS3_RETURNS.suited_trips };
  if (straight && flush) return { name: 'Straight flush', returns: PLUS3_RETURNS.straight_flush };
  if (trips) return { name: 'Three of a kind', returns: PLUS3_RETURNS.trips };
  if (straight) return { name: 'Straight', returns: PLUS3_RETURNS.straight };
  if (flush) return { name: 'Flush', returns: PLUS3_RETURNS.flush };
  return { name: '', returns: 0 };
}