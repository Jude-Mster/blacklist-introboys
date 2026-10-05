import { UserError } from '../../shared/points.ts';
import { cardTableHandler, drawCard } from '../../shared/cardTable.ts';
import { PAIRS_RETURNS, PLUS3_RETURNS, sidePairs, sidePlus3 } from '../../shared/blackjackSides.ts';

// Blackjack: one shared table. Everyone plays their own hand against the same dealer.
//   - Blackjack pays 3:2. Dealer hits soft 17. Double on your first two cards.
//   - Split a pair once into two hands (same number or face). Split aces get one card each.
//     21 on a split hand is an ordinary win, not a blackjack. You may double after a split.
//   - No insurance. Cards come from an endless shoe.
//   - Two optional side bets, decided as soon as the cards are dealt:
//       Pairs: your first two cards are a pair.
//       21+3:  your two cards and the dealer's first card make a flush, a straight,
//              three of a kind, a straight flush or three identical cards.
// With blackjack at 3:2 the house keeps well under 1% of the main bet against perfect play.
const BLACKJACK_PAYS = [3, 2];
const DEALER_HITS_SOFT_17 = true;

function handTotal(cards: string[]) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const r = c[0];
    if (r === 'A') { aces++; total += 11; }
    else if ('TJQK'.includes(r)) total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
const total = (cards: string[]) => handTotal(cards).total;
const isNatural = (cards: string[]) => cards.length === 2 && total(cards) === 21;

export default cardTableHandler({
  id: 'blackjack',
  actSeconds: 25,
  actions: ['hit', 'stand', 'double', 'split'],
  canSplit: (cards) => cards.length === 2 && cards[0][0] === cards[1][0],
  splitOneCardOnly: (cards) => cards[0][0] === 'A',
  legacyEntity: 'BlackjackHand',
  sideBets: ['pairs', 'plus3'],
  sideResolve: (cards, dealerUp) => ({ pairs: sidePairs(cards), plus3: sidePlus3(cards, dealerUp) }),
  total,
  seatDoneOnDeal: (cards) => (isNatural(cards) ? 'blackjack' : ''),
  dealerEndsRound: (dealer) => isNatural(dealer),

  act(seat, action) {
    const cards = seat.cards;
    if (action === 'stand') return { cards, status: 'done', note: 'stood' };
    if (action === 'double') {
      if (cards.length !== 2 || seat.doubled) throw new UserError('You can only double on your first two cards.');
      cards.push(drawCard());
      return { cards, status: 'done', note: total(cards) > 21 ? 'bust' : 'doubled', extraStake: seat.wager };
    }
    cards.push(drawCard());
    const t = total(cards);
    if (t > 21) return { cards, status: 'done', note: 'bust' };
    if (t === 21) return { cards, status: 'done', note: 'stood' };
    return { cards, status: 'playing', note: '' };
  },

  dealerPlay(dealer) {
    while (true) {
      const { total: t, soft } = handTotal(dealer);
      if (t < 17 || (t === 17 && soft && DEALER_HITS_SOFT_17)) dealer.push(drawCard());
      else break;
    }
    return dealer;
  },

  resolve(seat, dealer) {
    const pt = total(seat.cards), dt = total(dealer);
    const pn = isNatural(seat.cards) && !seat.doubled && !seat.split, dn = isNatural(dealer);
    let result = 'lose';
    if (pt > 21) result = 'lose';
    else if (pn && dn) result = 'push';
    else if (pn) result = 'blackjack';
    else if (dn) result = 'lose';
    else if (dt > 21 || pt > dt) result = 'win';
    else if (pt === dt) result = 'push';
    const st = seat.staked - (seat.side_total || 0); // the main hand's stake; side bets are settled separately
    const payout = result === 'blackjack' ? st + Math.floor((st * BLACKJACK_PAYS[0]) / BLACKJACK_PAYS[1]) : result === 'win' ? st * 2 : result === 'push' ? st : 0;
    return { result, payout };
  },

  // While hands are being played only the dealer's first card is shown.
  dealerView: (dealer, revealed) =>
    revealed ? { cards: dealer, hidden: 0, total: total(dealer) } : { cards: dealer.slice(0, 1), hidden: Math.max(0, dealer.length - 1), total: total(dealer.slice(0, 1)) },

  feedDetail: (seat, dealer, result) => (result === 'blackjack' ? 'Blackjack!' : `Player ${total(seat.cards)}, dealer ${total(dealer)}`) + (seat.side_payout > 0 ? ' · side bet won' : ''),
  extra: () => ({ rules: { blackjack_pays: BLACKJACK_PAYS.join(':'), dealer_hits_soft_17: DEALER_HITS_SOFT_17, pairs: PAIRS_RETURNS, plus3: PLUS3_RETURNS } })
});