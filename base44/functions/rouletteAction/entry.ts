import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, todayStr, randInt,
  validRouletteBet, roulettePayout, ROULETTE_POCKETS, GAME_NAMES, UserError, errorResponse
} from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { announceBigWin } from '../../shared/chat.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

// One shared roulette table that runs itself:
//   betting (10 s) -> the wheel spins and lands (5 s) -> result shown (3 s) -> next round.
// Guild rules: Red 2x, Black 2x, Green 14x, Dragon (a red pocket) 7x, Tiger (a black pocket) 7x.
// Rounds advance lazily: any request after a deadline moves the table forward.
// Round timing: bets stay open 15 s; the next round opens 3 s after the result is shown.
const BET_SECONDS = 10;
const SPIN_SECONDS = 5;   // length of the ball animation on the page (SPIN_MS in Roulette.jsx)
const RESULT_SECONDS = SPIN_SECONDS + 3;
const CLOSE_MARGIN_MS = 1500;
const SETTLE_LOCK_MS = 120000; // paying out a full table can take a while; nobody else may settle meanwhile // bets stop a moment before the deadline
// Bumped whenever the wheel changes, so results from an older wheel are never read as this one's.
const LAYOUT = 'v4';
const POCKET_NAME = { red: 'Red', black: 'Black', green: 'Green', dragon: 'the Dragon', tiger: 'the Tiger' };
const NAME = GAME_NAMES.roulette;

const iso = (ms: number) => new Date(ms).toISOString();

async function getTable(b) {
  const { items } = await b.asServiceRole.entities.RouletteTable.filter({}, { sort: 'created_date', limit: 1 });
  if (items[0]) return items[0];
  return await b.asServiceRole.entities.RouletteTable.create({ round_no: 0, status: 'settled', next_at: iso(Date.now() - 1), recent: [], total_bet: 0, players: 0 });
}

function due(t, now: number) {
  if (t.status === 'betting') return Date.parse(t.bets_close_at) <= now;
  return !t.next_at || Date.parse(t.next_at) <= now;
}

// Settle the current round and/or open the next one. Safe to call often.
async function advance(b, settings) {
  const first = await getTable(b);
  if (!due(first, Date.now())) return first;
  return withRecordLock(b, 'RouletteTable', first.id, async () => {
    let t = await b.asServiceRole.entities.RouletteTable.get(first.id);
    const now = Date.now();
    if (t.status === 'betting' && Date.parse(t.bets_close_at) <= now) {
      t = await settle(b, t, now, settings);
    } else if (t.status === 'settled' && (!t.next_at || Date.parse(t.next_at) <= now)) {
      const seconds = BET_SECONDS;
      t = await b.asServiceRole.entities.RouletteTable.update(t.id, {
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
  // Decide the result ONCE and save it before paying anyone. If this run is cut
  // short, the next one resumes with the same number instead of spinning again.
  // `number` is the pocket the wheel stops on (0 to 29).
  let number;
  if (t.settling_round === t.round_no && Number.isInteger(t.result_number) && t.result_number < ROULETTE_POCKETS.length) {
    number = t.result_number;
  } else {
    number = randInt(ROULETTE_POCKETS.length);
    t = await b.asServiceRole.entities.RouletteTable.update(t.id, { settling_round: t.round_no, result_number: number, result_index: number });
  }
  const kind = ROULETTE_POCKETS[number];
  const { items: bets } = await b.asServiceRole.entities.RouletteBet.filter({ round_no: t.round_no, settled: false }, { limit: 500 });
  for (const rb of bets) {
    const payout = roulettePayout(rb.bets, kind);
    const net = payout - rb.amount;
    // Mark the bet settled BEFORE paying, so it can never be paid twice.
    await b.asServiceRole.entities.RouletteBet.update(rb.id, { payout, net, settled: true });
    if (payout > 0) {
      await withMemberLock(b, rb.member_id, () => changePoints(b, rb.member_id, payout, 'game', `${NAME} round ${t.round_no} win`, null));
    }
    await b.asServiceRole.entities.Bet.create({
      member_id: rb.member_id, discord_id: '', game: 'roulette', wager: rb.amount, payout, won: payout > 0,
      outcome: { number, kind, round: t.round_no, bets: rb.bets }
    });
    await postFeed(b, { id: rb.member_id, discord_name: rb.name, avatar_url: rb.avatar, role: rb.role }, {
      game: 'roulette', game_name: NAME, wager: rb.amount, payout, detail: `Landed on ${POCKET_NAME[kind]}`
    });
    const threshold = Number(settings.big_win_threshold) || 0;
    if (net > 0 && net >= threshold) {
      await announceBigWin(rb.name || 'A member', NAME, net, `landed on ${POCKET_NAME[kind]}`);
    }
  }
  return await b.asServiceRole.entities.RouletteTable.update(t.id, {
    status: 'settled',
    result_number: number,
    result_index: number,
    settled_at: iso(now),
    next_at: iso(now + RESULT_SECONDS * 1000),
    layout: LAYOUT,
    // Results from the old numbered wheel don't belong in this history.
    recent: [number, ...(t.layout === LAYOUT ? t.recent || [] : [])].slice(0, 20)
  });
}

const publicTable = (t) => ({
  round_no: t.round_no, status: t.status, bets_close_at: t.bets_close_at, settled_at: t.settled_at, next_at: t.next_at,
  result_number: t.layout === LAYOUT ? t.result_number : null, result_kind: t.layout === LAYOUT && Number.isInteger(t.result_number) ? ROULETTE_POCKETS[t.result_number] : null,
  recent: t.layout === LAYOUT ? (t.recent || []).map((n) => ROULETTE_POCKETS[n]).filter(Boolean) : [], total_bet: t.total_bet || 0,
  players: t.players || 0, server_now: new Date().toISOString()
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
    if (!(settings.games_enabled || []).includes('roulette')) throw new UserError('Roulette is closed right now.');

    if (p.action === 'state') {
      const t = await advance(b, settings);
      const { items: bets } = await b.asServiceRole.entities.RouletteBet.filter({ round_no: t.round_no }, { limit: 200 });
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
      if (raw.length > 20) throw new UserError('Too many separate bets at once.');
      const chips = raw.map((x) => ({ type: String(x.type), amount: Math.floor(Number(x.amount)) }));
      if (!chips.every((x) => validRouletteBet(x) && Number.isInteger(x.amount) && x.amount > 0)) throw new UserError('One of those bets is not valid.');
      const total = chips.reduce((a, x) => a + x.amount, 0);

      let t = await advance(b, settings);
      if (t.status !== 'betting' || Date.parse(t.bets_close_at) - CLOSE_MARGIN_MS <= Date.now()) {
        throw new UserError('Bets are closed for this spin. Wait for the next round.');
      }
      const round = t.round_no;
      const result = await withMemberLock(b, me.id, async () => {
        const member = await b.asServiceRole.entities.Member.get(me.id);
        if (member.banned) throw new UserError('You are banned from the games.', 403);
        // The round may have closed while we waited for the lock.
        const live = await b.asServiceRole.entities.RouletteTable.get(t.id);
        if (live.status !== 'betting' || live.round_no !== round || Date.parse(live.bets_close_at) - 500 <= Date.now()) {
          throw new UserError('Bets are closed for this spin. Wait for the next round.');
        }
        if (total > (member.points || 0)) throw new UserError('Not enough points for those chips.');
        const { items } = await b.asServiceRole.entities.RouletteBet.filter({ round_no: round, member_id: me.id }, { limit: 1 });
        const existing = items[0];
        const already = existing ? existing.amount : 0;
        if (already + total > settings.max_bet) throw new UserError(`You can bet up to ${settings.max_bet} per spin (${settings.max_bet - already} left).`);
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
          row = await b.asServiceRole.entities.RouletteBet.update(existing.id, { bets: merged, amount: already + total });
        } else {
          row = await b.asServiceRole.entities.RouletteBet.create({
            round_no: round, member_id: member.id, name: member.discord_name || member.discord_id, avatar: member.avatar_url || '',
            role: member.role, bets: chips, amount: total, payout: 0, net: 0, settled: false
          });
        }
        return { balance, mine: row, isNew: !existing };
      });
      // Keep the table's totals roughly current for everyone watching.
      t = await b.asServiceRole.entities.RouletteTable.get(t.id);
      await b.asServiceRole.entities.RouletteTable.update(t.id, {
        total_bet: (t.total_bet || 0) + total,
        players: (t.players || 0) + (result.isNew ? 1 : 0)
      }).catch(() => {});
      return Response.json({ ok: true, balance: result.balance, mine: result.mine });
    }

    throw new UserError('Unknown roulette action.');
  } catch (e) {
    return errorResponse(e);
  }
}