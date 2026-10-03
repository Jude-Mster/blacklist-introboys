// Shared engine for the multiplayer card tables (Blackjack, Lucky 9).
// One table per game. Everyone at the table plays their own hand against the
// same dealer, and all hands are settled together.
//
// Members first SIT in one of the six chairs, then bet from their chair each round.
//   betting  - the first bet starts a countdown; anyone seated can join until it ends
//   playing  - cards are dealt; every player plays their own hand at the same
//              time, inside one shared time limit (no waiting for turns)
//   settled  - the dealer plays, every hand is paid, results stay up a few seconds
//
// Rounds advance lazily: any request after a deadline moves the table forward.
// Cards are drawn at random from a full deck each time (an endless shoe), so there
// is nothing to count and no shared deck for players to fight over.
// Safety rules used throughout: decide and save the dealer's final hand before
// paying anyone; mark a seat settled before paying it; every change to a seat
// happens under that member's lock.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from './session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, todayStr, randInt, GAME_NAMES,
  UserError, errorResponse
} from './points.ts';
import { postFeed } from './feed.ts';
import { BACKEND_VERSION } from './version.ts';

export const BET_SECONDS = 15;      // countdown after the first bet
export const RESULT_SECONDS = 6;    // how long results stay up
const CLOSE_MARGIN_MS = 1500;       // bets stop a moment before the deadline
const SETTLE_LOCK_MS = 120000;
export const SEAT_COUNT = 6;         // chairs at each table
const IDLE_MS = 10 * 60 * 1000;     // a chair with no bet for this long is given up

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
export const drawCard = () => RANKS[randInt(13)] + SUITS[randInt(4)];
const iso = (ms: number) => new Date(ms).toISOString();

// What each game supplies.
export type CardGame = {
  id: string;                                   // 'blackjack' | 'lucky9'
  actSeconds: number;                           // time everyone gets to play their hand
  actions: string[];                            // moves a player can make
  legacyEntity?: string;                        // old single-player hands to refund once
  seatDoneOnDeal: (cards: string[]) => string;  // '' or a note if the hand needs no play (e.g. blackjack)
  dealerEndsRound: (dealer: string[]) => boolean; // dealer blackjack: nobody plays
  // Apply a move. Return the changed fields; set status 'done' when the hand is finished.
  // extraStake > 0 means the move costs that many more points (double).
  act: (seat, action: string) => { cards: string[]; status: string; note: string; extraStake?: number };
  dealerPlay: (dealer: string[]) => string[];
  resolve: (seat, dealer: string[], settings) => { result: string; payout: number };
  total: (cards: string[]) => number;
  dealerView: (dealer: string[], revealed: boolean) => { cards: string[]; hidden: number; total: number | null };
  feedDetail: (seat, dealer: string[], result: string) => string;
  extra?: (settings) => Record<string, unknown>; // extra numbers for the page (e.g. win multiplier)
};

export function cardTableHandler(game: CardGame) {
  const NAME = GAME_NAMES[game.id];

  return async function(req) {
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
      const open = (settings.games_enabled || []).includes(game.id);
      const T = b.asServiceRole.entities.CardTable;
      const S = b.asServiceRole.entities.CardSeat;

      const getTable = async () => {
        const { items } = await T.filter({ game: game.id }, { sort: 'created_date', limit: 1 });
        if (items[0]) return items[0];
        return await T.create({ game: game.id, round_no: 1, status: 'betting', dealer: [], seats: Array(SEAT_COUNT).fill({}) });
      };
      // The six chairs. Empty chairs are stored as {} (entity arrays can't hold null).
      const chairsOf = (t) => Array.from({ length: SEAT_COUNT }, (_, i) => { const c = (t.seats || [])[i]; return c && c.member_id ? c : null; });
      const chairIndex = (t, memberId) => chairsOf(t).findIndex((c) => c && c.member_id === memberId);
      const saveChairs = (t, chairs) => T.update(t.id, { seats: chairs.map((c) => c || {}) });
      // Give up chairs whose owner hasn't bet for a while (and has no hand in play).
      const sweepChairs = (chairs, inPlay: Set<string>) => {
        const cutoff = Date.now() - IDLE_MS;
        let changed = false;
        for (let i = 0; i < chairs.length; i++) {
          const c = chairs[i];
          if (c && !inPlay.has(c.member_id) && (!c.active_at || Date.parse(c.active_at) < cutoff)) { chairs[i] = null; changed = true; }
        }
        return changed;
      };
      const seatsOf = async (round: number) => (await S.filter({ game: game.id, round_no: round }, { limit: 100 })).items || [];
      const allDone = (seats) => seats.length > 0 && seats.every((s) => s.status === 'done' || s.settled);

      // ---------- moving the table forward ----------

      const deal = async (t, seats, now: number) => {
        const dealer = [drawCard(), drawCard()];
        const over = game.dealerEndsRound(dealer);
        for (const s of seats) {
          if (s.status !== 'waiting') continue;
          const cards = [drawCard(), drawCard()];
          const note = over ? 'dealer' : game.seatDoneOnDeal(cards);
          await S.update(s.id, { cards, status: note ? 'done' : 'playing', note: note || '' });
        }
        return await T.update(t.id, { status: 'playing', dealer, act_close_at: iso(now + game.actSeconds * 1000) });
      };

      const settle = async (t, now: number) => {
        // Decide the dealer's final hand ONCE and save it before paying anyone, so a
        // settle that is cut short resumes with the same cards.
        let dealer = t.dealer || [];
        if (t.settling_round !== t.round_no) {
          dealer = game.dealerPlay([...dealer]);
          t = await T.update(t.id, { dealer, settling_round: t.round_no });
        }
        const seats = await seatsOf(t.round_no);
        for (const row of seats) {
          if (row.settled) continue;
          // Under the member's lock: any move they were still making has finished,
          // and no later move can touch a settled seat.
          await withMemberLock(b, row.member_id, async () => {
            const s = await S.get(row.id);
            if (s.settled) return;
            const dealt = Array.isArray(s.cards) && s.cards.length > 0;
            // A bet that arrived too late to be dealt in is simply returned.
            const { result, payout } = dealt ? game.resolve(s, dealer, settings) : { result: 'void', payout: s.staked };
            const note = s.status === 'playing' ? 'timeout' : s.note || '';
            await S.update(s.id, { settled: true, status: 'done', result, payout, note });
            if (payout > 0) {
              await changePoints(b, s.member_id, payout, 'game', `${NAME} ${result === 'void' ? 'bet returned' : result === 'push' ? 'wager returned' : 'win'}`, null);
            }
            if (!dealt) return;
            await b.asServiceRole.entities.Bet.create({
              member_id: s.member_id, discord_id: '', game: game.id, wager: s.staked, payout, won: payout > s.staked,
              outcome: { player: s.cards, dealer, result, doubled: !!s.doubled, player_total: game.total(s.cards), dealer_total: game.total(dealer), round: t.round_no }
            });
            await postFeed(b, { id: s.member_id, discord_name: s.name, avatar_url: s.avatar, role: s.role }, {
              game: game.id, game_name: NAME, wager: s.staked, payout, detail: game.feedDetail(s, dealer, result)
            });
          });
        }
        // Count the results pause from when paying finished, so a busy table still shows its results.
        return await T.update(t.id, { status: 'settled', next_at: iso(Date.now() + RESULT_SECONDS * 1000) });
      };

      const advance = async (early = false) => {
        const first = await getTable();
        const now0 = Date.now();
        const due =
          (first.status === 'betting' && first.bets_close_at && Date.parse(first.bets_close_at) <= now0) ||
          (first.status === 'playing' && (early || !first.act_close_at || Date.parse(first.act_close_at) <= now0)) ||
          (first.status === 'settled' && (!first.next_at || Date.parse(first.next_at) <= now0));
        if (!due) return first;
        return withRecordLock(b, 'CardTable', first.id, async () => {
          let t = await T.get(first.id);
          const now = Date.now();
          if (t.status === 'betting' && t.bets_close_at && Date.parse(t.bets_close_at) <= now) {
            const seats = await seatsOf(t.round_no);
            if (seats.length === 0) return await T.update(t.id, { bets_close_at: null });
            t = await deal(t, seats, now);
            // Everyone has blackjack, or the dealer does: nothing to play.
            if (allDone(await seatsOf(t.round_no))) t = await settle(t, now);
          } else if (t.status === 'playing') {
            const timeUp = !t.act_close_at || Date.parse(t.act_close_at) <= now;
            if (timeUp || allDone(await seatsOf(t.round_no))) t = await settle(t, now);
          } else if (t.status === 'settled' && (!t.next_at || Date.parse(t.next_at) <= now)) {
            const chairs = chairsOf(t);
            sweepChairs(chairs, new Set());
            t = await T.update(t.id, { round_no: (t.round_no || 0) + 1, status: 'betting', bets_close_at: null, act_close_at: null, next_at: null, dealer: [], seats: chairs.map((c) => c || {}) });
          }
          return t;
        }, SETTLE_LOCK_MS);
      };

      // ---------- what a player may see ----------

      const seatView = (s) => {
        const dealt = Array.isArray(s.cards) && s.cards.length > 0;
        return {
          name: s.name, avatar: s.avatar, role: s.role, wager: s.wager, staked: s.staked, doubled: !!s.doubled,
          cards: s.cards || [], total: dealt ? game.total(s.cards) : null, status: s.status, note: s.note || '',
          result: s.settled ? s.result : null, payout: s.settled ? s.payout : 0, net: s.settled ? s.payout - s.staked : 0,
          mine: s.member_id === me.id
        };
      };
      const stateOf = async (t, extra = {}) => {
        const seats = await seatsOf(t.round_no);
        const revealed = t.status === 'settled';
        const mine = seats.find((s) => s.member_id === me.id);
        return {
          open,
          table: {
            round_no: t.round_no, status: t.status, bets_close_at: t.bets_close_at || null, act_close_at: t.act_close_at || null,
            next_at: t.next_at || null, server_now: iso(Date.now()), bet_seconds: BET_SECONDS, act_seconds: game.actSeconds,
            dealer: t.status === 'betting' ? { cards: [], hidden: 0, total: null } : game.dealerView(t.dealer || [], revealed)
          },
          // The six chairs, in order. `hand` is that member's hand this round, if they bet.
          chairs: chairsOf(t).map((c, i) => {
            if (!c) return { seat: i, empty: true };
            const hand = seats.find((x) => x.member_id === c.member_id);
            return { seat: i, empty: false, name: c.name, avatar: c.avatar, role: c.role, mine: c.member_id === me.id, hand: hand ? seatView(hand) : null };
          }),
          my_seat: chairIndex(t, me.id),
          mine: mine ? seatView(mine) : null,
          ...(game.extra ? game.extra(settings) : {}),
          ...extra
        };
      };

      // ---------- actions ----------

      if (action === 'state') {
        // Hands left over from the single-player version: return the wager once.
        if (p.first && game.legacyEntity) {
          try {
            const L = b.asServiceRole.entities[game.legacyEntity];
            const { items } = await L.filter({ member_id: me.id, status: 'playing' }, { limit: 5 });
            for (const h of items) {
              await withMemberLock(b, me.id, async () => {
                const cur = await L.get(h.id);
                if (cur.status !== 'playing') return;
                const back = cur.staked || cur.wager || 0;
                await L.update(cur.id, { status: 'done', payout: back });
                if (back > 0) await changePoints(b, me.id, back, 'game', `${NAME} unfinished hand, wager returned`, null);
              });
            }
          } catch (e) {
            console.error('legacy refund skipped', e);
          }
        }
        let t = await advance();
        // Safety net: a round with bets but no countdown gets one.
        if (t.status === 'betting' && !t.bets_close_at && (await seatsOf(t.round_no)).length > 0) {
          t = await T.update(t.id, { bets_close_at: iso(Date.now() + BET_SECONDS * 1000) });
        }
        return Response.json(await stateOf(t));
      }

      if (action === 'sit') {
        if (!open) throw new UserError(`${NAME} is closed right now.`);
        if (me.banned) throw new UserError('You are banned from the games.', 403);
        const first = await advance();
        const t = await withRecordLock(b, 'CardTable', first.id, async () => {
          const live = await T.get(first.id);
          const chairs = chairsOf(live);
          if (chairs.some((c) => c && c.member_id === me.id)) throw new UserError("You're already sitting at this table.");
          const inPlay = new Set((await seatsOf(live.round_no)).filter((x) => !x.settled).map((x) => x.member_id));
          sweepChairs(chairs, inPlay);
          const want = Number.isInteger(p.seat) ? p.seat : chairs.findIndex((c) => !c);
          if (want < 0 || want >= SEAT_COUNT) throw new UserError('The table is full. Wait for a chair to open.');
          if (chairs[want]) throw new UserError('That chair was just taken. Pick another.');
          chairs[want] = { member_id: me.id, name: me.discord_name || me.discord_id, avatar: me.avatar_url || '', role: me.role, active_at: iso(Date.now()) };
          return await saveChairs(live, chairs);
        });
        return Response.json(await stateOf(t));
      }

      if (action === 'leave') {
        const first = await getTable();
        const t = await withRecordLock(b, 'CardTable', first.id, async () => {
          const live = await T.get(first.id);
          const chairs = chairsOf(live);
          const i = chairs.findIndex((c) => c && c.member_id === me.id);
          if (i < 0) return live;
          const mineNow = (await seatsOf(live.round_no)).find((x) => x.member_id === me.id);
          if (mineNow && !mineNow.settled) throw new UserError('Finish this round before you stand up.');
          chairs[i] = null;
          return await saveChairs(live, chairs);
        });
        return Response.json(await stateOf(t));
      }

      if (action === 'bet') {
        if (!open) throw new UserError(`${NAME} is closed right now.`);
        if (me.banned) throw new UserError('You are banned from the games.', 403);
        const wager = Math.floor(Number(p.wager));
        if (!Number.isInteger(wager) || wager < 1) throw new UserError('Enter a wager.');
        if (wager < settings.min_bet) throw new UserError(`The minimum wager is ${settings.min_bet}.`);
        if (wager > settings.max_bet) throw new UserError(`The maximum wager is ${settings.max_bet}.`);

        let t = await advance();
        const closed = (x) => x.status !== 'betting' || (x.bets_close_at && Date.parse(x.bets_close_at) - CLOSE_MARGIN_MS <= Date.now());
        if (closed(t)) throw new UserError('This round has started. Bet on the next one.');
        if (chairIndex(t, me.id) < 0) throw new UserError('Sit down at the table first.');
        const round = t.round_no;

        const balance = await withMemberLock(b, me.id, async () => {
          const member = await b.asServiceRole.entities.Member.get(me.id);
          if (member.banned) throw new UserError('You are banned from the games.', 403);
          if (wager > (member.points || 0)) throw new UserError('Not enough points for that wager.');
          const seats = await seatsOf(round);
          if (seats.some((s) => s.member_id === me.id)) throw new UserError('You already have a bet on this round.');
          const today = todayStr();
          const used = member.daily_bet_date === today ? member.daily_bet_total || 0 : 0;
          if (used + wager > settings.daily_bet_cap) {
            const left = Math.max(0, settings.daily_bet_cap - used);
            throw new UserError(left ? `Daily wager limit: ${left} left today.` : 'Daily wager limit reached. It resets at 00:00 UTC.');
          }
          // The round may have closed while we waited for the lock.
          const live = await T.get(t.id);
          if (live.round_no !== round || closed(live)) throw new UserError('This round has started. Bet on the next one.');
          const seatNo = chairIndex(live, me.id);
          if (seatNo < 0) throw new UserError('Sit down at the table first.');

          const { balance } = await changePoints(b, me.id, -wager, 'game', `${NAME} round ${round} bet`, null);
          try {
            await b.asServiceRole.entities.Member.update(me.id, { daily_bet_total: used + wager, daily_bet_date: today });
            await S.create({
              game: game.id, round_no: round, seat_no: seatNo, member_id: me.id, name: member.discord_name || member.discord_id,
              avatar: member.avatar_url || '', role: member.role, wager, staked: wager, doubled: false, cards: [],
              status: 'waiting', note: '', payout: 0, settled: false
            });
          } catch (e) {
            await changePoints(b, me.id, wager, 'game', `${NAME} bet returned`, null).catch(() => {});
            throw e;
          }
          return balance;
        });

        // The first bet of a round starts the countdown.
        t = await withRecordLock(b, 'CardTable', t.id, async () => {
          const live = await T.get(t.id);
          // Betting keeps your chair: note when this member was last active.
          const chairs = chairsOf(live);
          const i = chairs.findIndex((c) => c && c.member_id === me.id);
          const update: Record<string, unknown> = {};
          if (i >= 0) { chairs[i] = { ...chairs[i], active_at: iso(Date.now()) }; update.seats = chairs.map((c) => c || {}); }
          if (live.status === 'betting' && live.round_no === round && !live.bets_close_at) update.bets_close_at = iso(Date.now() + BET_SECONDS * 1000);
          return Object.keys(update).length ? await T.update(live.id, update) : live;
        });
        return Response.json(await stateOf(t, { balance }));
      }

      if (game.actions.includes(action)) {
        let t = await advance();
        if (t.status !== 'playing') throw new UserError('There is no hand to play right now.');
        const round = t.round_no;

        const out = await withMemberLock(b, me.id, async () => {
          const live = await T.get(t.id);
          if (live.status !== 'playing' || live.round_no !== round || live.settling_round === round ||
              !live.act_close_at || Date.parse(live.act_close_at) <= Date.now()) {
            throw new UserError('Time is up for this round.');
          }
          const { items } = await S.filter({ game: game.id, round_no: round, member_id: me.id }, { limit: 1 });
          const s = items[0];
          if (!s) throw new UserError("You're not in this round. Bet on the next one.");
          if (s.settled || s.status !== 'playing') throw new UserError('Your hand is already finished.');

          const next = game.act({ ...s, cards: [...(s.cards || [])] }, action);
          let balance;
          const fields: Record<string, unknown> = { cards: next.cards, status: next.status, note: next.note };
          if (next.extraStake && next.extraStake > 0) {
            const member = await b.asServiceRole.entities.Member.get(me.id);
            if (next.extraStake > (member.points || 0)) throw new UserError('Not enough points to double.');
            const today = todayStr();
            const used = member.daily_bet_date === today ? member.daily_bet_total || 0 : 0;
            if (used + next.extraStake > settings.daily_bet_cap) throw new UserError('Daily wager limit reached. It resets at 00:00 UTC.');
            ({ balance } = await changePoints(b, me.id, -next.extraStake, 'game', `${NAME} round ${round} double`, null));
            await b.asServiceRole.entities.Member.update(me.id, { daily_bet_total: used + next.extraStake, daily_bet_date: today });
            fields.staked = s.staked + next.extraStake;
            fields.doubled = true;
          }
          await S.update(s.id, fields);
          return { done: next.status === 'done', balance };
        });

        // When the last player finishes, settle straight away instead of waiting out the clock.
        if (out.done && allDone(await seatsOf(round))) t = await advance(true);
        else t = await T.get(t.id);
        return Response.json(await stateOf(t, out.balance !== undefined ? { balance: out.balance } : {}));
      }

      throw new UserError('Unknown action.');
    } catch (e) {
      return errorResponse(e);
    }
  };
}