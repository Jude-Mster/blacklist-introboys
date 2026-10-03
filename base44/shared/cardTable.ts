// Shared engine for the multiplayer card tables (Blackjack, Lucky 9).
// One table per game. Everyone at the table plays their own hand against the
// same dealer, and all hands are settled together.
//
//   betting  - the first bet starts a countdown; anyone can join until it ends
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
const MAX_SEATS = 12;

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
        return await T.create({ game: game.id, round_no: 1, status: 'betting', dealer: [] });
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
            t = await T.update(t.id, { round_no: (t.round_no || 0) + 1, status: 'betting', bets_close_at: null, act_close_at: null, next_at: null, dealer: [] });
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
            dealer: t.status === 'betting' ? { cards: [], hidden: 0, total: null } : game.dealerView(t.dealer || [], revealed),
            max_seats: MAX_SEATS
          },
          seats: seats.map(seatView).sort((a, c) => Number(c.mine) - Number(a.mine)),
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
        const round = t.round_no;

        const balance = await withMemberLock(b, me.id, async () => {
          const member = await b.asServiceRole.entities.Member.get(me.id);
          if (member.banned) throw new UserError('You are banned from the games.', 403);
          if (wager > (member.points || 0)) throw new UserError('Not enough points for that wager.');
          const seats = await seatsOf(round);
          if (seats.some((s) => s.member_id === me.id)) throw new UserError('You already have a bet on this round.');
          if (seats.length >= MAX_SEATS) throw new UserError('The table is full this round. Join the next one.');
          const today = todayStr();
          const used = member.daily_bet_date === today ? member.daily_bet_total || 0 : 0;
          if (used + wager > settings.daily_bet_cap) {
            const left = Math.max(0, settings.daily_bet_cap - used);
            throw new UserError(left ? `Daily wager limit: ${left} left today.` : 'Daily wager limit reached. It resets at 00:00 UTC.');
          }
          // The round may have closed while we waited for the lock.
          const live = await T.get(t.id);
          if (live.round_no !== round || closed(live)) throw new UserError('This round has started. Bet on the next one.');

          const { balance } = await changePoints(b, me.id, -wager, 'game', `${NAME} round ${round} bet`, null);
          try {
            await b.asServiceRole.entities.Member.update(me.id, { daily_bet_total: used + wager, daily_bet_date: today });
            const seat = await S.create({
              game: game.id, round_no: round, member_id: me.id, name: member.discord_name || member.discord_id,
              avatar: member.avatar_url || '', role: member.role, wager, staked: wager, doubled: false, cards: [],
              status: 'waiting', note: '', payout: 0, settled: false
            });
            // Several members can sit down in the same instant. If that pushed the table
            // past its limit, the latest arrivals give their seat back.
            const order = (await seatsOf(round)).sort((a, c) => String(a.created_date || '').localeCompare(String(c.created_date || '')) || String(a.id).localeCompare(String(c.id)));
            if (order.findIndex((x) => x.id === seat.id) >= MAX_SEATS) {
              await S.delete(seat.id);
              throw new UserError('The table is full this round. Join the next one.');
            }
          } catch (e) {
            await changePoints(b, me.id, wager, 'game', `${NAME} bet returned`, null).catch(() => {});
            throw e;
          }
          return balance;
        });

        // The first bet of a round starts the countdown.
        t = await withRecordLock(b, 'CardTable', t.id, async () => {
          const live = await T.get(t.id);
          if (live.status === 'betting' && live.round_no === round && !live.bets_close_at) {
            return await T.update(live.id, { bets_close_at: iso(Date.now() + BET_SECONDS * 1000) });
          }
          return live;
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