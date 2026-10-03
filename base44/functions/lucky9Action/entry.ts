import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, todayStr, randInt, houseEdge, coinMultiplier, payoutOf,
  GAME_NAMES, UserError, errorResponse
} from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

// Lucky 9 against the banker.
//   - Two cards each. Ace = 1, 2-9 = face value, 10/J/Q/K = 0. Only the last digit
//     of the total counts, so 7 + 8 = 5.
//   - The player may take one more card ("hirit") or stay ("good").
//   - The banker always draws a third card on 4 or less and stays on 5 or more.
//   - Higher total wins. A tie returns the wager. A natural 9 pays the same as any win.
// At even money this game would slightly favour a player who draws on 5 or less
// (the banker's rule is not the best one), so a win pays the same multiplier as the
// coin toss: 2 x (1 - house edge), e.g. 1.94x at a 3% house edge. Against the best
// possible play the house then keeps about 2.3%.
// The banker's cards and the deck stay on the server until the hand is over.
const BANKER_DRAWS_ON = 4;
const DECKS = 6;
const NAME = GAME_NAMES.lucky9;
const RANKS = '23456789TJQKA';
const SUITS = 'shdc';

function newShoe() {
  const d: string[] = [];
  for (let n = 0; n < DECKS; n++) for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const cardValue = (c: string) => (c[0] === 'A' ? 1 : 'TJQK'.includes(c[0]) ? 0 : Number(c[0]));
export const lucky9Total = (cards: string[]) => cards.reduce((s, c) => s + cardValue(c), 0) % 10;

function view(h, multiplier: number, balance?: number) {
  if (!h) return null;
  const done = h.status === 'done';
  return {
    id: h.id, status: h.status, wager: h.wager,
    player: h.player, player_total: lucky9Total(h.player), can_draw: !done && h.player.length === 2,
    banker: done ? h.banker : [], banker_cards: h.banker.length, banker_total: done ? lucky9Total(h.banker) : null,
    result: done ? h.result : null, payout: done ? h.payout : 0, net: done ? h.payout - h.wager : 0, multiplier,
    ...(balance !== undefined ? { balance } : {})
  };
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    const action = p.action;
    if (action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.', 401);
    const settings = await getSettings(b);
    const multiplier = coinMultiplier(houseEdge(settings));
    const H = b.asServiceRole.entities.Lucky9Hand;
    const active = async () => ((await H.filter({ member_id: me.id, status: 'playing' }, { limit: 1 })).items || [])[0] || null;
    const open = (settings.games_enabled || []).includes('lucky9');

    if (action === 'state') return Response.json({ hand: view(await active(), multiplier), open, multiplier });
    if (!['deal', 'draw', 'stand'].includes(action)) throw new UserError('Unknown Lucky 9 action.');

    // The banker plays by the fixed rule, then the hand is recorded as finished
    // BEFORE anything is paid, so it can never be paid twice.
    const finish = async (h) => {
      if (lucky9Total(h.banker) <= BANKER_DRAWS_ON) h.banker.push(h.deck.pop());
      const pt = lucky9Total(h.player), bt = lucky9Total(h.banker);
      const result = pt > bt ? 'win' : pt === bt ? 'tie' : 'lose';
      const payout = result === 'win' ? payoutOf(multiplier, h.wager) : result === 'tie' ? h.wager : 0;
      await H.update(h.id, { status: 'done', result, payout, player: h.player, banker: h.banker, deck: [] });
      let balance;
      if (payout > 0) {
        ({ balance } = await changePoints(b, me.id, payout, 'game', `${NAME} ${result === 'tie' ? 'tie, wager returned' : 'win'}`, null));
      } else {
        balance = (await b.asServiceRole.entities.Member.get(me.id)).points || 0;
      }
      await b.asServiceRole.entities.Bet.create({
        member_id: me.id, discord_id: me.discord_id, game: 'lucky9', wager: h.wager, payout, won: payout > h.wager,
        outcome: { player: h.player, banker: h.banker, player_total: pt, banker_total: bt, result }
      });
      await postFeed(b, me, { game: 'lucky9', game_name: NAME, wager: h.wager, payout, detail: `Player ${pt}, banker ${bt}` });
      return view({ ...h, status: 'done', result, payout }, multiplier, balance);
    };

    // Every move is made under the member's lock, so two taps can never race.
    const hand = await withMemberLock(b, me.id, async () => {
      const member = await b.asServiceRole.entities.Member.get(me.id);
      const cur = await active();

      if (action === 'deal') {
        if (!open) throw new UserError('Lucky 9 is closed right now.');
        if (member.banned) throw new UserError('You are banned from the games.', 403);
        if (cur) throw new UserError('Finish the hand you already have.');
        const wager = Math.floor(Number(p.wager));
        if (!Number.isInteger(wager) || wager < 1) throw new UserError('Enter a wager.');
        if (wager < settings.min_bet) throw new UserError(`The minimum wager is ${settings.min_bet}.`);
        if (wager > settings.max_bet) throw new UserError(`The maximum wager is ${settings.max_bet}.`);
        if (wager > (member.points || 0)) throw new UserError('Not enough points for that wager.');
        const today = todayStr();
        const used = member.daily_bet_date === today ? member.daily_bet_total || 0 : 0;
        if (used + wager > settings.daily_bet_cap) {
          const left = Math.max(0, settings.daily_bet_cap - used);
          throw new UserError(left ? `Daily wager limit: ${left} left today.` : 'Daily wager limit reached. It resets at 00:00 UTC.');
        }
        await changePoints(b, me.id, -wager, 'game', `${NAME} bet`, null);
        try {
          await b.asServiceRole.entities.Member.update(me.id, { daily_bet_total: used + wager, daily_bet_date: today });
          const deck = newShoe();
          const player = [deck.pop(), deck.pop()];
          const banker = [deck.pop(), deck.pop()];
          const h = await H.create({ member_id: me.id, status: 'playing', wager, deck, player, banker, payout: 0 });
          return view(h, multiplier, (member.points || 0) - wager);
        } catch (e) {
          await changePoints(b, me.id, wager, 'game', `${NAME} bet returned`, null).catch(() => {});
          throw e;
        }
      }

      if (!cur) throw new UserError('You have no hand in play. Deal a new one.');
      const h = { ...cur, player: [...cur.player], banker: [...cur.banker], deck: [...cur.deck] };
      if (action === 'draw') {
        if (h.player.length !== 2) throw new UserError('You can only take one extra card.');
        h.player.push(h.deck.pop());
      }
      return finish(h);
    });

    return Response.json({ hand });
  } catch (e) {
    return errorResponse(e);
  }
}