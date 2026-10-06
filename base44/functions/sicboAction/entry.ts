import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, todayStr, randInt, UserError, errorResponse
} from '../../shared/points.ts';
import { SICBO_NAME, validSicboBet, validDice, sicboPayout, describeRoll } from '../../shared/sicbo.ts';
import { postFeed } from '../../shared/feed.ts';
import { announceBigWin, announceLoss, lossWorthTelling } from '../../shared/chat.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

// Dragon Sic Bo: one shared table that runs on the clock.
//
// How a round works (built to need as few database calls as possible, because the
// platform limits them and a slow or refused call used to leave the table stuck):
//
//   * The dice for a round are rolled WHEN THE ROUND OPENS and kept on the table row,
//     which members can never read. Nothing about them is sent out until bets close.
//   * "Bets are closed" and "here are the dice" are worked out from the clock when the
//     table is read. Showing the roll therefore needs no write, no lock and no waiting:
//     the moment the countdown ends, the next read carries the dice.
//   * Paying is separate from showing. Each member's bet is paid by the `settle` action
//     (their own page calls it right after the roll; anyone's call also pays a few bets
//     of members who have left). A bet is paid once, under that member's own lock.
//   * Opening the next round is a single write.
//
// It takes the place of the old solo Dragon Dice and is switched on by the same game setting.
const GAME = 'dragondice';
const BET_SECONDS = 15;
const ROLL_SECONDS = 4;   // length of the dice animation on the page (ROLL_MS in SicBo.jsx)
const RESULT_SECONDS = ROLL_SECONDS + 4;
const ARRIVE_MARGIN_MS = 200; // a chip must reach the server this long before the close
const MEMBER_LOCK_MS = -8000; // added to the lock helper's 20 s: a left-over lock clears after 12 s
const HISTORY = 40;           // finished rounds whose dice are kept for paying late
const NAME = SICBO_NAME;

const iso = (ms: number) => new Date(ms).toISOString();
const lockMember = (b, id, fn) => withMemberLock(b, id, fn, MEMBER_LOCK_MS);
const rollDice = () => [randInt(6) + 1, randInt(6) + 1, randInt(6) + 1];
const E = (b) => b.asServiceRole.entities;

// ----- the table and its clock -----
async function getTable(b) {
  const { items } = await E(b).SicBoTable.filter({}, { sort: 'created_date', limit: 1 });
  if (items[0]) return items[0];
  const now = Date.now();
  return await E(b).SicBoTable.create({
    clock: 'v2', round_no: 1, status: 'betting', result_dice: rollDice(), bets_close_at: iso(now + BET_SECONDS * 1000),
    next_at: iso(now + (BET_SECONDS + RESULT_SECONDS) * 1000), recent: []
  });
}
const closeMs = (t) => Date.parse(t.bets_close_at) || 0;
const nextMs = (t) => closeMs(t) + RESULT_SECONDS * 1000;
// A row from before this version (or one that is damaged) has no clock or no dice: start a fresh round.
const usable = (t) => validDice(t.result_dice) && closeMs(t) > 0 && t.clock === 'v2';
const closedAt = (t, at: number) => at >= closeMs(t);
// Finished rounds are remembered as "round:dice", e.g. "39:436", newest first.
const pastDice = (t, round: number) => {
  for (const x of t.recent || []) {
    const [r, d] = String(x).split(':');
    if (d && Number(r) === round) { const dice = d.split('').map(Number); return validDice(dice) ? dice : null; }
  }
  return null;
};
// The dice of a round, but only once that round has closed. null = not known (pay the bet back).
const diceOf = (t, round: number, at: number) => (round === t.round_no ? (usable(t) && closedAt(t, at) ? t.result_dice : null) : pastDice(t, round));
const roundClosed = (t, round: number, at: number) => round < t.round_no || (round === t.round_no && (!usable(t) || closedAt(t, at)));

// Open the next round when the result has been on show long enough. One write, no lock:
// if two requests do it together they write the same round number and the last one's
// dice stand, which is fine because no dice are ever shown before bets close.
async function current(b) {
  let t = await getTable(b);
  const now = Date.now();
  if (usable(t) && now < nextMs(t)) return t;
  const recent = usable(t)
    ? [`${t.round_no}:${t.result_dice.join('')}`, ...(t.recent || []).filter((x) => String(x).includes(':'))].slice(0, HISTORY)
    : (t.recent || []).filter((x) => String(x).includes(':')).slice(0, HISTORY);
  t = await E(b).SicBoTable.update(t.id, {
    clock: 'v2', round_no: (t.round_no || 0) + 1, status: 'betting', result_dice: rollDice(),
    bets_close_at: iso(now + BET_SECONDS * 1000), next_at: iso(now + (BET_SECONDS + RESULT_SECONDS) * 1000),
    settled_at: iso(now + BET_SECONDS * 1000), recent, settling_round: 0
  });
  return t;
}

const publicTable = (t, now: number, bets) => {
  const closed = closedAt(t, now);
  const past = (t.recent || []).map((x) => String(x).split(':')[1] || '').map((d) => d.split('').map(Number)).filter(validDice);
  return {
    round_no: t.round_no, status: closed ? 'settled' : 'betting', bets_close_at: t.bets_close_at,
    settled_at: t.bets_close_at, next_at: iso(nextMs(t)),
    // The dice are only sent once bets have closed.
    dice: closed ? t.result_dice : null,
    recent: closed ? [t.result_dice, ...past] : past,
    total_bet: bets.reduce((a, x) => a + (x.amount || 0), 0), players: new Set(bets.map((x) => x.member_id)).size,
    bet_seconds: BET_SECONDS, server_now: iso(now)
  };
};

// ----- paying a bet (once) -----
// Call inside the owner's lock. Marks the bet before paying and checks the points log on a
// second attempt, so a bet is never paid twice and a win is never lost to a failed call.
async function payBet(b, t, row, settings) {
  const cur = await E(b).SicBoBet.get(row.id).catch(() => null);
  if (!cur || cur.settled) return null;
  const now = Date.now();
  if (!roundClosed(t, cur.round_no, now)) return null;
  const dice = diceOf(t, cur.round_no, now);
  const payout = dice ? sicboPayout(cur.bets, dice) : cur.amount; // dice no longer known: the bet is handed back
  const reason = dice ? `${NAME} round ${cur.round_no} win [${cur.id}]` : `${NAME} round ${cur.round_no} bet returned [${cur.id}]`;
  if (payout > 0) {
    let paid = false;
    if (cur.pay_started) {
      const { items } = await E(b).PointLog.filter({ member_id: cur.member_id, reason }, { limit: 1 });
      paid = items.length > 0;
    } else {
      await E(b).SicBoBet.update(cur.id, { pay_started: true });
    }
    if (!paid) await changePoints(b, cur.member_id, payout, 'game', reason, null);
  }
  await E(b).SicBoBet.update(cur.id, { payout, net: payout - cur.amount, settled: true });
  // History and the live feed are extras: never let them undo a payment.
  if (dice) {
    try {
      await E(b).Bet.create({
        member_id: cur.member_id, discord_id: '', game: GAME, wager: cur.amount, payout, won: payout > cur.amount,
        outcome: { dice, total: dice[0] + dice[1] + dice[2], round: cur.round_no, bets: cur.bets }
      });
      await postFeed(b, { id: cur.member_id, discord_name: cur.name, avatar_url: cur.avatar, role: cur.role }, {
        game: GAME, game_name: NAME, wager: cur.amount, payout, detail: `Rolled ${describeRoll(dice)}`
      });
      const net = payout - cur.amount;
      const threshold = Number(settings.big_win_threshold) || 0;
      if (net > 0 && net >= threshold) await announceBigWin(cur.name || 'A member', NAME, net, `rolled ${describeRoll(dice)}`);
      if (lossWorthTelling(settings, -net)) await announceLoss(cur.name || 'A member', NAME, -net, `rolled ${describeRoll(dice)}`);
    } catch (e) {
      console.error('sic bo history write failed', e);
    }
  }
  return { payout };
}

export default async function(req) {
  try {
    // When this request reached the server. A chip counts if it ARRIVED before bets closed,
    // however long the checks and the lock take afterwards.
    const arrived = Date.now();
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');
    const settings = await getSettings(b);
    if (!(settings.games_enabled || []).includes(GAME)) throw new UserError('Dragon Sic Bo is closed right now.');
    const inTime = (t) => usable(t) && arrived < closeMs(t) - ARRIVE_MARGIN_MS;
    const CLOSED = 'Bets are closed for this roll. Wait for the next round.';

    // ---------- look at the table (no locks; at most one write, to open a round) ----------
    if (p.action === 'state') {
      const t = await current(b);
      const now = Date.now();
      const closed = closedAt(t, now);
      const { items: rows } = await E(b).SicBoBet.filter({ round_no: t.round_no }, { limit: 200 });
      // One line per member (a member normally has one row; add them up if there are more).
      const byMember = new Map();
      for (const x of rows) {
        const k = byMember.get(x.member_id) || { member_id: x.member_id, name: x.name, avatar: x.avatar, role: x.role, amount: 0, spots: [], round_no: x.round_no };
        k.amount += x.amount || 0;
        for (const c of x.bets || []) { const s = k.spots.find((m) => m.type === c.type); if (s) s.amount += c.amount; else k.spots.push({ type: c.type, amount: c.amount }); }
        byMember.set(x.member_id, k);
      }
      const bets = [...byMember.values()].map((k) => {
        // Once the dice are out, what each bet won is worked out here straight away, whether
        // or not the points have been handed over yet.
        const payout = closed ? sicboPayout(k.spots, t.result_dice) : 0;
        return { name: k.name, avatar: k.avatar, role: k.role, amount: k.amount, payout, net: closed ? payout - k.amount : 0, settled: closed, mine: k.member_id === me.id, spots: k.spots };
      });
      const own = byMember.get(me.id);
      return Response.json({
        table: publicTable(t, now, rows),
        bets,
        mine: own ? { round_no: t.round_no, bets: own.spots, amount: own.amount } : null,
        // true = the page should call `settle` to collect (it shows the roll first)
        owed: closed && rows.some((x) => x.member_id === me.id && !x.settled)
      });
    }

    // ---------- collect: pay this member's finished bets, and a few left by others ----------
    if (p.action === 'settle') {
      const t = await current(b);
      let mineLeft = 0;
      await lockMember(b, me.id, async () => {
        const { items } = await E(b).SicBoBet.filter({ member_id: me.id, settled: false }, { limit: 10 });
        for (const row of items) {
          if (!roundClosed(t, row.round_no, Date.now())) { mineLeft++; continue; }
          await payBet(b, t, row, settings);
        }
      });
      // Members who closed the page before the roll are paid by whoever is still here.
      let others = 0;
      try {
        const { items } = await E(b).SicBoBet.filter({ settled: false }, { limit: 8 });
        for (const row of items) {
          if (others >= 3) break;
          if (row.member_id === me.id || !roundClosed(t, row.round_no, Date.now())) continue;
          others++;
          await lockMember(b, row.member_id, () => payBet(b, t, row, settings));
        }
      } catch (e) {
        console.error('sic bo sweep skipped', e);
      }
      // No balance in the answer on purpose: the page updates the points itself once the dice stop.
      return Response.json({ ok: true, pending: mineLeft });
    }

    // ---------- put chips down ----------
    if (p.action === 'bet') {
      const raw = Array.isArray(p.bets) ? p.bets : [];
      if (!raw.length) throw new UserError('Place at least one chip.');
      if (raw.length > 25) throw new UserError('Too many separate bets at once.');
      const chips = raw.map((x) => ({ type: String(x.type), amount: Math.floor(Number(x.amount)) }));
      if (!chips.every((x) => validSicboBet(x) && Number.isInteger(x.amount) && x.amount > 0)) throw new UserError('One of those bets is not valid.');
      const total = chips.reduce((a, x) => a + x.amount, 0);
      if (me.banned) throw new UserError('You are banned from the games.', 403);

      const t = await current(b);
      if (!inTime(t)) throw new UserError(CLOSED);
      const round = t.round_no;
      const result = await lockMember(b, me.id, async () => {
        const { items } = await E(b).SicBoBet.filter({ round_no: round, member_id: me.id }, { limit: 5 });
        if (items.some((x) => x.settled)) throw new UserError(CLOSED);
        const existing = items[0];
        const already = items.reduce((a, x) => a + (x.amount || 0), 0);
        if (already + total > settings.max_bet) throw new UserError(`You can bet up to ${settings.max_bet} per roll (${settings.max_bet - already} left).`);
        if (already + total < settings.min_bet) throw new UserError(`Put at least ${settings.min_bet} on the table.`);
        const today = todayStr();
        const usedToday = me.daily_bet_date === today ? me.daily_bet_total || 0 : 0;
        if (usedToday + total > settings.daily_bet_cap) throw new UserError('Daily wager limit reached. It resets at 00:00 UTC.');

        // Points first (this refuses if there aren't enough), then the chips.
        let balance;
        try { ({ balance } = await changePoints(b, me.id, -total, 'game', `${NAME} round ${round} bet`, null)); }
        catch (e) { throw /not enough/i.test(String(e && e.message)) ? new UserError('Not enough points for those chips.') : e; }
        // The daily total is written alongside the chips (it touches different fields), to save time.
        const daily = E(b).Member.update(me.id, { daily_bet_total: usedToday + total, daily_bet_date: today }).catch(() => {});
        let row;
        try {
          if (existing) {
            const merged = (existing.bets || []).map((c) => ({ ...c }));
            for (const c of chips) { const k = merged.find((m) => m.type === c.type); if (k) k.amount += c.amount; else merged.push(c); }
            row = await E(b).SicBoBet.update(existing.id, { bets: merged, amount: (existing.amount || 0) + total });
          } else {
            row = await E(b).SicBoBet.create({
              round_no: round, member_id: me.id, name: me.discord_name || me.discord_id, avatar: me.avatar_url || '',
              role: me.role, bets: chips, amount: total, payout: 0, net: 0, settled: false, pay_started: false
            });
          }
        } catch (e) {
          // The chips didn't make it onto the table: hand the points straight back.
          await daily;
          await changePoints(b, me.id, total, 'game', `${NAME} round ${round} bet returned`, null).catch(() => {});
          throw e;
        }
        await daily;
        return { balance, mine: { round_no: round, bets: row.bets, amount: row.amount } };
      });
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    // ---------- take chips back (only while bets are open) ----------
    if (p.action === 'remove') {
      const all = p.all === true;
      const raw = Array.isArray(p.bets) ? p.bets.slice(0, 25) : [];
      const chips = raw.map((x) => ({ type: String(x.type), amount: Math.floor(Number(x.amount)) }));
      if (!all && (!chips.length || !chips.every((x) => validSicboBet(x) && Number.isInteger(x.amount) && x.amount > 0))) throw new UserError('Nothing to take back.');
      const STAY = 'Bets are closed. Your chips stay on the table.';
      const t = await current(b);
      if (!inTime(t)) throw new UserError(STAY);
      const round = t.round_no;
      const result = await lockMember(b, me.id, async () => {
        const { items } = await E(b).SicBoBet.filter({ round_no: round, member_id: me.id }, { limit: 5 });
        const existing = items[0];
        if (!existing || items.some((x) => x.settled)) throw new UserError('You have no chips on the table.');
        let left = (existing.bets || []).map((c) => ({ ...c }));
        let back = 0;
        if (all) { back = existing.amount; left = []; }
        else {
          for (const c of chips) {
            const k = left.find((m) => m.type === c.type);
            if (!k) continue;
            const take = Math.min(k.amount, c.amount);
            k.amount -= take;
            back += take;
          }
        }
        left = left.filter((c) => c.amount > 0);
        if (back <= 0) throw new UserError('Those chips are not on the table.');
        const remaining = existing.amount - back;
        if (remaining > 0 && remaining < settings.min_bet) throw new UserError(`Keep at least ${settings.min_bet} on the table, or clear all your chips.`);
        // The chips come off the table BEFORE the points go back.
        let row = null;
        if (remaining > 0) row = await E(b).SicBoBet.update(existing.id, { bets: left, amount: remaining });
        else await E(b).SicBoBet.delete(existing.id);
        const { balance } = await changePoints(b, me.id, back, 'game', `${NAME} round ${round} chips taken back`, null);
        if (me.daily_bet_date === todayStr()) await E(b).Member.update(me.id, { daily_bet_total: Math.max(0, (me.daily_bet_total || 0) - back) }).catch(() => {});
        return { balance, mine: row ? { round_no: round, bets: row.bets, amount: row.amount } : null };
      });
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    throw new UserError('Unknown Sic Bo action.');
  } catch (e) {
    return errorResponse(e);
  }
}
