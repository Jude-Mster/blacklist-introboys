import { houseEdge, coinMultiplier, payoutOf, UserError } from '../../shared/points.ts';
import { cardTableHandler, drawCard } from '../../shared/cardTable.ts';

// Lucky 9: one shared table. Everyone plays their own hand against the same banker.
//   - Ace = 1, 2-9 = face value, 10/J/Q/K = 0. Only the last digit of the total counts.
//   - Each player may take one more card ("hirit") or stay ("good").
//   - The banker draws a third card on 4 or less and stays on 5 or more.
//   - Higher total wins. A tie returns the wager. A natural 9 pays the same as any win.
// At even money this game would slightly favour a player who draws on 5 or less, so
// a win pays the coin-toss multiplier: 2 x (1 - house edge), e.g. 1.94x at 3%.
const BANKER_DRAWS_ON = 4;
const cardValue = (c: string) => (c[0] === 'A' ? 1 : 'TJQK'.includes(c[0]) ? 0 : Number(c[0]));
const total = (cards: string[]) => cards.reduce((s, c) => s + cardValue(c), 0) % 10;

export default cardTableHandler({
  id: 'lucky9',
  actSeconds: 15,
  actions: ['draw', 'stand'],
  legacyEntity: 'Lucky9Hand',
  total,
  seatDoneOnDeal: () => '',
  dealerEndsRound: () => false,

  act(seat, action) {
    const cards = seat.cards;
    if (action === 'stand') return { cards, status: 'done', note: 'stood' };
    if (cards.length !== 2) throw new UserError('You can only take one extra card.');
    cards.push(drawCard());
    return { cards, status: 'done', note: 'drew' };
  },

  dealerPlay(banker) {
    if (banker.length === 2 && total(banker) <= BANKER_DRAWS_ON) banker.push(drawCard());
    return banker;
  },

  resolve(seat, banker, settings) {
    const pt = total(seat.cards), bt = total(banker);
    const result = pt > bt ? 'win' : pt === bt ? 'push' : 'lose';
    const payout = result === 'win' ? payoutOf(coinMultiplier(houseEdge(settings)), seat.staked) : result === 'push' ? seat.staked : 0;
    return { result, payout };
  },

  // The banker's cards stay face down until the round is settled.
  dealerView: (banker, revealed) => (revealed ? { cards: banker, hidden: 0, total: total(banker) } : { cards: [], hidden: banker.length, total: null }),

  feedDetail: (seat, banker) => `Player ${total(seat.cards)}, banker ${total(banker)}`,
  extra: (settings) => ({ multiplier: coinMultiplier(houseEdge(settings)) })
});
// redeploys to pick up the updated shared card table engine