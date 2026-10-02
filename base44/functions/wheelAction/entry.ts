import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, todayStr, randInt,
  houseEdge, wheelMultiplier, WHEEL_SEGMENTS, GAME_NAMES, UserError, errorResponse
} from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

// One shared Twelve Skies Wheel that runs itself, like the roulette table:
//   betting (20 s by default) -> the wheel spins and lands -> results shown (12 s) -> next round.
// Rounds advance lazily: any request after a deadline moves the wheel forward.
const RESULT_SECONDS = 12;
const CLOSE_MARGIN_MS = 1500;
const FACTIONS = ['guanyin', 'fujin', 'jinong', 'dragon'];
const FACTION_NAME = { guanyin: 'Guanyin', fujin: 'Fujin', jinong: 'Jinong', dragon: 'Dragon' };
const NAME = GAME_NAMES.skywheel;

const iso = (ms: number) => new Date(ms).toISOString();

async function getTable(b) {
  const { items } = await b.asServiceRole.entities.WheelTable.filter({}, { sort: 'created_date', limit: 1 });
  if (items[0]) return items[0];
  return await b.asServiceRole.entities.WheelTable.create({ round_no: 0, status: 'settled', next_at: iso(Date.now() - 1), recent: [], total_bet: 0, players: 0 });
}

function due(t, now: number) {
  if (t.status === 'betting') return Date.parse(t.bets_close_at) <= now;
  return !t.next_at || Date.parse(t.next_at) <= now;
}

async function advance(b, settings) {
  const first = await getTable(b);
  if (!due(first, Date.now())) return first;
  return withRecordLock(b, 'WheelTable', first.id, async () => {
    let t = await b.asServiceRole.entities.WheelTable.get(first.id);
    const now = Date.now();
    if (t.status === 'betting' && Date.parse(t.bets_close_at) <= now) {
      t = await settle(b, t, now, settings);
    } else if (t.status === 'settled' && (!t.next_at || Date.parse(t.next_at) <= now)) {
      const seconds = Math.min(Math.max(Number(settings.wheel_bet_seconds) || 20, 10), 120);
      t = await b.asServiceRole.entities.WheelTable.update(t.id, {
        round_no: (t.round_no || 0) + 1, status: 'betting', bets_close_at: iso(now + seconds * 1000), total_bet: 0, players: 0
      });
    }
    return t;
  });
}

async function settle(b, t, now: number, settings) {
  const index = randInt(WHEEL_SEGMENTS.length);
  const landed = WHEEL_SEGMENTS[index];
  const edge = houseEdge(settings);
  const { items: bets } = await b.asServiceRole.entities.WheelBet.filter({ round_no: t.round_no, settled: false }, { limit: 500 });
  for (const wb of bets) {
    let payout = 0;
    for (const x of wb.bets || []) if (x.faction === landed) payout += Math.round(x.amount * wheelMultiplier(landed, edge));
    const net = payout - wb.amount;
    if (payout > 0) {
      await withMemberLock(b, wb.member_id, () => changePoints(b, wb.member_id, payout, 'game', `${NAME} round ${t.round_no} win`, null));
    }
    await b.asServiceRole.entities.WheelBet.update(wb.id, { payout, net, settled: true });
    await b.asServiceRole.entities.Bet.create({
      member_id: wb.member_id, discord_id: '', game: 'skywheel', wager: wb.amount, payout, won: payout > 0,
      outcome: { index, landed, round: t.round_no, bets: wb.bets }
    });
    await postFeed(b, { id: wb.member_id, discord_name: wb.name, avatar_url: wb.avatar, role: wb.role }, {
      game: 'skywheel', game_name: NAME, wager: wb.amount, payout, detail: `Landed on ${FACTION_NAME[landed]}`
    });
  }
  return await b.asServiceRole.entities.WheelTable.update(t.id, {
    status: 'settled', result_faction: landed, result_index: index, settled_at: iso(now),
    next_at: iso(now + RESULT_SECONDS * 1000), recent: [landed, ...(t.recent || [])].slice(0, 16)
  });
}

const publicTable = (t) => ({
  round_no: t.round_no, status: t.status, bets_close_at: t.bets_close_at, settled_at: t.settled_at, next_at: t.next_at,
  result_faction: t.result_faction, result_index: t.result_index, recent: t.recent || [], total_bet: t.total_bet || 0,
  players: t.players || 0, server_now: new Date().toISOString()
});

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Sign in with Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Sign in with Discord first.');
    const settings = await getSettings(b);
    if (!(settings.games_enabled || []).includes('skywheel')) throw new UserError('The wheel is closed right now.');

    if (p.action === 'state') {
      const t = await advance(b, settings);
      const { items: bets } = await b.asServiceRole.entities.WheelBet.filter({ round_no: t.round_no }, { limit: 200 });
      const mine = bets.find((x) => x.member_id === me.id) || null;
      return Response.json({
        table: publicTable(t),
        bets: bets.map((x) => ({ name: x.name, avatar: x.avatar, role: x.role, amount: x.amount, payout: x.payout, net: x.net, settled: x.settled, mine: x.member_id === me.id, bets: x.bets || [] })),
        mine
      });
    }

    if (p.action === 'bet') {
      const faction = String(p.faction || '');
      const amount = Math.floor(Number(p.amount));
      if (!FACTIONS.includes(faction)) throw new UserError('Pick a faction.');
      if (!Number.isInteger(amount) || amount < 1) throw new UserError('Enter a wager.');

      let t = await advance(b, settings);
      if (t.status !== 'betting' || Date.parse(t.bets_close_at) - CLOSE_MARGIN_MS <= Date.now()) {
        throw new UserError('Bets are closed for this spin. Wait for the next round.');
      }
      const round = t.round_no;
      const result = await withMemberLock(b, me.id, async () => {
        const member = await b.asServiceRole.entities.Member.get(me.id);
        if (member.banned) throw new UserError('You are banned from the games.', 403);
        if (amount > (member.points || 0)) throw new UserError('Not enough points for that wager.');
        const { items } = await b.asServiceRole.entities.WheelBet.filter({ round_no: round, member_id: me.id }, { limit: 1 });
        const existing = items[0];
        const already = existing ? existing.amount : 0;
        if (already + amount > settings.max_bet) throw new UserError(`You can bet up to ${settings.max_bet} per spin (${Math.max(0, settings.max_bet - already)} left).`);
        if (already + amount < settings.min_bet) throw new UserError(`Wager at least ${settings.min_bet}.`);
        const today = todayStr();
        const usedToday = member.daily_bet_date === today ? member.daily_bet_total || 0 : 0;
        if (usedToday + amount > settings.daily_bet_cap) throw new UserError('Daily wager limit reached. It resets at 00:00 UTC.');

        const { balance } = await changePoints(b, member.id, -amount, 'game', `${NAME} round ${round} bet`, null);
        await b.asServiceRole.entities.Member.update(member.id, { daily_bet_total: usedToday + amount, daily_bet_date: today });
        let row;
        if (existing) {
          const merged = [...(existing.bets || [])];
          const k = merged.find((m) => m.faction === faction);
          if (k) k.amount += amount; else merged.push({ faction, amount });
          row = await b.asServiceRole.entities.WheelBet.update(existing.id, { bets: merged, amount: already + amount });
        } else {
          row = await b.asServiceRole.entities.WheelBet.create({
            round_no: round, member_id: member.id, name: member.discord_name || member.discord_id, avatar: member.avatar_url || '',
            role: member.role, bets: [{ faction, amount }], amount, payout: 0, net: 0, settled: false
          });
        }
        return { balance, mine: row, isNew: !existing };
      });
      t = await b.asServiceRole.entities.WheelTable.get(t.id);
      await b.asServiceRole.entities.WheelTable.update(t.id, {
        total_bet: (t.total_bet || 0) + amount, players: (t.players || 0) + (result.isNew ? 1 : 0)
      }).catch(() => {});
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    throw new UserError('Unknown wheel action.');
  } catch (e) {
    return errorResponse(e);
  }
}