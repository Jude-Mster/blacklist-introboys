// Bets on Blacklist Arena fights, shared by the Live Arena (arenaAction) and the tournament
// matches (tournamentAction). One ArenaBet row holds one member's bets on one fight.
//
// How a bet is kept safe (the same way as the Derby):
//   * Each line keeps the price (and over/under line) it was placed at.
//   * Points are taken first, then the bet is saved; if the save fails the points go back.
//   * A bet is paid once, inside its owner's lock. It is marked pay_started before the
//     points move, and a retry looks in the points log before paying again.
import { changePoints, withMemberLock, todayStr, UserError } from './points.ts';
import { lineKeyOk, priceFor, lineOf, betReturn, lineLabel, conflictIn } from './arenaEngine.ts';
import { postFeed } from './feed.ts';
import { announceBigWin, announceLoss, lossWorthTelling } from './chat.ts';

export const ARENA_NAME = 'Blacklist Arena';
export const ARRIVE_MARGIN_MS = 300;  // a bet must reach the server this long before betting closes
const MEMBER_LOCK_MS = 15000;
const MAX_LINES = 12;
export const DEFAULT_ARENA_LIMIT = 5000;

const E = (b) => b.asServiceRole.entities;
export const lockMember = (b, id: string, fn) => withMemberLock(b, id, fn, MEMBER_LOCK_MS);
export const arenaLimit = (settings) => Math.max(1, Number(settings.arena_max_bet) || DEFAULT_ARENA_LIMIT);
export const arenaMin = (settings) => Math.max(1, Number(settings.arena_min_bet) || 1);

// Which fight a bet belongs to.
export type FightKey = { scope: 'live'; round_no: number } | { scope: 'tour'; tour_id: string; match_no: number };
const keyFilter = (k: FightKey) => (k.scope === 'live' ? { scope: 'live', round_no: k.round_no } : { scope: 'tour', tour_id: k.tour_id, match_no: k.match_no });

// The lines a member asked for, checked against the fight's prices. Each gets its price now.
export function priceLines(raw, odds, minBet: number) {
  if (!Array.isArray(raw) || !raw.length) throw new UserError('Pick a bet and an amount first.');
  if (raw.length > MAX_LINES) throw new UserError('Too many bets at once.');
  return raw.map((x) => {
    const k = String(x && x.k || ''), amount = Math.floor(Number(x && x.amount));
    if (!lineKeyOk(k, odds)) throw new UserError("That bet isn't offered on this fight.");
    if (!Number.isInteger(amount) || amount < minBet) throw new UserError(`Each bet must be at least ${minBet.toLocaleString()} points.`);
    const price = priceFor(k, odds);
    if (!(price > 1)) throw new UserError("That bet isn't offered on this fight.");
    const line = lineOf(k, odds);
    return line == null ? { k, amount, price } : { k, amount, price, line };
  });
}

// Place bets on a fight. `closeAt` = when betting closes (ms). Returns { balance, mine }.
export async function placeBets(b, me, settings, o: { key: FightKey; label: string; names: string[]; closeAt: number; arrived: number; odds; raw }) {
  if (me.banned) throw new UserError('You are banned from the games.', 403);
  const CLOSED = 'Betting is closed for this fight. Wait for the next one.';
  if (o.arrived >= o.closeAt - ARRIVE_MARGIN_MS) throw new UserError(CLOSED);
  const lines = priceLines(o.raw, o.odds, arenaMin(settings));
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const limit = arenaLimit(settings);
  return await lockMember(b, me.id, async () => {
    const { items } = await E(b).ArenaBet.filter({ ...keyFilter(o.key), member_id: me.id }, { limit: 5 });
    if (items.some((x) => x.settled)) throw new UserError(CLOSED);
    const existing = items[0];
    const already = items.reduce((a, x) => a + (x.amount || 0), 0);
    if (already + total > limit) throw new UserError(`You can bet up to ${limit.toLocaleString()} on one fight (${Math.max(0, limit - already).toLocaleString()} left).`);
    // The same bet placed again adds to it, at the new price for the new part.
    const merged = (existing ? existing.lines || [] : []).map((l) => ({ ...l }));
    for (const l of lines) {
      const k = merged.find((m) => m.k === l.k && m.price === l.price && (m.line ?? null) === (l.line ?? null));
      if (k) k.amount += l.amount; else merged.push(l);
    }
    if (merged.length > MAX_LINES * 2) throw new UserError('You have too many separate bets on this fight.');
    // Never both sides of the same question on one fight (both fighters, both sides of an over/under).
    const clash = conflictIn(merged.map((l) => l.k));
    if (clash) throw new UserError(`You can't bet on both "${lineLabel({ k: clash[0], line: lineOf(clash[0], o.odds) }, o.names)}" and "${lineLabel({ k: clash[1], line: lineOf(clash[1], o.odds) }, o.names)}" on the same fight.`);
    const today = todayStr();
    const fresh = await E(b).Member.get(me.id).catch(() => me);
    const usedToday = fresh.daily_bet_date === today ? fresh.daily_bet_total || 0 : 0;
    if (usedToday + total > (Number(settings.daily_bet_cap) || Infinity)) throw new UserError('Daily wager limit reached. It resets at 00:00 UTC.');
    if (Date.now() >= o.closeAt) throw new UserError(CLOSED);

    let balance;
    try { ({ balance } = await changePoints(b, me.id, -total, 'game', `${o.label} bet`, null)); }
    catch (e) { throw /not enough/i.test(String(e && e.message)) ? new UserError('Not enough points for that bet.') : e; }
    const daily = E(b).Member.update(me.id, { daily_bet_total: usedToday + total, daily_bet_date: today }).catch(() => {});
    let row;
    try {
      if (existing) row = await E(b).ArenaBet.update(existing.id, { lines: merged, amount: (existing.amount || 0) + total });
      else row = await E(b).ArenaBet.create({
        ...keyFilter(o.key), label: o.label, names: o.names, member_id: me.id, name: me.discord_name || me.discord_id, avatar: me.avatar_url || '', role: me.role,
        lines: merged, amount: total, payout: 0, net: 0, settled: false, pay_started: false
      });
    } catch (e) {
      const want = (existing ? existing.amount || 0 : 0) + total;
      const check = await E(b).ArenaBet.filter({ ...keyFilter(o.key), member_id: me.id }, { limit: 5 }).catch(() => null);
      const saved = check && check.items.find((x) => (x.amount || 0) === want);
      if (saved) row = saved;
      else {
        await daily;
        await changePoints(b, me.id, total, 'game', `${o.label} bet returned`, null).catch(() => {});
        throw e;
      }
    }
    await daily;
    return { balance, mine: { lines: row.lines, amount: row.amount } };
  });
}

// Take bets back while betting is open: all of them, or every line of one kind (k).
export async function removeBets(b, me, o: { key: FightKey; label: string; closeAt: number; arrived: number; all: boolean; k: string }) {
  const STAY = 'Betting is closed. Your bets stay on the fight.';
  if (o.arrived >= o.closeAt - ARRIVE_MARGIN_MS) throw new UserError(STAY);
  return await lockMember(b, me.id, async () => {
    const { items } = await E(b).ArenaBet.filter({ ...keyFilter(o.key), member_id: me.id }, { limit: 5 });
    const existing = items[0];
    if (!existing || items.some((x) => x.settled)) throw new UserError('You have no bets on this fight.');
    if (Date.now() >= o.closeAt) throw new UserError(STAY);
    const lines = (existing.lines || []).map((l) => ({ ...l }));
    const left = o.all ? [] : lines.filter((l) => l.k !== o.k);
    const back = lines.reduce((a, l) => a + l.amount, 0) - left.reduce((a, l) => a + l.amount, 0);
    if (back <= 0) throw new UserError('That bet is not on this fight.');
    let row = null;
    if (left.length) row = await E(b).ArenaBet.update(existing.id, { lines: left, amount: existing.amount - back });
    else await E(b).ArenaBet.delete(existing.id);
    const { balance } = await changePoints(b, me.id, back, 'game', `${o.label} bet taken back`, null);
    const fresh = await E(b).Member.get(me.id).catch(() => me);
    if (fresh.daily_bet_date === todayStr()) await E(b).Member.update(me.id, { daily_bet_total: Math.max(0, (fresh.daily_bet_total || 0) - back) }).catch(() => {});
    return { balance, mine: row ? { lines: row.lines, amount: row.amount } : null };
  });
}

// What a bet's fight came to. over = false: not finished yet. o = null: the fight is no longer
// known (the stake goes back).
export type Resolve = (row) => Promise<{ over: boolean; o?: any; detail?: string }>;

// Pay one bet, once. Call inside the owner's lock. Extras (history, feed, Discord) go in `after`.
export async function payBet(b, row, resolve: Resolve, settings, after: Array<() => Promise<void>>) {
  const cur = await E(b).ArenaBet.get(row.id).catch(() => null);
  if (!cur || cur.settled) return null;
  const r = await resolve(cur);
  if (!r.over) return null;
  const o = r.o || null;
  const label = cur.label || ARENA_NAME;
  const payout = o ? betReturn(cur.lines, o, {}) : cur.amount;
  const winReason = `${label} paid [${cur.id}]`, backReason = `${label} bet returned [${cur.id}]`;
  if (payout > 0) {
    let paid = false;
    if (cur.pay_started) {
      for (const reason of [winReason, backReason]) {
        const { items } = await E(b).PointLog.filter({ member_id: cur.member_id, reason }, { limit: 1 });
        if (items.length) { paid = true; break; }
      }
    } else {
      await E(b).ArenaBet.update(cur.id, { pay_started: true });
    }
    if (!paid) await changePoints(b, cur.member_id, payout, 'game', o ? winReason : backReason, null);
  }
  await E(b).ArenaBet.update(cur.id, { payout, net: payout - cur.amount, settled: true });
  if (o) after.push(async () => {
    try {
      const names = cur.names || ['Fighter A', 'Fighter B'];
      const result = o.draw ? 'Draw' : `${names[o.winner] || 'A fighter'} won`;
      const detail = `${result} · ${(cur.lines || []).map((l) => lineLabel(l, names)).join(', ')}`.slice(0, 120);
      await E(b).Bet.create({ member_id: cur.member_id, discord_id: '', game: 'arena', wager: cur.amount, payout, won: payout > cur.amount, outcome: { label, names, result: o, lines: cur.lines } });
      await postFeed(b, { id: cur.member_id, discord_name: cur.name, avatar_url: cur.avatar, role: cur.role }, { game: 'arena', game_name: ARENA_NAME, wager: cur.amount, payout, detail });
      const net = payout - cur.amount;
      const threshold = Number(settings.big_win_threshold) || 0;
      if (net > 0 && net >= threshold) await announceBigWin(cur.name || 'A member', ARENA_NAME, net, result);
      if (lossWorthTelling(settings, -net)) await announceLoss(cur.name || 'A member', ARENA_NAME, -net, result);
    } catch (e) {
      console.error('arena history write failed', e);
    }
  });
  return { payout };
}
export const runAfter = async (after: Array<() => Promise<void>>) => { for (const f of after) await f(); };

// Pay this member's finished bets.
export async function payMine(b, me, scopeFilter, resolve: Resolve, settings) {
  let pending = 0;
  const after = [];
  await lockMember(b, me.id, async () => {
    const { items } = await E(b).ArenaBet.filter({ ...scopeFilter, member_id: me.id, settled: false }, { limit: 10 });
    for (const row of items) {
      const res = await payBet(b, row, resolve, settings, after);
      if (!res) pending++;
    }
  });
  await runAfter(after);
  return pending;
}

// Pay up to `max` finished bets of other members (who closed the page before the fight ended).
export async function payOthers(b, scopeFilter, resolve: Resolve, settings, skipMember: string, max: number) {
  let done = 0, items = [];
  try {
    ({ items } = await E(b).ArenaBet.filter({ ...scopeFilter, settled: false }, { sort: 'created_date', limit: max * 4 }));
  } catch (e) {
    console.error('arena sweep skipped', e);
    return 0;
  }
  for (const row of items) {
    if (done >= max) break;
    if (row.member_id === skipMember) continue;
    try {
      const pre = await resolve(row);
      if (!pre.over) continue;
      done++;
      const after = [];
      await lockMember(b, row.member_id, () => payBet(b, row, resolve, settings, after));
      await runAfter(after);
    } catch (e) {
      console.error('arena payout skipped', row.id, e);
    }
  }
  return done;
}

// Everyone's bets on one fight, for the bet board. Payouts are only worked out once `o` is known.
export async function betBoard(b, key: FightKey, meId: string, o) {
  const { items: rows } = await E(b).ArenaBet.filter(keyFilter(key), { limit: 300 });
  const bets = rows.map((x) => {
    const payout = o ? betReturn(x.lines, o, {}) : 0;
    return { name: x.name, avatar: x.avatar, role: x.role, amount: x.amount || 0, lines: x.lines || [], payout, net: o ? payout - (x.amount || 0) : 0, done: !!o, mine: x.member_id === meId };
  });
  const own = rows.find((x) => x.member_id === meId);
  return {
    bets,
    mine: own ? { lines: own.lines, amount: own.amount } : null,
    owed: !!o && rows.some((x) => x.member_id === meId && !x.settled),
    total_bet: rows.reduce((a, x) => a + (x.amount || 0), 0),
    players: new Set(rows.map((x) => x.member_id)).size
  };
}