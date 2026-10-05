import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, todayStr, randInt, UserError, errorResponse
} from '../../shared/points.ts';
import { SICBO_NAME, validSicboBet, validDice, sicboPayout, describeRoll } from '../../shared/sicbo.ts';
import { postFeed } from '../../shared/feed.ts';
import { announceBigWin } from '../../shared/chat.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

// Dragon Sic Bo: one shared table that runs itself.
//   betting (15 s) -> three dice are rolled (4 s on the page) -> result shown (4 s) -> next round.
// Rounds advance lazily: any request after a deadline moves the table forward.
// It takes the place of the old solo Dragon Dice and is switched on by the same game setting.
const GAME = 'dragondice';
const BET_SECONDS = 15;
const ROLL_SECONDS = 4;   // length of the dice animation on the page (ROLL_MS in SicBo.jsx)
const RESULT_SECONDS = ROLL_SECONDS + 4;
const CLOSE_MARGIN_MS = 1500; // bets stop a moment before the deadline
const SETTLE_LOCK_MS = 120000; // paying out a full table can take a while; nobody else may settle meanwhile
const NAME = SICBO_NAME;

const iso = (ms: number) => new Date(ms).toISOString();

async function getTable(b) {
  const { items } = await b.asServiceRole.entities.SicBoTable.filter({}, { sort: 'created_date', limit: 1 });
  if (items[0]) return items[0];
  return await b.asServiceRole.entities.SicBoTable.create({ round_no: 0, status: 'settled', next_at: iso(Date.now() - 1), recent: [], total_bet: 0, players: 0 });
}

function due(t, now: number) {
  if (t.status === 'betting') return Date.parse(t.bets_close_at) <= now;
  return !t.next_at || Date.parse(t.next_at) <= now;
}

// Settle the current round and/or open the next one. Safe to call often.
async function advance(b, settings) {
  const first = await getTable(b);
  if (!due(first, Date.now())) return first;
  return withRecordLock(b, 'SicBoTable', first.id, async () => {
    let t = await b.asServiceRole.entities.SicBoTable.get(first.id);
    const now = Date.now();
    if (t.status === 'betting' && Date.parse(t.bets_close_at) <= now) {
      t = await settle(b, t, now, settings);
    } else if (t.status === 'settled' && (!t.next_at || Date.parse(t.next_at) <= now)) {
      const seconds = BET_SECONDS;
      t = await b.asServiceRole.entities.SicBoTable.update(t.id, {
        round_no: (t.round_no || 0) + 1,
        status: 'betting',
        bets_close_at: iso(now + seconds * 1000),
        total_bet: 0,
        players: 0
      });
    }
    return t;
  }, SETTLE_LOCK_MS);
}

async function settle(b, t, now: number, settings) {
  // Roll ONCE and save the dice before paying anyone. If this run is cut short,
  // the next one resumes with the same dice instead of rolling again.
  let dice;
  if (t.settling_round === t.round_no && validDice(t.result_dice)) {
    dice = t.result_dice;
  } else {
    dice = [randInt(6) + 1, randInt(6) + 1, randInt(6) + 1];
    t = await b.asServiceRole.entities.SicBoTable.update(t.id, { settling_round: t.round_no, result_dice: dice });
  }
  const { items: bets } = await b.asServiceRole.entities.SicBoBet.filter({ round_no: t.round_no, settled: false }, { limit: 500 });
  for (const listed of bets) {
    // Read the bet again right now: it may have been changed or taken off at the last moment.
    let rb; try { rb = await b.asServiceRole.entities.SicBoBet.get(listed.id); } catch { continue; }
    if (!rb || rb.settled) continue;
    const payout = sicboPayout(rb.bets, dice);
    const net = payout - rb.amount;
    // Mark the bet settled BEFORE paying, so it can never be paid twice.
    await b.asServiceRole.entities.SicBoBet.update(rb.id, { payout, net, settled: true });
    if (payout > 0) {
      await withMemberLock(b, rb.member_id, () => changePoints(b, rb.member_id, payout, 'game', `${NAME} round ${t.round_no} win`, null));
    }
    await b.asServiceRole.entities.Bet.create({
      member_id: rb.member_id, discord_id: '', game: GAME, wager: rb.amount, payout, won: payout > rb.amount,
      outcome: { dice, total: dice[0] + dice[1] + dice[2], round: t.round_no, bets: rb.bets }
    });
    await postFeed(b, { id: rb.member_id, discord_name: rb.name, avatar_url: rb.avatar, role: rb.role }, {
      game: GAME, game_name: NAME, wager: rb.amount, payout, detail: `Rolled ${describeRoll(dice)}`
    });
    const threshold = Number(settings.big_win_threshold) || 0;
    if (net > 0 && net >= threshold) {
      await announceBigWin(rb.name || 'A member', NAME, net, `rolled ${describeRoll(dice)}`);
    }
  }
  return await b.asServiceRole.entities.SicBoTable.update(t.id, {
    status: 'settled',
    result_dice: dice,
    settled_at: iso(now),
    next_at: iso(now + RESULT_SECONDS * 1000),
    recent: [dice.join(''), ...(t.recent || [])].slice(0, 20)
  });
}

const publicTable = (t) => ({
  round_no: t.round_no, status: t.status, bets_close_at: t.bets_close_at, settled_at: t.settled_at, next_at: t.next_at,
  // The dice are only sent once the round is settled.
  dice: t.status === 'settled' && validDice(t.result_dice) ? t.result_dice : null,
  recent: (t.recent || []).map((x) => String(x).split('').map(Number)).filter(validDice), total_bet: t.total_bet || 0,
  players: t.players || 0, bet_seconds: BET_SECONDS, server_now: new Date().toISOString()
});

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');
    const settings = await getSettings(b);
    if (!(settings.games_enabled || []).includes(GAME)) throw new UserError('Dragon Sic Bo is closed right now.');

    if (p.action === 'state') {
      const t = await advance(b, settings);
      const { items: bets } = await b.asServiceRole.entities.SicBoBet.filter({ round_no: t.round_no }, { limit: 200 });
      const mine = bets.find((x) => x.member_id === me.id) || null;
      return Response.json({
        table: publicTable(t),
        // Every player's chips, spot by spot, so the table can show who bet where.
        bets: bets.map((x) => ({ name: x.name, avatar: x.avatar, role: x.role, amount: x.amount, payout: x.payout, net: x.net, settled: x.settled, mine: x.member_id === me.id, spots: (x.bets || []).map((c) => ({ type: c.type, amount: c.amount })) })),
        mine
      });
    }

    if (p.action === 'bet') {
      const raw = Array.isArray(p.bets) ? p.bets : [];
      if (!raw.length) throw new UserError('Place at least one chip.');
      if (raw.length > 25) throw new UserError('Too many separate bets at once.');
      const chips = raw.map((x) => ({ type: String(x.type), amount: Math.floor(Number(x.amount)) }));
      if (!chips.every((x) => validSicboBet(x) && Number.isInteger(x.amount) && x.amount > 0)) throw new UserError('One of those bets is not valid.');
      const total = chips.reduce((a, x) => a + x.amount, 0);

      let t = await advance(b, settings);
      if (t.status !== 'betting' || Date.parse(t.bets_close_at) - CLOSE_MARGIN_MS <= Date.now()) {
        throw new UserError('Bets are closed for this roll. Wait for the next round.');
      }
      const round = t.round_no;
      const result = await withMemberLock(b, me.id, async () => {
        const member = await b.asServiceRole.entities.Member.get(me.id);
        if (member.banned) throw new UserError('You are banned from the games.', 403);
        // The round may have closed while we waited for the lock.
        const live = await b.asServiceRole.entities.SicBoTable.get(t.id);
        if (live.status !== 'betting' || live.round_no !== round || Date.parse(live.bets_close_at) - 500 <= Date.now()) {
          throw new UserError('Bets are closed for this roll. Wait for the next round.');
        }
        if (total > (member.points || 0)) throw new UserError('Not enough points for those chips.');
        const { items } = await b.asServiceRole.entities.SicBoBet.filter({ round_no: round, member_id: me.id }, { limit: 1 });
        const existing = items[0];
        const already = existing ? existing.amount : 0;
        if (already + total > settings.max_bet) throw new UserError(`You can bet up to ${settings.max_bet} per roll (${settings.max_bet - already} left).`);
        if (already + total < settings.min_bet) throw new UserError(`Put at least ${settings.min_bet} on the table.`);
        const today = todayStr();
        const usedToday = member.daily_bet_date === today ? member.daily_bet_total || 0 : 0;
        if (usedToday + total > settings.daily_bet_cap) throw new UserError('Daily wager limit reached. It resets at 00:00 UTC.');

        const { balance } = await changePoints(b, member.id, -total, 'game', `${NAME} round ${round} bet`, null);
        await b.asServiceRole.entities.Member.update(member.id, { daily_bet_total: usedToday + total, daily_bet_date: today });
        let row;
        if (existing) {
          // Merge with chips already on the same spots.
          const merged = [...(existing.bets || [])];
          for (const c of chips) {
            const k = merged.find((m) => m.type === c.type);
            if (k) k.amount += c.amount; else merged.push(c);
          }
          row = await b.asServiceRole.entities.SicBoBet.update(existing.id, { bets: merged, amount: already + total });
        } else {
          row = await b.asServiceRole.entities.SicBoBet.create({
            round_no: round, member_id: member.id, name: member.discord_name || member.discord_id, avatar: member.avatar_url || '',
            role: member.role, bets: chips, amount: total, payout: 0, net: 0, settled: false
          });
        }
        return { balance, mine: row, isNew: !existing };
      });
      // Keep the table's totals roughly current for everyone watching.
      t = await b.asServiceRole.entities.SicBoTable.get(t.id);
      await b.asServiceRole.entities.SicBoTable.update(t.id, {
        total_bet: (t.total_bet || 0) + total,
        players: (t.players || 0) + (result.isNew ? 1 : 0)
      }).catch(() => {});
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    // Take chips back off the table. Allowed only while bets are open; once the countdown
    // ends the chips stay. `all: true` clears everything, otherwise `bets` lists what to lift.
    if (p.action === 'remove') {
      const all = p.all === true;
      const raw = Array.isArray(p.bets) ? p.bets.slice(0, 25) : [];
      const chips = raw.map((x) => ({ type: String(x.type), amount: Math.floor(Number(x.amount)) }));
      if (!all && (!chips.length || !chips.every((x) => validSicboBet(x) && Number.isInteger(x.amount) && x.amount > 0))) throw new UserError('Nothing to take back.');
      const CLOSED = 'Bets are closed. Your chips stay on the table.';
      let t = await advance(b, settings);
      if (t.status !== 'betting' || Date.parse(t.bets_close_at) - CLOSE_MARGIN_MS <= Date.now()) throw new UserError(CLOSED);
      const round = t.round_no;
      const result = await withMemberLock(b, me.id, async () => {
        const live = await b.asServiceRole.entities.SicBoTable.get(t.id);
        if (live.status !== 'betting' || live.round_no !== round || Date.parse(live.bets_close_at) - CLOSE_MARGIN_MS <= Date.now()) throw new UserError(CLOSED);
        const { items } = await b.asServiceRole.entities.SicBoBet.filter({ round_no: round, member_id: me.id }, { limit: 1 });
        const existing = items[0];
        if (!existing || existing.settled) throw new UserError('You have no chips on the table.');
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
        if (remaining > 0) row = await b.asServiceRole.entities.SicBoBet.update(existing.id, { bets: left, amount: remaining });
        else await b.asServiceRole.entities.SicBoBet.delete(existing.id);
        const { balance } = await changePoints(b, me.id, back, 'game', `${NAME} round ${round} chips taken back`, null);
        const member = await b.asServiceRole.entities.Member.get(me.id);
        if (member.daily_bet_date === todayStr()) await b.asServiceRole.entities.Member.update(me.id, { daily_bet_total: Math.max(0, (member.daily_bet_total || 0) - back) });
        return { balance, mine: row, back, gone: remaining === 0 };
      });
      t = await b.asServiceRole.entities.SicBoTable.get(t.id);
      await b.asServiceRole.entities.SicBoTable.update(t.id, {
        total_bet: Math.max(0, (t.total_bet || 0) - result.back),
        players: Math.max(0, (t.players || 0) - (result.gone ? 1 : 0))
      }).catch(() => {});
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    throw new UserError('Unknown Sic Bo action.');
  } catch (e) {
    return errorResponse(e);
  }
}