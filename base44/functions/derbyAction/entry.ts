import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, todayStr, houseEdge, UserError, errorResponse, resilient
} from '../../shared/points.ts';
import {
  DERBY_NAME, DIST, PLAY, FIELD_SIZE, STABLE, makeField, makeOdds, simulate, timelineOf, raceLength,
  priceOf, validLine, betReturn, lineWins, TYPE_NAME
} from '../../shared/derby.ts';
import { postFeed } from '../../shared/feed.ts';
import { announceBigWin, announceLoss, lossWorthTelling } from '../../shared/chat.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

// Blacklist Derby, the live track: one shared race every few minutes.
//
// It runs on the clock, like Dragon Sic Bo:
//   * When a round opens, the field and the prices are worked out from the round number
//     (so two requests opening the same round together write the same horses and odds),
//     and the race is run once with a secret random seed. The finishing order and the
//     timeline are kept on the table row, which members can never read.
//   * Betting closes at bets_close_at. Only then is the race timeline sent out, so every
//     screen plays the same race. The finishing order is only sent once the race is over.
//   * Each bet keeps the price it was placed at. A bet is paid once, under its owner's lock,
//     by the `settle` action (the member's own page calls it after the race; anyone's call
//     also pays a few bets of members who left; the "Derby Payouts" schedule pays the rest).
const GAME = 'derby';
const NAME = DERBY_NAME;
const CLOCK = 'd1';
const BET_SECONDS = 75;
const RESULT_SECONDS = 15;
const ARRIVE_MARGIN_MS = 300; // a bet must reach the server this long before betting closes
// The longest the work inside a member's lock may take. The lock row lives for the helper's
// 20 s of waiting plus this, so a slow payment can never outlive its own lock.
const MEMBER_LOCK_MS = 15000;
const HISTORY = 300;          // finished races kept for paying late (about 13 hours) and for the horses' form
const DEFAULT_LIMIT = 2000;   // most a member can bet on one race (Admin: derby_max_bet)
const MAX_LINES = 20;         // separate bets a member can have on one race
// Shared secret only the "Derby Payouts" schedule knows.
const WORKFLOW_SECRET = '0e8969e4c6d6eececae2d761309a066b437efb450f70350a';

const iso = (ms: number) => new Date(ms).toISOString();
const E = (b) => b.asServiceRole.entities;
const lockMember = (b, id, fn) => withMemberLock(b, id, fn, MEMBER_LOCK_MS);
const secretSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
const limitOf = (settings) => Math.max(1, Math.min(Number(settings.max_bet) || DEFAULT_LIMIT, Number(settings.derby_max_bet) || DEFAULT_LIMIT));

// ----- the table and its clock -----
const closeMs = (t) => Date.parse(t.bets_close_at) || 0;
const endMs = (t) => Date.parse(t.race_ends_at) || 0;
const nextMs = (t) => Date.parse(t.next_at) || 0;
const usable = (t) => !!t && t.clock === CLOCK && Array.isArray(t.field) && t.field.length === FIELD_SIZE
  && Array.isArray(t.result_order) && t.result_order.length === FIELD_SIZE && t.timeline && t.odds && closeMs(t) > 0 && endMs(t) > closeMs(t);
const statusAt = (t, at: number) => (at < closeMs(t) ? 'betting' : at < endMs(t) ? 'racing' : 'result');
// The finishing order of a round, but only once its race is over. null = not known (the bet is handed back).
function orderOf(t, round: number, at: number) {
  if (round === t.round_no) return usable(t) && at >= endMs(t) ? t.result_order : null;
  const past = (t.recent || []).find((x) => x && Number(x.r) === round);
  return past && Array.isArray(past.order) && past.order.length === FIELD_SIZE ? past.order : null;
}
const roundOver = (t, round: number, at: number) => round < t.round_no || (round === t.round_no && (!usable(t) || at >= endMs(t)));

// Each horse's last three finishes, newest first, from the races kept in `recent`.
function formFrom(recent) {
  const form: Record<string, number[]> = {};
  for (const x of recent || []) {
    if (!x || !Array.isArray(x.ids) || !Array.isArray(x.order)) continue;
    x.order.forEach((i, place) => { const id = String(x.ids[i]); (form[id] ||= []); if (form[id].length < 3) form[id].push(place + 1); });
  }
  return form;
}

function newRound(round: number, recent, settings, now: number) {
  const field = makeField(round, formFrom(recent));
  const odds = makeOdds(field, round, houseEdge(settings));
  const race = simulate(field, secretSeed());
  const timeline = timelineOf(race);
  const close = now + BET_SECONDS * 1000;
  const end = close + Math.ceil((raceLength(timeline) / PLAY) * 1000);
  return {
    clock: CLOCK, round_no: round, dist: DIST, play: PLAY, field, odds,
    result_order: race.order, timeline,
    bets_close_at: iso(close), race_ends_at: iso(end), next_at: iso(end + RESULT_SECONDS * 1000), recent
  };
}

async function getTable(b, settings) {
  const { items } = await E(b).DerbyTable.filter({}, { sort: 'created_date', limit: 1 });
  if (items[0]) return items[0];
  return await E(b).DerbyTable.create(newRound(1, [], settings, Date.now()));
}

// Open the next round when the last result has been on show long enough. One write, no
// lock: two requests doing it together write the same horses and prices; whichever race
// lands last stands, and nothing about the race is shown before betting closes.
async function current(b, settings) {
  const t0 = await getTable(b, settings);
  const stale = (t) => !usable(t) || Date.now() >= nextMs(t);
  if (!stale(t0)) return t0;
  // Only one request works out the new round (pricing takes about a second); the others
  // wait for it and then read the round it opened.
  const open = async () => {
    const t = await E(b).DerbyTable.get(t0.id);
    if (!stale(t)) return t;
    const kept = (t.recent || []).filter((x) => x && Array.isArray(x.order));
    const recent = usable(t)
      ? [{ r: t.round_no, ids: t.field.map((f) => f.id), order: t.result_order }, ...kept.filter((x) => Number(x.r) !== t.round_no)].slice(0, HISTORY)
      : kept.slice(0, HISTORY);
    return await E(b).DerbyTable.update(t.id, newRound((t.round_no || 0) + 1, recent, settings, Date.now()));
  };
  try {
    return await withRecordLock(b, 'DerbyTable', t0.id, open, 10000);
  } catch (e) {
    // Waited too long behind another request: whatever it opened is on the table now.
    if (e instanceof UserError) { const t = await E(b).DerbyTable.get(t0.id); if (!stale(t)) return t; }
    throw e;
  }
}

// What everyone may see. The race timeline and the order are left out.
const publicHorse = (f) => { const h = STABLE[f.id] || STABLE[0]; return { no: f.no, id: f.id, name: h.name, silk: h.silk, cap: h.cap, coat: h.coat, pat: h.pat, sock: f.sock || 0, blink: f.blink || 0, rating: f.rating, style: f.style, form: f.form || [] }; };
function publicTable(t, now: number, rows, settings) {
  const status = statusAt(t, now);
  return {
    round_no: t.round_no, status, dist: t.dist || DIST, play: t.play || PLAY,
    bets_close_at: t.bets_close_at, race_ends_at: t.race_ends_at, next_at: t.next_at, server_now: iso(now),
    bet_seconds: BET_SECONDS, limit: limitOf(settings), min_bet: Number(settings.min_bet) || 1,
    field: t.field.map(publicHorse), odds: t.odds,
    order: status === 'result' ? t.result_order : null,
    recent: (t.recent || []).slice(0, 10).filter((x) => x && Array.isArray(x.order)).map((x) => { const h = STABLE[x.ids[x.order[0]]] || STABLE[0]; return { r: x.r, id: h.id, no: x.order[0] + 1, name: h.name, silk: h.silk }; }),
    total_bet: rows.reduce((a, x) => a + (x.amount || 0), 0), players: new Set(rows.map((x) => x.member_id)).size
  };
}

// ----- paying a bet (once) -----
// Call inside the owner's lock. Marks the bet before paying and checks the points log on a
// second attempt, so a bet is never paid twice and a win is never lost to a failed call.
// `after` collects the extras (history, live feed, Discord) to run once the lock is released.
async function payBet(b, t, row, settings, after: Array<() => Promise<void>>) {
  const cur = await E(b).DerbyBet.get(row.id).catch(() => null);
  if (!cur || cur.settled) return null;
  const now = Date.now();
  if (!roundOver(t, cur.round_no, now)) return null;
  const order = orderOf(t, cur.round_no, now);
  const payout = order ? betReturn(cur.lines, order) : cur.amount; // race no longer known: the stake goes back
  const reason = order ? `${NAME} race ${cur.round_no} win [${cur.id}]` : `${NAME} race ${cur.round_no} bet returned [${cur.id}]`;
  if (payout > 0) {
    let paid = false;
    if (cur.pay_started) {
      // Paid on an earlier try? Look for either kind of payment for this bet.
      const reasons = [`${NAME} race ${cur.round_no} win [${cur.id}]`, `${NAME} race ${cur.round_no} bet returned [${cur.id}]`];
      for (const r of reasons) {
        const { items } = await E(b).PointLog.filter({ member_id: cur.member_id, reason: r }, { limit: 1 });
        if (items.length) { paid = true; break; }
      }
    } else {
      await E(b).DerbyBet.update(cur.id, { pay_started: true });
    }
    if (!paid) await changePoints(b, cur.member_id, payout, 'game', reason, null);
  }
  await E(b).DerbyBet.update(cur.id, { payout, net: payout - cur.amount, settled: true });
  // History, the live feed and Discord are extras: never let them undo a payment, and
  // never hold the member's lock while they run.
  if (order) after.push(async () => {
    try {
      const winner = STABLE[(cur.field_ids || [])[order[0]]] || null;
      const detail = `${winner ? `${winner.name} won` : 'Race run'} · ${(cur.lines || []).map((l) => `${TYPE_NAME[l.type]} #${l.a + 1}${l.type === 'fc' ? `-#${l.b + 1}` : ''}${lineWins(l, order) ? ' ✓' : ''}`).join(', ')}`.slice(0, 120);
      await E(b).Bet.create({ member_id: cur.member_id, discord_id: '', game: GAME, wager: cur.amount, payout, won: payout > cur.amount, outcome: { round: cur.round_no, order, lines: cur.lines } });
      await postFeed(b, { id: cur.member_id, discord_name: cur.name, avatar_url: cur.avatar, role: cur.role }, { game: GAME, game_name: NAME, wager: cur.amount, payout, detail });
      const net = payout - cur.amount;
      const threshold = Number(settings.big_win_threshold) || 0;
      if (net > 0 && net >= threshold) await announceBigWin(cur.name || 'A member', NAME, net, winner ? `${winner.name} came home` : '');
      if (lossWorthTelling(settings, -net)) await announceLoss(cur.name || 'A member', NAME, -net, winner ? `${winner.name} won the race` : '');
    } catch (e) {
      console.error('derby history write failed', e);
    }
  });
  return { payout };
}
const runAfter = async (after: Array<() => Promise<void>>) => { for (const f of after) await f(); };

// Pay up to `max` finished bets of other members (who closed the page before the race ended).
async function payOthers(b, t, settings, skipMember: string, max: number) {
  let done = 0;
  let items = [];
  try {
    // Oldest first, so bets on the race still running never crowd out the ones waiting.
    ({ items } = await E(b).DerbyBet.filter({ settled: false }, { sort: 'created_date', limit: max * 4 }));
  } catch (e) {
    console.error('derby sweep skipped', e);
    return 0;
  }
  for (const row of items) {
    if (done >= max) break;
    if (row.member_id === skipMember || !roundOver(t, row.round_no, Date.now())) continue;
    done++;
    // One bad row must not stop the others being paid.
    try {
      const after = [];
      await lockMember(b, row.member_id, () => payBet(b, t, row, settings, after));
      await runAfter(after);
    } catch (e) {
      console.error('derby payout skipped', row.id, e);
    }
  }
  return done;
}

const lineKey = (l) => `${l.type}:${l.a}:${l.type === 'fc' ? l.b : ''}`;
const cleanLine = (x) => ({ type: String(x && x.type), a: Math.floor(Number(x && x.a)), b: x && x.type === 'fc' ? Math.floor(Number(x.b)) : -1, amount: Math.floor(Number(x && x.amount)) });

export default async function(req) {
  try {
    // When this request reached the server. A bet counts if it ARRIVED before betting closed.
    const arrived = Date.now();
    const b = resilient(createClientFromRequest(req));
    // clone(): the sign-in check reads the body again for the session token.
    let p; try { p = await req.clone().json(); } catch { p = {}; }

    // The "Derby Payouts" schedule: pays finished bets even if nobody is on the site.
    if (p.action === 'sweep') {
      if (p.__wf_secret !== WORKFLOW_SECRET) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
      const settings = await getSettings(b);
      const { items } = await E(b).DerbyTable.filter({}, { sort: 'created_date', limit: 1 });
      if (!items[0]) return Response.json({ ok: true, paid: 0 });
      const paid = await payOthers(b, items[0], settings, '', 25);
      return Response.json({ ok: true, paid });
    }

    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');
    const settings = await getSettings(b);
    const open = (settings.games_enabled || []).includes(GAME);
    const CLOSED = 'Betting is closed for this race. Wait for the next one.';

    // ---------- look at the track (no locks; at most one write, to open a round) ----------
    if (p.action === 'state') {
      if (!open) throw new UserError('The Derby is closed right now.');
      const t = await current(b, settings);
      const now = Date.now();
      const status = statusAt(t, now);
      const { items: rows } = await E(b).DerbyBet.filter({ round_no: t.round_no }, { limit: 300 });
      const byMember = new Map();
      for (const x of rows) {
        const k = byMember.get(x.member_id) || { member_id: x.member_id, name: x.name, avatar: x.avatar, role: x.role, amount: 0, lines: [], settled: true };
        k.amount += x.amount || 0; k.lines.push(...(x.lines || [])); k.settled = k.settled && !!x.settled;
        byMember.set(x.member_id, k);
      }
      const order = status === 'result' ? t.result_order : null;
      const bets = [...byMember.values()].map((k) => {
        const payout = order ? betReturn(k.lines, order) : 0;
        return { name: k.name, avatar: k.avatar, role: k.role, amount: k.amount, lines: k.lines, payout, net: order ? payout - k.amount : 0, done: !!order, mine: k.member_id === me.id };
      });
      const own = byMember.get(me.id);
      return Response.json({
        table: publicTable(t, now, rows, settings),
        bets,
        mine: own ? { round_no: t.round_no, lines: own.lines, amount: own.amount } : null,
        owed: status === 'result' && rows.some((x) => x.member_id === me.id && !x.settled)
      });
    }

    // ---------- the race itself: only once betting has closed ----------
    if (p.action === 'race') {
      if (!open) throw new UserError('The Derby is closed right now.');
      const t = await current(b, settings);
      const now = Date.now();
      if (Number(p.round) && Number(p.round) !== t.round_no) throw new UserError('That race is over.', 409);
      if (now < closeMs(t)) throw new UserError('Betting is still open. The race starts when it closes.', 409);
      const status = statusAt(t, now);
      const tl = t.timeline;
      // The finishing order only comes with the timeline once the race is over; before that the
      // screen works it out from the timeline as the horses cross the line.
      return Response.json({
        round_no: t.round_no, status, bets_close_at: t.bets_close_at, race_ends_at: t.race_ends_at, server_now: iso(now), play: t.play || PLAY,
        timeline: { v: tl.v, dt: tl.dt, P: tl.P, L: tl.L, fin: tl.fin }
      });
    }

    // ---------- collect: pay this member's finished bets, and a few left by others ----------
    if (p.action === 'settle') {
      const t = await current(b, settings);
      let mineLeft = 0;
      const after = [];
      await lockMember(b, me.id, async () => {
        const { items } = await E(b).DerbyBet.filter({ member_id: me.id, settled: false }, { limit: 10 });
        for (const row of items) {
          if (!roundOver(t, row.round_no, Date.now())) { mineLeft++; continue; }
          await payBet(b, t, row, settings, after);
        }
      });
      await runAfter(after);
      await payOthers(b, t, settings, me.id, 3);
      return Response.json({ ok: true, pending: mineLeft });
    }

    // ---------- place bets ----------
    if (p.action === 'bet') {
      if (!open) throw new UserError('The Derby is closed right now.');
      if (me.banned) throw new UserError('You are banned from the games.', 403);
      const raw = Array.isArray(p.lines) ? p.lines : [];
      if (!raw.length) throw new UserError('Pick a horse and an amount first.');
      if (raw.length > 10) throw new UserError('Too many bets at once.');
      const asked = raw.map(cleanLine);
      if (!asked.every((l) => validLine(l))) throw new UserError('One of those bets is not valid.');
      const minBet = Math.max(1, Number(settings.min_bet) || 1);
      if (asked.some((l) => l.amount < minBet)) throw new UserError(`Each bet must be at least ${minBet.toLocaleString()} points.`);
      const total = asked.reduce((a, l) => a + l.amount, 0);

      const t = await current(b, settings);
      if (!usable(t) || arrived >= closeMs(t) - ARRIVE_MARGIN_MS) throw new UserError(CLOSED);
      // The bet was made on the race card of this round; never move it onto another race.
      if (p.round !== undefined && Number(p.round) !== t.round_no) throw new UserError(CLOSED);
      const round = t.round_no;
      // Each bet is placed at the price on the card right now, and keeps it.
      const lines = asked.map((l) => ({ ...l, price: priceOf(t.odds, l) }));
      if (lines.some((l) => !(l.price > 1))) throw new UserError("That bet isn't offered on this race.");
      const limit = limitOf(settings);

      const result = await lockMember(b, me.id, async () => {
        const { items } = await E(b).DerbyBet.filter({ round_no: round, member_id: me.id }, { limit: 5 });
        if (items.some((x) => x.settled)) throw new UserError(CLOSED);
        const existing = items[0];
        const already = items.reduce((a, x) => a + (x.amount || 0), 0);
        if (already + total > limit) throw new UserError(`You can bet up to ${limit.toLocaleString()} on one race (${Math.max(0, limit - already).toLocaleString()} left).`);
        const merged = (existing ? existing.lines || [] : []).map((l) => ({ ...l }));
        for (const l of lines) { const k = merged.find((m) => lineKey(m) === lineKey(l)); if (k) k.amount += l.amount; else merged.push(l); }
        if (merged.length > MAX_LINES) throw new UserError(`You can have up to ${MAX_LINES} different bets on one race.`);
        const today = todayStr();
        // Read the member again inside the lock: two bets at once must both count.
        const fresh = await E(b).Member.get(me.id).catch(() => me);
        const usedToday = fresh.daily_bet_date === today ? fresh.daily_bet_total || 0 : 0;
        if (usedToday + total > settings.daily_bet_cap) throw new UserError('Daily wager limit reached. It resets at 00:00 UTC.');
        // Betting must still be open now that we hold the lock.
        if (Date.now() >= closeMs(t)) throw new UserError(CLOSED);

        let balance;
        try { ({ balance } = await changePoints(b, me.id, -total, 'game', `${NAME} race ${round} bet`, null)); }
        catch (e) { throw /not enough/i.test(String(e && e.message)) ? new UserError('Not enough points for that bet.') : e; }
        const daily = E(b).Member.update(me.id, { daily_bet_total: usedToday + total, daily_bet_date: today }).catch(() => {});
        let row;
        try {
          if (existing) row = await E(b).DerbyBet.update(existing.id, { lines: merged, amount: (existing.amount || 0) + total });
          else {
            row = await E(b).DerbyBet.create({
              round_no: round, member_id: me.id, name: me.discord_name || me.discord_id, avatar: me.avatar_url || '', role: me.role,
              field_ids: t.field.map((f) => f.id), lines: merged, amount: total, payout: 0, net: 0, settled: false, pay_started: false
            });
          }
        } catch (e) {
          // Did the save actually go through (the answer was lost)? Then the bet stands.
          const want = (existing ? existing.amount || 0 : 0) + total;
          const check = await E(b).DerbyBet.filter({ round_no: round, member_id: me.id }, { limit: 5 }).catch(() => null);
          const saved = check && check.items.find((x) => (x.amount || 0) === want);
          if (saved) row = saved;
          else {
            // The bet didn't make it onto the race: hand the points straight back.
            await daily;
            await changePoints(b, me.id, total, 'game', `${NAME} race ${round} bet returned`, null).catch(() => {});
            throw e;
          }
        }
        await daily;
        return { balance, mine: { round_no: round, lines: row.lines, amount: row.amount } };
      });
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    // ---------- take a bet back (only while betting is open) ----------
    if (p.action === 'remove') {
      const all = p.all === true;
      const key = all ? '' : lineKey(cleanLine(p.line || {}));
      const STAY = 'Betting is closed. Your bets stay on the race.';
      const t = await current(b, settings);
      if (!usable(t) || arrived >= closeMs(t) - ARRIVE_MARGIN_MS) throw new UserError(STAY);
      if (p.round !== undefined && Number(p.round) !== t.round_no) throw new UserError(STAY);
      const round = t.round_no;
      const result = await lockMember(b, me.id, async () => {
        const { items } = await E(b).DerbyBet.filter({ round_no: round, member_id: me.id }, { limit: 5 });
        const existing = items[0];
        if (!existing || items.some((x) => x.settled)) throw new UserError('You have no bets on this race.');
        if (Date.now() >= closeMs(t)) throw new UserError(STAY);
        const lines = (existing.lines || []).map((l) => ({ ...l }));
        const left = all ? [] : lines.filter((l) => lineKey(l) !== key);
        const back = lines.reduce((a, l) => a + l.amount, 0) - left.reduce((a, l) => a + l.amount, 0);
        if (back <= 0) throw new UserError('That bet is not on this race.');
        // The bet comes off the race BEFORE the points go back.
        let row = null;
        if (left.length) row = await E(b).DerbyBet.update(existing.id, { lines: left, amount: existing.amount - back });
        else await E(b).DerbyBet.delete(existing.id);
        const { balance } = await changePoints(b, me.id, back, 'game', `${NAME} race ${round} bet taken back`, null);
        const fresh = await E(b).Member.get(me.id).catch(() => me);
        if (fresh.daily_bet_date === todayStr()) await E(b).Member.update(me.id, { daily_bet_total: Math.max(0, (fresh.daily_bet_total || 0) - back) }).catch(() => {});
        return { balance, mine: row ? { round_no: round, lines: row.lines, amount: row.amount } : null };
      });
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    throw new UserError('Unknown Derby action.');
  } catch (e) {
    return errorResponse(e);
  }
}