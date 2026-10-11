import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getSettings, getMemberByUserId, withRecordLock, UserError, errorResponse, resilient } from '../../shared/points.ts';
import {
  ENGINE_VERSION, LOOK_KEYS, LIMIT, mulberry32, randomBuild, simulate, outcomeOf, priceMatch
} from '../../shared/arenaEngine.ts';
import {
  ARENA_NAME, placeBets, removeBets, payMine, payOthers, betBoard, arenaLimit, arenaMin, type Resolve
} from '../../shared/arenaBets.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { pulse, react, cleanScope } from '../../shared/arenaSocial.ts';

// Blacklist Arena, the Live Arena: one shared fight every few minutes, between two members of
// the site picked at random, each with a random build.
//
// It runs on the clock, like the Derby:
//   * When a round opens, the server picks the two fighters and their builds and works out the
//     prices (2,000 practice fights). The fight itself does not exist yet.
//   * Betting closes at bets_close_at. Only then is the fight fought: the server picks a fresh secret
//     seed and runs it once, sends the seed out, and every screen runs the very same fight from it
//     (base44/shared/arenaEngine.ts). The result is sent once the fight is over on screen.
//   * A fight that has no knockout within 180 seconds is a Draw: Draw bets win, and bets on either
//     fighter get half their stake back.
const GAME = 'arena';
const CLOCK = 'a1';
const INTRO_SECONDS = 3;      // "Fight!" before the first step
const RESULT_SECONDS = 15;    // the result stays on screen this long
const DEFAULT_BET_SECONDS = 30;
const HISTORY = 300;          // finished fights kept for paying late (about 15 hours)
const REPLAYS = 20;           // the newest of them keep their seed and builds, so they can be watched again
// Shared secret only the "Arena Payouts" schedule knows.
const WORKFLOW_SECRET = 'b5accf91588c6e85eac6c78d13fd4d3acec3b0ed15fbc065';

const iso = (ms: number) => new Date(ms).toISOString();
const E = (b) => b.asServiceRole.entities;
const secretSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
const betSeconds = (settings) => Math.max(10, Math.min(300, Number(settings.arena_bet_seconds) || DEFAULT_BET_SECONDS));

// ----- the table and its clock -----
const closeMs = (t) => Date.parse(t.bets_close_at) || 0;
const endMs = (t) => Date.parse(t.fight_ends_at) || 0;
const nextMs = (t) => Date.parse(t.next_at) || 0;
const usable = (t) => !!t && t.clock === CLOCK && t.engine === ENGINE_VERSION && Array.isArray(t.fighters) && t.fighters.length === 2
  && t.odds && closeMs(t) > 0;
// The fight is only fought when betting closes: before that nothing about it exists, not even its seed.
const fought = (t) => usable(t) && t.fought === true && t.outcome && Number.isInteger(t.seed) && endMs(t) > closeMs(t);
const statusAt = (t, at: number) => (at < closeMs(t) ? 'betting' : !fought(t) || at < endMs(t) ? 'fighting' : 'result');

// Who can be picked: any member of the site. Read at most every 10 minutes per running copy.
let memberCache = { at: 0, list: [] };
async function memberPool(b) {
  if (Date.now() - memberCache.at < 600000 && memberCache.list.length >= 2) return memberCache.list;
  const { items } = await E(b).Member.filter({}, { limit: 2000, fields: ['id', 'discord_name', 'discord_id', 'avatar_url', 'banned', 'role'] });
  const list = items.filter((m) => !m.banned && (m.discord_name || m.discord_id)).map((m) => ({ id: m.id, name: String(m.discord_name || m.discord_id).slice(0, 32), avatar: m.avatar_url || '', role: m.role || 'member' }));
  memberCache = { at: Date.now(), list };
  return list;
}

async function newRound(b, round: number, recent, settings, now: number) {
  const pool = await memberPool(b);
  const rnd = mulberry32(secretSeed());
  const pick = (n: number) => Math.floor(rnd() * n);
  const ia = pick(Math.max(1, pool.length));
  let ib = pick(Math.max(1, pool.length - 1)); if (ib >= ia) ib++;
  const who = [pool[ia] || { id: '', name: 'Challenger', avatar: '' }, pool[ib] || { id: '', name: 'Defender', avatar: '' }];
  if (who[0].name === who[1].name) who[1] = { ...who[1], name: `${who[1].name} II` };
  const la = pick(LOOK_KEYS.length);
  let lb = pick(LOOK_KEYS.length - 1); if (lb >= la) lb++;
  const fighters = [0, 1].map((i) => ({ member_id: who[i].id, name: who[i].name, avatar: who[i].avatar, role: who[i].role || 'member', look: LOOK_KEYS[i ? lb : la], build: randomBuild(rnd) }));
  const fa = { ...fighters[0].build, name: fighters[0].name }, fb = { ...fighters[1].build, name: fighters[1].name };
  const odds = priceMatch(fa, fb, secretSeed(), { draws: true, limit: LIMIT });
  const close = now + betSeconds(settings) * 1000;
  // No fight yet: it is fought (seed, result, length) the moment betting closes, by fightNow().
  return {
    clock: CLOCK, engine: ENGINE_VERSION, round_no: round, fighters, odds, seed: 0, outcome: {}, fought: false,
    bets_close_at: iso(close), fight_ends_at: iso(0), next_at: iso(0), recent
  };
}
// Betting has closed: fight it now. It starts (on every screen) at the moment betting closed.
function fightNow(t) {
  const fa = { ...t.fighters[0].build, name: t.fighters[0].name }, fb = { ...t.fighters[1].build, name: t.fighters[1].name };
  const seed = secretSeed();
  const fight = simulate(fa, fb, seed, { draws: true, frames: false, limit: LIMIT });
  const end = closeMs(t) + Math.ceil((INTRO_SECONDS + fight.length) * 1000);
  return { seed, outcome: outcomeOf(fight), fought: true, fight_ends_at: iso(end), next_at: iso(end + RESULT_SECONDS * 1000) };
}

// One finished fight for the history.
const pastOf = (t) => ({
  r: t.round_no, at: t.fight_ends_at,
  f: t.fighters.map((f) => ({ name: f.name, avatar: f.avatar, look: f.look })),
  winner: t.outcome.winner, how: t.outcome.how, length: t.outcome.length, o: t.outcome,
  odds: { a: t.odds.a, b: t.odds.b, draw: t.odds.draw },
  seed: t.seed, builds: t.fighters.map((f) => f.build)
});

async function getTable(b, settings) {
  const { items } = await E(b).ArenaTable.filter({}, { sort: 'created_date', limit: 1 });
  if (items[0]) return items[0];
  return await E(b).ArenaTable.create(await newRound(b, 1, [], settings, Date.now()));
}

// Fight the round when betting closes; open the next round once the last result has been on show long
// enough. Only one request does the work; the others wait for it and read what it wrote.
async function current(b, settings) {
  const t0 = await getTable(b, settings);
  const due = (t) => !usable(t) || (Date.now() >= closeMs(t) && !fought(t));
  const stale = (t) => !usable(t) || (fought(t) && Date.now() >= nextMs(t));
  if (!stale(t0) && !due(t0)) return t0;
  const open = async () => {
    let t = await E(b).ArenaTable.get(t0.id);
    if (usable(t) && due(t)) t = await E(b).ArenaTable.update(t.id, fightNow(t));
    if (!stale(t)) return t;
    const kept = (t.recent || []).filter((x) => x && x.o).filter((x) => !fought(t) || Number(x.r) !== t.round_no);
    const recent = (fought(t) ? [pastOf(t), ...kept] : kept).slice(0, HISTORY)
      .map((x, i) => (i < REPLAYS ? x : { ...x, seed: undefined, builds: undefined }));
    return await E(b).ArenaTable.update(t.id, await newRound(b, (t.round_no || 0) + 1, recent, settings, Date.now()));
  };
  try {
    return await withRecordLock(b, 'ArenaTable', t0.id, open, 10000);
  } catch (e) {
    if (e instanceof UserError) { const t = await E(b).ArenaTable.get(t0.id); if (!stale(t) && !due(t)) return t; if (usable(t)) return t; }
    throw e;
  }
}

// What a bet's fight came to, from the table as it is now.
function resolverFor(t): Resolve {
  return async (row) => {
    const now = Date.now();
    if (row.round_no === t.round_no) {
      if (!usable(t)) return { over: true, o: null };
      return fought(t) && now >= endMs(t) ? { over: true, o: t.outcome } : { over: false };
    }
    if (row.round_no > t.round_no) return { over: false };
    const past = (t.recent || []).find((x) => x && Number(x.r) === Number(row.round_no));
    return { over: true, o: past && past.o ? past.o : null };
  };
}

// What everyone may see. The seed and the end time only once betting has closed; the result
// only once the fight is over.
function publicTable(t, now: number, settings) {
  const status = statusAt(t, now);
  return {
    round_no: t.round_no, status, engine: t.engine, server_now: iso(now),
    bets_close_at: t.bets_close_at, bet_seconds: betSeconds(settings), intro: INTRO_SECONDS, result_seconds: RESULT_SECONDS, limit_seconds: LIMIT,
    limit: arenaLimit(settings), min_bet: arenaMin(settings),
    fighters: t.fighters.map((f) => ({ name: f.name, avatar: f.avatar, role: f.role || 'member', look: f.look, build: f.build })),
    odds: t.odds,
    fight: status === 'betting' || !fought(t) ? null : { seed: t.seed, starts_at: t.bets_close_at, ends_at: t.fight_ends_at, next_at: t.next_at },
    outcome: status === 'result' ? t.outcome : null,
    recent: (t.recent || []).slice(0, REPLAYS).filter((x) => x && x.o)
  };
}

export default async function(req) {
  try {
    const arrived = Date.now();
    const b = resilient(createClientFromRequest(req));
    let p; try { p = await req.clone().json(); } catch { p = {}; }

    // The "Arena Payouts" schedule: pays finished bets even if nobody is on the site.
    if (p.action === 'sweep') {
      if (p.__wf_secret !== WORKFLOW_SECRET) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
      const settings = await getSettings(b);
      const { items } = await E(b).ArenaTable.filter({}, { sort: 'created_date', limit: 1 });
      if (!items[0]) return Response.json({ ok: true, paid: 0 });
      let t = items[0];
      try { t = await current(b, settings); } catch (e) { console.error('arena sweep: table busy', e); }
      const paid = await payOthers(b, { scope: 'live' }, resolverFor(t), settings, '', 25);
      return Response.json({ ok: true, paid });
    }

    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION, engine: ENGINE_VERSION });
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');
    const settings = await getSettings(b);
    const open = (settings.games_enabled || []).includes(GAME);
    const CLOSED_GAME = 'The Live Arena is closed right now.';

    // The crowd (Live Arena and tournaments): who is watching, and the emojis thrown at the fighters.
    if (p.action === 'pulse') return Response.json(await pulse(b, me, cleanScope(p.scope), p.here === true));
    if (p.action === 'react') return Response.json({ ok: true, ...(await react(b, me, cleanScope(p.scope), String(p.emoji || ''), Number(p.side))) });

    if (p.action === 'state') {
      if (!open) throw new UserError(CLOSED_GAME);
      const t = await current(b, settings);
      const now = Date.now();
      const status = statusAt(t, now);
      const board = await betBoard(b, { scope: 'live', round_no: t.round_no }, me.id, status === 'result' ? t.outcome : null);
      return Response.json({ table: publicTable(t, now, settings), ...board });
    }

    if (p.action === 'settle') {
      const t = await current(b, settings);
      const resolve = resolverFor(t);
      const pending = await payMine(b, me, { scope: 'live' }, resolve, settings);
      await payOthers(b, { scope: 'live' }, resolve, settings, me.id, 3);
      return Response.json({ ok: true, pending });
    }

    if (p.action === 'bet' || p.action === 'remove') {
      if (!open) throw new UserError(CLOSED_GAME);
      const t = await current(b, settings);
      const STAY = 'Betting is closed for this fight. Wait for the next one.';
      if (!usable(t)) throw new UserError(STAY);
      // A bet was made on the card of this round; never move it onto another fight.
      if (p.round !== undefined && Number(p.round) !== t.round_no) throw new UserError(STAY);
      const key = { scope: 'live' as const, round_no: t.round_no };
      const label = `${ARENA_NAME} fight ${t.round_no}`;
      const res = p.action === 'bet'
        ? await placeBets(b, me, settings, { key, label, names: t.fighters.map((f) => f.name), closeAt: closeMs(t), arrived, odds: t.odds, raw: p.lines })
        : await removeBets(b, me, { key, label, closeAt: closeMs(t), arrived, all: p.all === true, k: String(p.k || '') });
      return Response.json({ ok: true, balance: res.balance, mine: res.mine ? { round_no: t.round_no, ...res.mine } : null });
    }

    throw new UserError('Unknown Arena action.');
  } catch (e) {
    return errorResponse(e);
  }
}