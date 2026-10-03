import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, todayStr, randInt, GAME_NAMES, UserError, errorResponse
} from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

// Blackjack against the house.
//   - Six decks, shuffled fresh for every hand (so counting cards is pointless).
//   - Blackjack pays 6:5. Dealer hits soft 17. Double on your first two cards.
//   - No splitting, no insurance.
// With these rules the house keeps roughly 2% over time against perfect play.
// The deck and the dealer's hidden card stay on the server until the hand is over.
const BLACKJACK_PAYS = [6, 5];        // 6:5. Change to [3, 2] for the classic, more generous payout.
const DEALER_HITS_SOFT_17 = true;
const DECKS = 6;
const NAME = GAME_NAMES.blackjack;
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

// Best total for a hand, and whether an ace is still counting as 11 ("soft").
export function handTotal(cards: string[]) {
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
const isNatural = (cards: string[]) => cards.length === 2 && handTotal(cards).total === 21;

function dealerPlay(dealer: string[], deck: string[]) {
  while (true) {
    const { total, soft } = handTotal(dealer);
    if (total < 17 || (total === 17 && soft && DEALER_HITS_SOFT_17)) dealer.push(deck.pop() as string);
    else break;
  }
}

function payoutFor(result: string, staked: number) {
  if (result === 'blackjack') return staked + Math.floor((staked * BLACKJACK_PAYS[0]) / BLACKJACK_PAYS[1]);
  if (result === 'win') return staked * 2;
  if (result === 'push') return staked;
  return 0;
}

// What the player is allowed to see.
function view(h, balance?: number) {
  if (!h) return null;
  const done = h.status === 'done';
  const p = handTotal(h.player);
  const shown = done ? h.dealer : h.dealer.slice(0, 1);
  return {
    id: h.id, status: h.status, wager: h.wager, staked: h.staked, doubled: !!h.doubled,
    player: h.player, player_total: p.total, player_soft: p.soft && p.total < 21,
    dealer: shown, dealer_hidden: !done, dealer_total: handTotal(shown).total,
    can_double: !done && h.player.length === 2 && !h.doubled,
    result: done ? h.result : null, payout: done ? h.payout : 0, net: done ? h.payout - h.staked : 0,
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
    const H = b.asServiceRole.entities.BlackjackHand;
    const active = async () => ((await H.filter({ member_id: me.id, status: 'playing' }, { limit: 1 })).items || [])[0] || null;
    const open = (settings.games_enabled || []).includes('blackjack');

    if (action === 'state') {
      return Response.json({ hand: view(await active()), open, rules: { blackjack_pays: BLACKJACK_PAYS.join(':'), dealer_hits_soft_17: DEALER_HITS_SOFT_17 } });
    }

    // Finish a hand: record the result FIRST, then pay, so a hand can never be paid twice.
    const finish = async (h, result: string) => {
      const payout = payoutFor(result, h.staked);
      const saved = await H.update(h.id, { status: 'done', result, payout, player: h.player, dealer: h.dealer, deck: [], staked: h.staked, doubled: !!h.doubled });
      let balance;
      if (payout > 0) {
        ({ balance } = await changePoints(b, me.id, payout, 'game', `${NAME} ${result === 'push' ? 'push, wager returned' : 'win'}`, null));
      } else {
        balance = (await b.asServiceRole.entities.Member.get(me.id)).points || 0;
      }
      await b.asServiceRole.entities.Bet.create({
        member_id: me.id, discord_id: me.discord_id, game: 'blackjack', wager: h.staked, payout, won: payout > h.staked,
        outcome: { player: h.player, dealer: h.dealer, result, doubled: !!h.doubled }
      });
      const pt = handTotal(h.player).total, dt = handTotal(h.dealer).total;
      await postFeed(b, me, { game: 'blackjack', game_name: NAME, wager: h.staked, payout, detail: result === 'blackjack' ? 'Blackjack!' : `Player ${pt}, dealer ${dt}` });
      return view({ ...h, ...saved, player: h.player, dealer: h.dealer, status: 'done', result, payout }, balance);
    };

    // Compare against the dealer once the player has stood.
    const settle = async (h) => {
      dealerPlay(h.dealer, h.deck);
      const pt = handTotal(h.player).total, dt = handTotal(h.dealer).total;
      return finish(h, dt > 21 || pt > dt ? 'win' : pt === dt ? 'push' : 'lose');
    };

    // Daily wager cap, shared with the other games. Returns the new running total.
    const checkCap = (member, amount: number) => {
      const today = todayStr();
      const used = member.daily_bet_date === today ? member.daily_bet_total || 0 : 0;
      if (used + amount > settings.daily_bet_cap) {
        const left = Math.max(0, settings.daily_bet_cap - used);
        throw new UserError(left ? `Daily wager limit: ${left} left today.` : 'Daily wager limit reached. It resets at 00:00 UTC.');
      }
      return { daily_bet_total: used + amount, daily_bet_date: today };
    };

    if (!['deal', 'hit', 'stand', 'double'].includes(action)) throw new UserError('Unknown blackjack action.');

    // Every move is made under the member's lock, so two taps can never race.
    const hand = await withMemberLock(b, me.id, async () => {
      const member = await b.asServiceRole.entities.Member.get(me.id);
      const cur = await active();

      if (action === 'deal') {
        if (!open) throw new UserError('Blackjack is closed right now.');
        if (member.banned) throw new UserError('You are banned from the games.', 403);
        if (cur) throw new UserError('Finish the hand you already have.');
        const wager = Math.floor(Number(p.wager));
        if (!Number.isInteger(wager) || wager < 1) throw new UserError('Enter a wager.');
        if (wager < settings.min_bet) throw new UserError(`The minimum wager is ${settings.min_bet}.`);
        if (wager > settings.max_bet) throw new UserError(`The maximum wager is ${settings.max_bet}.`);
        if (wager > (member.points || 0)) throw new UserError('Not enough points for that wager.');
        const cap = checkCap(member, wager);

        await changePoints(b, me.id, -wager, 'game', `${NAME} bet`, null);
        let h;
        try {
          await b.asServiceRole.entities.Member.update(me.id, cap);
          const deck = newShoe();
          const player = [deck.pop(), deck.pop()];
          const dealer = [deck.pop(), deck.pop()];
          h = await H.create({ member_id: me.id, status: 'playing', wager, staked: wager, doubled: false, deck, player, dealer, payout: 0 });
        } catch (e) {
          await changePoints(b, me.id, wager, 'game', `${NAME} bet returned`, null).catch(() => {});
          throw e;
        }
        // The dealer checks for blackjack before the player acts.
        const pn = isNatural(h.player), dn = isNatural(h.dealer);
        if (pn || dn) return finish(h, pn && dn ? 'push' : pn ? 'blackjack' : 'dealer_blackjack');
        return view(h, (member.points || 0) - wager);
      }

      if (!cur) throw new UserError('You have no hand in play. Deal a new one.');
      const h = { ...cur, player: [...cur.player], dealer: [...cur.dealer], deck: [...cur.deck] };

      if (action === 'hit') {
        h.player.push(h.deck.pop());
        const t = handTotal(h.player).total;
        if (t > 21) return finish(h, 'bust');
        if (t === 21) return settle(h);
        await H.update(h.id, { player: h.player, deck: h.deck });
        return view(h, member.points || 0);
      }

      if (action === 'stand') return settle(h);

      // double: one more card for one more wager, then stand
      if (h.player.length !== 2 || h.doubled) throw new UserError('You can only double on your first two cards.');
      if (h.wager > (member.points || 0)) throw new UserError('Not enough points to double.');
      const cap = checkCap(member, h.wager);
      await changePoints(b, me.id, -h.wager, 'game', `${NAME} double`, null);
      await b.asServiceRole.entities.Member.update(me.id, cap);
      h.staked = h.wager * 2;
      h.doubled = true;
      h.player.push(h.deck.pop());
      await H.update(h.id, { player: h.player, deck: h.deck, staked: h.staked, doubled: true });
      if (handTotal(h.player).total > 21) return finish(h, 'bust');
      return settle(h);
    });

    return Response.json({ hand });
  } catch (e) {
    return errorResponse(e);
  }
}