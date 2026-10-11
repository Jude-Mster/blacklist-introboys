import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, UserError, errorResponse, resilient
} from '../../shared/points.ts';
import {
  ENGINE_VERSION, LOOK_KEYS, LIMIT, COSTS, WEAPON, PET, MOUNT, SKILLS, SKILL_IDS, MAX_SKILLS, UPGRADES,
  DEFAULT_VALUES, normValues, rollUpgrade, simulate, outcomeOf, priceMatch
} from '../../shared/arenaEngine.ts';
import { placeBets, removeBets, payMine, payOthers, betBoard, arenaLimit, arenaMin, type Resolve } from '../../shared/arenaBets.ts';
import { postSystem, GUILD_CHANNEL } from '../../shared/chat.ts';
import {
  announceWebhookUrl, announceTournamentOpen, announceTournamentResults, announceTournamentCancelled, announceTournamentStarted, announceTournamentSoon
} from '../../shared/discordPost.ts';
import { checkCode, assertNewCode, codeFields, runStockLocked, takeFromStock, assignAndDeliver } from '../../shared/prizeCodes.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

// Blacklist Arena tournaments, run by the Guild Leader.
//
// Sign-up: a member's first entry gives them a fighter (a random character, with one free re-roll
// that never gives the same one back). Everything else they buy makes that fighter stronger:
// entries (each after the first rolls one upgrade), weapon upgrade tries, skills, a pet and a mount.
// Every point paid goes into the Arena bank. There are no refunds once paid, except when only one
// member signs up (nothing can be played) or the Guild Leader cancels with refunds.
//
// The start (at the scheduled time, or when the Guild Leader presses Start now): the fighters are
// frozen and drawn into a bracket. Then the matches are played live, one after another: each match opens
// for 10 seconds of betting (prices from 2,000 practice fights), and only when its betting closes is it
// fought, with a fresh secret seed; the seed goes out and every screen plays the same fight from it. The
// next match opens when that fight is over. Nothing about any match is decided before its betting closes. A match that reaches the
// 180-second limit goes to the fighter with the larger share of HP left (tournaments have no draws).
// After the last match the prizes are paid, and every fighter and character is removed.
const BET_SECONDS = 10;
const INTRO_SECONDS = 3;
const RESULT_SECONDS = 10;
const LEAD_IN_SECONDS = 10;    // from the start to the first match opening for bets
const MAX_ENTRANTS = 128;
const MAX_PRIZES = 4;
const MAX_PRIZE_POINTS = 10000000;
const TOUR_LOCK_MS = 120000;
const REMIND_MS = 10 * 60000;   // the "starts in 10 minutes" post
const REPEATS = { none: 0, daily: 24 * 3600000, weekly: 7 * 24 * 3600000 };
const cleanRepeat = (v) => (Object.prototype.hasOwnProperty.call(REPEATS, v) ? v : 'none');
// Shared secret only the "Tournament Clock" schedule knows.
const WORKFLOW_SECRET = '102b949348f55485eb70915811df64e9899d03770a523a43';

const iso = (ms: number) => new Date(ms).toISOString();
const E = (b) => b.asServiceRole.entities;
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const secretSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
const PLACE = ['1st', '2nd', '3rd', '4th'];
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');
const lockTour = (b, id: string, fn) => withRecordLock(b, 'Tournament', id, fn, TOUR_LOCK_MS);
const lockMember = (b, id: string, fn) => withMemberLock(b, id, fn, 15000);

// ---------- the bank ----------
async function bankRow(b) {
  const { items } = await E(b).ArenaBank.filter({}, { sort: 'created_date', limit: 1 });
  return items[0] || await E(b).ArenaBank.create({ balance: 0, total_in: 0, total_out: 0, log: [] });
}
// Add (or with a negative amount take) points. `note` adds a line to the bank's log.
async function bankMove(b, amount: number, note = '') {
  const row = await bankRow(b);
  return withRecordLock(b, 'ArenaBank', row.id, async () => {
    const r = await E(b).ArenaBank.get(row.id);
    const log = note ? [{ at: iso(Date.now()), amount, reason: note.slice(0, 120) }, ...(r.log || [])].slice(0, 50) : r.log || [];
    return E(b).ArenaBank.update(r.id, {
      balance: (r.balance || 0) + amount,
      total_in: (r.total_in || 0) + Math.max(0, amount),
      total_out: (r.total_out || 0) + Math.max(0, -amount),
      log
    });
  }, 15000);
}
// Take up to `want` from the bank for a prize. Returns how much it gave.
async function bankTake(b, want: number, note: string) {
  const row = await bankRow(b);
  return withRecordLock(b, 'ArenaBank', row.id, async () => {
    const r = await E(b).ArenaBank.get(row.id);
    const take = Math.max(0, Math.min(want, r.balance || 0));
    if (take > 0) await E(b).ArenaBank.update(r.id, {
      balance: (r.balance || 0) - take, total_out: (r.total_out || 0) + take,
      log: [{ at: iso(Date.now()), amount: -take, reason: note.slice(0, 120) }, ...(r.log || [])].slice(0, 50)
    });
    return take;
  }, 15000);
}

// ---------- prize codes (set aside for a tournament place, like the old raffle) ----------
const PrizeCodes = (b) => E(b).PrizeCode;
const reservedFor = async (b, id: string) => (await PrizeCodes(b).filter({ raffle_id: id, status: 'reserved' }, { limit: 20 })).items;
async function releaseToStock(b, rows) {
  for (const row of rows) await PrizeCodes(b).update(row.id, { status: 'stock', source: '', raffle_id: '', raffle_title: '', place: 0 }).catch(() => {});
}
async function discardReserved(b, rows) {
  for (const row of rows) {
    if (row.source === 'stock') await releaseToStock(b, [row]);
    else await PrizeCodes(b).delete(row.id).catch(() => {});
  }
}
async function reserveCode(b, t, place: number, spec, by: string) {
  const label = t.prizes[place - 1].label;
  if (spec && spec.from_stock === true) {
    const s = await takeFromStock(b, label);
    if (!s) throw new UserError(`No "${label}" codes left in stock. Add some in the admin hall, or type the code.`);
    return PrizeCodes(b).update(s.id, { status: 'reserved', source: 'stock', raffle_id: t.id, raffle_title: t.title, place });
  }
  const code = checkCode(spec && spec.code);
  await assertNewCode(b, code);
  return PrizeCodes(b).create({ ...(await codeFields(code)), label, status: 'reserved', source: 'typed', raffle_id: t.id, raffle_title: t.title, place, added_by: by });
}

// The prizes as the Guild Leader sent them: [{ label, kind, points, from_bank, code }].
function cleanPrizes(raw) {
  const list = (Array.isArray(raw) ? raw : []).filter((x) => x && (String(x.label || '').trim() || Number(x.points) > 0)).slice(0, MAX_PRIZES + 1);
  if (list.length > MAX_PRIZES) throw new UserError(`A tournament can have up to ${MAX_PRIZES} prizes (1st to ${PLACE[MAX_PRIZES - 1]}).`);
  return list.map((x, i) => {
    const kind = ['points', 'code', 'item'].includes(x.kind) ? x.kind : 'item';
    if (kind === 'points') {
      const points = Math.floor(Number(x.points));
      if (!Number.isInteger(points) || points < 1 || points > MAX_PRIZE_POINTS) throw new UserError(`Set the ${PLACE[i]} prize's points (1 to ${fmt(MAX_PRIZE_POINTS)}).`);
      return { label: `${fmt(points)} points`, kind, points, from_bank: x.from_bank === true };
    }
    const label = String(x.label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label) throw new UserError(`Name the ${PLACE[i]} prize.`);
    return { label, kind, points: 0, from_bank: false };
  });
}
const markStock = (prizes, specs) => prizes.map((x, i) => (x.kind === 'code' ? { ...x, from_stock: !!(specs[i] && specs[i].from_stock) } : x));
const codeSpec = (x) => {
  if (!x || !x.code) return null;
  if (x.code.from_stock === true) return { from_stock: true };
  return String(x.code.code || '').trim() ? { code: String(x.code.code) } : null;
};

// ---------- finding tournaments ----------
async function activeTour(b) {
  const lists = await Promise.all(['signup', 'running', 'paying'].map((s) => E(b).Tournament.filter({ status: s }, { sort: '-created_date', limit: 1 })));
  return lists.map((x) => x.items[0]).filter(Boolean).sort((x, y) => String(y.created_date).localeCompare(String(x.created_date)))[0] || null;
}
async function lastTour(b) {
  const lists = await Promise.all(['done', 'cancelled'].map((s) => E(b).Tournament.filter({ status: s }, { sort: '-created_date', limit: 1 })));
  return lists.map((x) => x.items[0]).filter(Boolean).sort((x, y) => String(y.created_date).localeCompare(String(x.created_date)))[0] || null;
}
const entrantsOf = async (b, tourId: string) => (await E(b).TourEntrant.filter({ tour_id: tourId }, { limit: 1000 })).items.filter((x) => (x.entries || 0) > 0);
const buildOf = (x) => ({ entries: x.entries || 0, ups: x.ups || {}, weapon: x.weapon || 0, skills: x.skills || [], pet: x.pet || 0, mount: x.mount && x.mount.lv ? x.mount : null });

// ---------- the bracket ----------
// refs: { s: i } = fighter i of the field; { w: no } = the winner of match no; { l: no } = its loser.
const STAGE = (size: number) => (size === 2 ? 'Final' : size === 4 ? 'Semi-final' : size === 8 ? 'Quarter-final' : `Round of ${size}`);
function drawBracket(n: number) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let P = 1; while (P < n) P *= 2;
  const pairs = P / 2, byes = P - n;
  // Byes go to every other pair first, so two fighters who skipped round 1 rarely meet straight away.
  const byePairs = new Set([...Array.from({ length: pairs }, (_, j) => j).filter((j) => j % 2 === 0), ...Array.from({ length: pairs }, (_, j) => j).filter((j) => j % 2 === 1)].slice(0, byes));
  const matches = [];
  let refs = [], round = 1, semis = null;
  for (let j = 0; j < pairs; j++) {
    if (byePairs.has(j)) refs.push({ s: order.shift() });
    else refs.push({ pair: [{ s: order.shift() }, { s: order.shift() }] });
  }
  // Round 1: pairs with two fighters are matches; a fighter with a bye goes straight through.
  let size = P;
  const play = (list) => list.map((x) => {
    if (!x.pair) return x;
    const no = matches.length + 1;
    matches.push({ no, round, stage: STAGE(size), refs: x.pair });
    return { w: no, l: no };
  });
  let level = play(refs);
  if (size === 4) semis = refs.filter((x) => x.pair).length === 2 ? level.map((x) => x.w) : null;
  while (level.length > 1) {
    round++; size /= 2;
    const next = [];
    for (let j = 0; j < level.length; j += 2) next.push({ pair: [refOf(level[j]), refOf(level[j + 1])] });
    if (size === 4) {
      level = play(next);
      semis = level.map((x) => x.w);
    } else if (size === 2) {
      // The match for 3rd place, between the two semi-final losers, comes before the final.
      if (semis && semis.length === 2) {
        const no = matches.length + 1;
        matches.push({ no, round, stage: 'Third place', refs: [{ l: semis[0] }, { l: semis[1] }], bronze: true });
      }
      level = play(next);
    } else level = play(next);
  }
  return { matches, size: P, byes };
}
const refOf = (x) => (x.s !== undefined ? { s: x.s } : { w: x.w });

// The matches are played one after another, live. Nothing about a match is decided before its betting
// closes: a match is "opened" (its two fighters, prices and betting window) when the one before it is fought,
// and it is "fought" (its seed, result and length picked) the moment its own betting closes.
const whoOf = (ms, ref) => (ref.s !== undefined ? ref.s : ref.w !== undefined ? ms[ref.w - 1].winner : ms[ref.l - 1].loser);
const isFought = (m) => !!(m && m.fought && m.outcome && Number.isInteger(m.seed) && m.end_at);
function openMatch(t, ms, i, openMs: number) {
  const m = ms[i], field = t.field, values = normValues(t.values);
  const a = whoOf(ms, m.refs[0]), b = whoOf(ms, m.refs[1]);
  const fa = { ...field[a].build, name: field[a].name }, fb = { ...field[b].build, name: field[b].name };
  ms[i] = { ...m, a, b, odds: priceMatch(fa, fb, secretSeed(), { draws: false, values, limit: LIMIT }), open_at: iso(openMs), close_at: iso(openMs + BET_SECONDS * 1000) };
}
function fightMatch(t, ms, i) {
  const m = ms[i], field = t.field, values = normValues(t.values);
  const fa = { ...field[m.a].build, name: field[m.a].name }, fb = { ...field[m.b].build, name: field[m.b].name };
  const seed = secretSeed();
  const fight = simulate(fa, fb, seed, { draws: false, frames: false, values, limit: LIMIT });
  const o = outcomeOf(fight);
  // the fight starts on every screen at the moment betting closed
  const end = tms(m.close_at) + Math.ceil((INTRO_SECONDS + fight.length) * 1000);
  ms[i] = { ...m, fought: true, seed, outcome: o, winner: o.winner === 0 ? m.a : m.b, loser: o.winner === 0 ? m.b : m.a, end_at: iso(end) };
}
// Is there work to do (open the next match, fight one whose betting has closed, finish)? Cheap, no writes.
function needsWork(t, now: number) {
  if (t.status !== 'running' || !Array.isArray(t.matches)) return false;
  const i = t.matches.findIndex((m) => !isFought(m));
  if (i < 0) return !t.ends_at || now >= tms(t.ends_at);
  const m = t.matches[i];
  return !m.open_at || now >= tms(m.close_at);
}
// Move a running tournament along. Returns the fields to save, or null. Call inside the tournament lock.
function advance(t, now: number) {
  const ms = (t.matches || []).map((m) => ({ ...m }));
  let changed = false;
  for (let guard = 0; guard < ms.length * 2 + 2; guard++) {
    const i = ms.findIndex((m) => !isFought(m));
    if (i < 0) {
      const last = ms[ms.length - 1];
      const ends = iso(tms(last.end_at) + RESULT_SECONDS * 1000);
      if (t.ends_at !== ends) { t = { ...t, ends_at: ends }; changed = true; }
      break;
    }
    if (!ms[i].open_at) {
      const opens = i === 0 ? tms(t.started_at) + LEAD_IN_SECONDS * 1000 : tms(ms[i - 1].end_at) + RESULT_SECONDS * 1000;
      openMatch(t, ms, i, opens); changed = true;
    }
    if (now >= tms(ms[i].close_at)) { fightMatch(t, ms, i); changed = true; continue; }
    break;
  }
  return changed ? { matches: ms, ends_at: t.ends_at || '' } : null;
}
// Who finished where, from the fought bracket.
function placesOf(ms) {
  const fin = ms.find((m) => m.stage === 'Final'), bronze = ms.find((m) => m.bronze);
  if (!fin) return [];
  const out = [fin.winner, fin.loser];
  if (bronze) out.push(bronze.winner, bronze.loser);
  else {
    // No match for 3rd: the one semi-final loser (or the loser of the match before the final) is 3rd.
    const semi = ms.filter((m) => m.round === fin.round - 1 && !m.bronze);
    if (semi.length === 1) out.push(semi[0].loser);
  }
  return out;
}

// ---------- what members may see ----------
const tms = (s) => Date.parse(s) || 0;
function matchStatus(m, now: number) {
  if (!m.open_at || now < tms(m.open_at)) return 'waiting';
  if (now < tms(m.close_at)) return 'betting';
  return !isFought(m) || now < tms(m.end_at) ? 'fighting' : 'done';
}
function publicTour(t, now: number, leader: boolean) {
  const base = {
    id: t.id, title: t.title, status: t.status, starts_at: t.starts_at || null, started_at: t.started_at || null, ends_at: t.ends_at || null,
    values: normValues(t.values), prizes: (t.prizes || []).map((p) => ({ label: p.label, kind: p.kind, points: p.points || 0, from_bank: !!p.from_bank })),
    entrant_count: t.entrant_count || 0, bank_in: t.bank_in || 0, results: t.results || [], cancel_reason: t.cancel_reason || '',
    finished_at: t.finished_at || null, announced_at: leader ? t.announced_at || null : undefined, engine: t.engine || ENGINE_VERSION,
    repeat: cleanRepeat(t.repeat)
  };
  if (!Array.isArray(t.matches) || !t.matches.length) return { ...base, field: [], matches: [] };
  const ms = t.matches;
  const ended = (no: number) => isFought(ms[no - 1]) && now >= tms(ms[no - 1].end_at);
  const known = (ref) => ref.s !== undefined || ended(ref.w || ref.l);
  const matches = ms.map((m) => {
    const st = matchStatus(m, now);
    const ka = known(m.refs[0]), kb = known(m.refs[1]);
    return {
      no: m.no, round: m.round, stage: m.stage, bronze: !!m.bronze, status: st,
      refs: m.refs, a: ka ? m.a : null, b: kb ? m.b : null,
      odds: ka && kb && m.open_at ? m.odds : null,
      open_at: m.open_at || null, close_at: m.close_at || null,
      seed: isFought(m) && (st === 'fighting' || st === 'done') ? m.seed : null,
      end_at: isFought(m) && (st === 'fighting' || st === 'done') ? m.end_at : null,
      outcome: st === 'done' ? m.outcome : null,
      winner: st === 'done' ? m.winner : null
    };
  });
  return { ...base, field: t.field || [], matches };
}
const publicEntrant = (x) => ({
  member_id: x.member_id, name: x.name, avatar: x.avatar, role: x.role || 'member', look: x.look, entries: x.entries || 0,
  ups: x.ups || {}, weapon: x.weapon || 0, skills: x.skills || [], pet: x.pet || 0, mount: x.mount && x.mount.lv ? x.mount : null, spent: x.spent || 0
});

// ---------- start, cancel, finish ----------
async function postEverywhere(b, chat: string, discord: () => Promise<boolean>) {
  await postSystem(b, GUILD_CHANNEL, chat.slice(0, 300));
  try { await discord(); } catch (e) { console.error('tournament discord post failed', e); }
}
async function clearEntrants(b, tourId: string) {
  const { items } = await E(b).TourEntrant.filter({ tour_id: tourId }, { limit: 1000 });
  for (const x of items) await E(b).TourEntrant.delete(x.id).catch(() => {});
}
// Give back what each fighter paid. One failing doesn't stop the others.
async function refundAll(b, t, entrants, why: string) {
  let total = 0;
  for (const x of entrants) {
    if (!(x.spent > 0)) continue;
    try {
      await lockMember(b, x.member_id, () => changePoints(b, x.member_id, x.spent, 'tournament', `Tournament refund (${why}): ${t.title}`, null));
      total += x.spent;
    } catch (e) { console.error('tournament refund failed', t.id, x.member_id, x.spent, String(e && e.message || e)); }
  }
  if (total) await bankMove(b, -total, `Refunds: ${t.title}`).catch((e) => console.error('bank refund note failed', e));
  return total;
}
async function cancelTour(b, t, reason: string, refund: boolean, refundWhy: string, repeatNext = true) {
  const entrants = await entrantsOf(b, t.id);
  await E(b).Tournament.update(t.id, { status: 'cancelled', cancel_reason: reason, finished_at: iso(Date.now()) });
  if (refund) await refundAll(b, t, entrants, refundWhy);
  await discardReserved(b, await reservedFor(b, t.id));
  await clearEntrants(b, t.id);
  await postEverywhere(b, `Tournament "${t.title}" cancelled. ${reason}`, () => announceTournamentCancelled(t.title, reason));
  if (repeatNext) await scheduleNext(b, t);
}

// A repeating tournament opens its next one when it ends: the same name, prizes and upgrade values, one day
// or one week after this one's start time. Code prizes taken from stock take a new code from stock; a typed
// code can't be used twice, so that place waits for the Guild Leader to add one.
async function scheduleNext(b, t) {
  const step = REPEATS[cleanRepeat(t.repeat)];
  if (!step) return null;
  try {
    const fresh = await E(b).Tournament.get(t.id).catch(() => t);
    if (fresh.next_id) return null;
    if (await activeTour(b)) return null;
    let next = (tms(t.starts_at) || tms(t.started_at) || Date.now()) + step;
    while (next < Date.now() + 60000) next += step;
    const prizes = (t.prizes || []).map((x) => ({ ...x }));
    const n = await E(b).Tournament.create({
      title: t.title, status: 'signup', starts_at: iso(next), values: normValues(t.values), prizes, repeat: t.repeat,
      entrant_count: 0, bank_in: 0, created_by: t.created_by || '', engine: ENGINE_VERSION
    });
    await E(b).Tournament.update(t.id, { next_id: n.id }).catch(() => {});
    await runStockLocked(b, async () => {
      for (let i = 0; i < prizes.length; i++) {
        if (prizes[i].kind !== 'code' || !prizes[i].from_stock) continue;
        try { await reserveCode(b, n, i + 1, { from_stock: true }, t.created_by || ''); } catch (e) { console.error('repeat: no stock code', n.id, i + 1, String(e && e.message || e)); }
      }
    }).catch((e) => console.error('repeat: stock lock failed', e));
    const when = new Date(next).toISOString().replace('T', ' ').slice(0, 16);
    await postSystem(b, GUILD_CHANNEL, `The next "${t.title}" is open for sign-up. It starts ${when} UTC. Entry ${fmt(COSTS.entry)} points.`);
    try { await announceTournamentOpen(n, COSTS.entry, false); } catch (e) { console.error('repeat announce failed', e); }
    return n;
  } catch (e) {
    console.error('repeat: next tournament failed', t.id, String(e && e.message || e));
    return null;
  }
}

// Start: freeze the fighters, draw the bracket and fight every match. Call inside the tournament lock.
async function startTour(b, t) {
  const entrants = await entrantsOf(b, t.id);
  if (entrants.length === 0) return cancelTour(b, t, 'No one signed up.', false, '');
  if (entrants.length === 1) {
    const x = entrants[0];
    return cancelTour(b, t, `Only 1 fighter signed up (${x.name}), so there is no one to fight. ${x.name}'s ${fmt(x.spent || 0)} points were refunded.`, true, 'only one fighter');
  }
  const list = entrants.slice(0, MAX_ENTRANTS);
  const field = list.map((x) => ({ member_id: x.member_id, name: x.name, avatar: x.avatar || '', role: x.role || 'member', look: x.look, build: buildOf(x) }));
  const values = normValues(t.values);
  const plan = drawBracket(field.length);
  const now = Date.now();
  // Only the bracket is drawn here. The first match opens for bets a few seconds from now; every match is
  // fought when its own betting closes.
  const begun = { ...t, status: 'running', started_at: iso(now), field, values, matches: plan.matches, ends_at: '' };
  const first = advance(begun, now);
  const matches = first ? first.matches : plan.matches;
  await E(b).Tournament.update(t.id, {
    status: 'running', engine: ENGINE_VERSION, started_at: iso(now), field, matches, ends_at: '', entrant_count: field.length
  });
  if (t.bank_in) await bankMove(b, 0, `${t.title}: ${fmt(t.bank_in)} points paid in by ${field.length} fighters`).catch(() => {});
  const firstOpen = new Date(now + LEAD_IN_SECONDS * 1000);
  await postEverywhere(b, `Tournament "${t.title}" has started: ${field.length} fighters, ${matches.length} matches. The first match opens for bets at ${firstOpen.toISOString().slice(11, 16)} UTC.`,
    () => announceTournamentStarted(t.title, field, matches.length, firstOpen.getTime()));
}

// After the last match: pay the prizes, then remove every fighter. Safe to call again after a crash.
async function finishTour(b, t) {
  let cur = t;
  if (cur.status === 'running') cur = await E(b).Tournament.update(t.id, { status: 'paying' });
  const places = placesOf(cur.matches || []);
  const field = cur.field || [];
  let results = Array.isArray(cur.results) && cur.results.length ? cur.results.map((r) => ({ ...r })) : places.map((fi, i) => {
    const p = (cur.prizes || [])[i];
    return { place: i + 1, member_id: field[fi].member_id, name: field[fi].name, avatar: field[fi].avatar, look: field[fi].look, prize: p ? p.label : '', kind: p ? p.kind : '', points: p && p.kind === 'points' ? p.points : 0, from_bank: !!(p && p.from_bank), paid: false, pay_started: false };
  });
  const save = async () => { cur = await E(b).Tournament.update(cur.id, { results }).catch(() => cur); };
  await save();
  const members = {};
  for (const r of results) members[r.member_id] = await E(b).Member.get(r.member_id).catch(() => null);
  for (const r of results) {
    if (r.kind !== 'points' || r.paid || !(r.points > 0)) continue;
    const reason = `Tournament prize, ${PLACE[r.place - 1]} (${r.prize}): ${cur.title} [${cur.id}:${r.place}]`;
    try {
      let already = false;
      if (r.pay_started) already = (await E(b).PointLog.filter({ member_id: r.member_id, reason }, { limit: 1 })).items.length > 0;
      else { r.pay_started = true; await save(); }
      if (!already) {
        if (r.from_bank && r.bank_paid === undefined) { r.bank_paid = await bankTake(b, r.points, `${PLACE[r.place - 1]} prize to ${r.name}: ${cur.title}`); await save(); }
        await lockMember(b, r.member_id, () => changePoints(b, r.member_id, r.points, 'tournament', reason, null));
      }
      r.paid = true;
    } catch (e) { console.error('tournament prize failed', cur.id, r.place, String(e && e.message || e)); }
    await save();
  }
  // Code prizes: the code set aside for each place goes to whoever finished there.
  const reserved = await reservedFor(b, cur.id);
  const placed = new Set(results.map((r) => r.place));
  await releaseToStock(b, reserved.filter((x) => !placed.has(Number(x.place))));
  for (const r of results) {
    if (r.kind !== 'code' || r.code_status === 'delivered') continue;
    const row = reserved.find((x) => Number(x.place) === r.place), m = members[r.member_id];
    if (!row) { r.code_status = r.code_status || 'missing'; continue; }
    if (!m) { await releaseToStock(b, [row]); r.code_status = 'returned'; await save(); continue; }
    try { await assignAndDeliver(b, row, m, { source: 'tournament', raffle_id: cur.id, raffle_title: cur.title, place: r.place, reason: '' }); r.code_status = 'delivered'; }
    catch (e) { console.error('tournament code delivery failed', cur.id, r.place, String(e && e.message || e)); }
    await save();
  }
  if (results.some((r) => r.kind === 'points' && !r.paid)) return cur; // try again on the next visit / schedule
  cur = await E(b).Tournament.update(cur.id, { status: 'done', results, finished_at: iso(Date.now()) });
  await clearEntrants(b, cur.id);
  const withIds = results.map((r) => ({ ...r, discord_id: members[r.member_id] ? members[r.member_id].discord_id : '' }));
  await postEverywhere(b, `Tournament "${cur.title}" is over! ${results.map((r) => `${PLACE[r.place - 1]}: ${r.name}${r.prize ? ` (${r.prize})` : ''}`).join(', ')}`, () => announceTournamentResults(cur.title, withIds));
  await scheduleNext(b, cur);
  return cur;
}

// Move the tournament along: start it when its time comes, finish it after the last match.
async function tick(b, t) {
  if (!t) return t;
  const now = Date.now();
  const remind = t.status === 'signup' && t.starts_at && !t.reminded_at && now >= tms(t.starts_at) - REMIND_MS && now < tms(t.starts_at);
  const due = remind || (t.status === 'signup' && t.starts_at && now >= tms(t.starts_at))
    || needsWork(t, now) || t.status === 'paying';
  if (!due) return t;
  try {
    return await lockTour(b, t.id, async () => {
      const cur = await E(b).Tournament.get(t.id);
      const left = tms(cur.starts_at) - Date.now();
      if (cur.status === 'signup' && cur.starts_at && !cur.reminded_at && left > 0 && left <= REMIND_MS) {
        // "Starts in 10 minutes": once, in guild chat and on Discord
        await E(b).Tournament.update(cur.id, { reminded_at: iso(Date.now()) });
        const mins = Math.max(1, Math.round(left / 60000));
        await postEverywhere(b, `Tournament "${cur.title}" starts in ${mins} minute${mins === 1 ? '' : 's'}! ${fmt(cur.entrant_count || 0)} fighters signed up. Last chance to sign up or upgrade.`,
          () => announceTournamentSoon(cur, mins, COSTS.entry));
      }
      if (cur.status === 'signup' && cur.starts_at && Date.now() >= tms(cur.starts_at)) await startTour(b, cur);
      else if (cur.status === 'running') {
        const upd = advance(cur, Date.now());
        const next = upd ? await E(b).Tournament.update(cur.id, upd) : cur;
        if (next.ends_at && Date.now() >= tms(next.ends_at)) await finishTour(b, next);
      } else if (cur.status === 'paying') await finishTour(b, cur);
      return await E(b).Tournament.get(t.id);
    });
  } catch (e) {
    if (e instanceof UserError) return await E(b).Tournament.get(t.id); // someone else is moving it on
    throw e;
  }
}

// What a tournament bet's match came to.
function tourResolver(b): Resolve {
  const cache = new Map();
  return async (row) => {
    if (!cache.has(row.tour_id)) cache.set(row.tour_id, await E(b).Tournament.get(row.tour_id).catch(() => null));
    const t = cache.get(row.tour_id);
    if (!t) return { over: true, o: null };
    if (t.status === 'cancelled' && !(t.matches || []).length) return { over: true, o: null };
    const m = (t.matches || []).find((x) => x.no === row.match_no);
    if (!m) return { over: true, o: null };
    if (!isFought(m) || Date.now() < tms(m.end_at)) return { over: false };
    return { over: true, o: m.outcome };
  };
}

// ---------- the shop ----------
function freeLook(taken: Set<string>, not: string) {
  let pool = LOOK_KEYS.filter((k) => !taken.has(k) && k !== not);
  if (!pool.length) pool = LOOK_KEYS.filter((k) => k !== not);
  return pool[Math.floor(rand() * pool.length)];
}

async function buy(b, t, me, item: string, count: number) {
  const values = normValues(t.values);
  return lockTour(b, t.id, async () => {
    const cur = await E(b).Tournament.get(t.id);
    if (cur.status !== 'signup') throw new UserError('The tournament has started, so the shop is closed.');
    const { items } = await E(b).TourEntrant.filter({ tour_id: cur.id, member_id: me.id }, { limit: 2 });
    let x = items[0] || null;
    if (!x && item !== 'entry') throw new UserError('Buy your first entry to get your fighter first.');
    if (!x && (cur.entrant_count || 0) >= MAX_ENTRANTS) throw new UserError(`The tournament is full (${MAX_ENTRANTS} fighters).`);
    const ups = { ...(x && x.ups || {}) };
    const next = x ? { entries: x.entries || 0, ups, weapon: x.weapon || 0, weapon_tries: x.weapon_tries || 0, skills: [...(x.skills || [])], pet: x.pet || 0, mount: x.mount && x.mount.lv ? { ...x.mount } : null, mount_resets: x.mount_resets || 0 } : { entries: 0, ups, weapon: 0, weapon_tries: 0, skills: [], pet: 0, mount: null, mount_resets: 0 };
    let cost = 0, what = '';
    const rolled: any = { item };
    if (item === 'entry') {
      const n = Math.floor(count);
      if (!Number.isInteger(n) || n < 1 || n > 50) throw new UserError('Buy 1 to 50 entries at a time.');
      cost = n * COSTS.entry; what = `${n} ${n === 1 ? 'entry' : 'entries'}`;
      rolled.ups = [];
      for (let k = 0; k < n; k++) {
        next.entries++;
        if (next.entries === 1) continue; // the first entry is the fighter itself
        const u = rollUpgrade(next.ups, rand);
        rolled.ups.push(u ? u.id : null);
      }
    } else if (item === 'weapon') {
      if (next.weapon >= WEAPON.max) throw new UserError(`Your weapon is already +${WEAPON.max}.`);
      cost = COSTS.weaponTry; what = 'a weapon upgrade try';
      next.weapon_tries++;
      rolled.success = rand() < values.weapon.chance;
      if (rolled.success) next.weapon++;
      rolled.weapon = next.weapon;
    } else if (item === 'skill') {
      if (next.skills.length >= MAX_SKILLS) throw new UserError(`You already have ${MAX_SKILLS} skills.`);
      const pool = SKILL_IDS.filter((id) => !next.skills.includes(id));
      const id = pool[Math.floor(rand() * pool.length)];
      next.skills.push(id); rolled.skill = id;
      cost = COSTS.skill; what = `a skill (${SKILLS[id].name})`;
    } else if (item === 'pet') {
      if (next.pet >= PET.levels) throw new UserError('Your pet is already at 200% growth.');
      next.pet++; rolled.pet = next.pet;
      cost = COSTS.pet; what = `pet growth to ${next.pet * 25}%`;
    } else if (item === 'mount') {
      if (next.mount && next.mount.lv >= MOUNT.levels) throw new UserError(`Your mount is already level ${MOUNT.levels}.`);
      if (!next.mount) { next.mount = { lv: 1, pair: Math.floor(rand() * MOUNT.pairs.length) }; rolled.drew = true; }
      else next.mount.lv++;
      rolled.mount = { ...next.mount };
      cost = COSTS.mountLevel; what = `mount level ${next.mount.lv}`;
    } else if (item === 'mountReset') {
      if (!next.mount) throw new UserError('Buy a mount first.');
      const old = next.mount.pair;
      let p; do { p = Math.floor(rand() * MOUNT.pairs.length); } while (p === old);
      next.mount.pair = p; next.mount_resets++;
      rolled.old = old; rolled.mount = { ...next.mount };
      cost = COSTS.mountReset; what = 'a mount stat reset';
    } else throw new UserError('Unknown item.');
    if (me.banned) throw new UserError('You are banned from the games.', 403);

    return lockMember(b, me.id, async () => {
      let balance;
      try { ({ balance } = await changePoints(b, me.id, -cost, 'tournament', `Tournament: ${what}: ${cur.title}`, null)); }
      catch (e) { throw /not enough/i.test(String(e && e.message)) ? new UserError('Not enough points for that.') : e; }
      try {
        if (!x) {
          const taken = new Set((await E(b).TourEntrant.filter({ tour_id: cur.id }, { limit: 1000 })).items.map((y) => y.look));
          x = await E(b).TourEntrant.create({
            tour_id: cur.id, member_id: me.id, name: String(me.discord_name || me.discord_id).slice(0, 32), avatar: me.avatar_url || '', role: me.role,
            look: freeLook(taken, ''), rerolled: false, ...next, spent: cost
          });
          rolled.joined = true;
          await E(b).Tournament.update(cur.id, { entrant_count: (cur.entrant_count || 0) + 1, bank_in: (cur.bank_in || 0) + cost });
        } else {
          x = await E(b).TourEntrant.update(x.id, { ...next, spent: (x.spent || 0) + cost });
          await E(b).Tournament.update(cur.id, { bank_in: (cur.bank_in || 0) + cost });
        }
      } catch (e) {
        await changePoints(b, me.id, cost, 'tournament', `Tournament refund, purchase not saved: ${cur.title}`, null).catch(() => {});
        throw new UserError("That purchase couldn't be saved, so your points were returned. Try again.");
      }
      await bankMove(b, cost).catch((e) => console.error('bank deposit failed', cur.id, cost, e));
      return { balance, me: x, rolled };
    });
  });
}

async function reroll(b, t, me) {
  return lockTour(b, t.id, async () => {
    const cur = await E(b).Tournament.get(t.id);
    if (cur.status !== 'signup') throw new UserError('The tournament has started.');
    const { items } = await E(b).TourEntrant.filter({ tour_id: cur.id, member_id: me.id }, { limit: 2 });
    const x = items[0];
    if (!x) throw new UserError('Buy your first entry to get your fighter first.');
    if (x.rerolled) throw new UserError('You have used your free re-roll.');
    const taken = new Set((await E(b).TourEntrant.filter({ tour_id: cur.id }, { limit: 1000 })).items.filter((y) => y.id !== x.id).map((y) => y.look));
    const look = freeLook(taken, x.look);
    const row = await E(b).TourEntrant.update(x.id, { look, rerolled: true });
    return { me: row, old: x.look };
  });
}

export default async function(req) {
  try {
    const arrived = Date.now();
    const b = resilient(createClientFromRequest(req));
    let p; try { p = await req.clone().json(); } catch { p = {}; }

    // The "Tournament Clock" schedule: starts and finishes tournaments on time and pays match bets,
    // even if nobody is on the site.
    if (p.action === 'sweep') {
      if (p.__wf_secret !== WORKFLOW_SECRET) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
      const settings = await getSettings(b);
      let t = null;
      try { t = await tick(b, await activeTour(b)); } catch (e) { console.error('tournament tick failed', e); }
      const paid = await payOthers(b, { scope: 'tour' }, tourResolver(b), settings, '', 25);
      return Response.json({ ok: true, status: t ? t.status : null, paid });
    }

    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION, engine: ENGINE_VERSION });
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');
    const leader = me.role === 'leader';
    const settings = await getSettings(b);

    // A quick look for the menu badge and the guild hall banner (no clock work).
    if (p.action === 'status') {
      const t = await activeTour(b);
      return Response.json({ tournament: t ? { id: t.id, title: t.title, status: t.status, starts_at: t.starts_at || null, ends_at: t.ends_at || null, entrant_count: t.entrant_count || 0, prizes: (t.prizes || []).map((x) => x.label) } : null, server_now: iso(Date.now()), entry: COSTS.entry });
    }

    if (p.action === 'state') {
      let t = await tick(b, await activeTour(b));
      // it just ended: a repeating one may have opened the next
      if (t && !['signup', 'running', 'paying'].includes(t.status)) t = await activeTour(b);
      const now = Date.now();
      const out: any = { server_now: iso(now), costs: COSTS, limit: arenaLimit(settings), min_bet: arenaMin(settings), bet_seconds: BET_SECONDS, intro: INTRO_SECONDS, result_seconds: RESULT_SECONDS, engine: ENGINE_VERSION };
      out.tournament = t ? publicTour(t, now, leader) : null;
      if (!t) { const last = await lastTour(b); out.last = last ? publicTour(last, now, false) : null; }
      if (t && t.status === 'signup') {
        const list = await entrantsOf(b, t.id);
        out.entrants = list.map(publicEntrant).sort((x, y) => y.entries - x.entries);
        const mine = list.find((x) => x.member_id === me.id);
        out.me = mine ? { ...publicEntrant(mine), rerolled: !!mine.rerolled, weapon_tries: mine.weapon_tries || 0, mount_resets: mine.mount_resets || 0 } : null;
      }
      // The match on now (or the last one shown) and everyone's bets on it.
      if (t && Array.isArray(t.matches) && t.matches.length) {
        const live = t.matches.find((m) => m.open_at && now >= tms(m.open_at) && (!isFought(m) || now < tms(m.end_at) + RESULT_SECONDS * 1000)) || null;
        if (live) {
          const st = matchStatus(live, now);
          out.board = { match_no: live.no, ...(await betBoard(b, { scope: 'tour', tour_id: t.id, match_no: live.no }, me.id, st === 'done' ? live.outcome : null)) };
        }
      }
      if (leader) {
        const bank = await bankRow(b);
        out.bank = { balance: bank.balance || 0, total_in: bank.total_in || 0, total_out: bank.total_out || 0, log: (bank.log || []).slice(0, 20) };
        out.discord_announce = !!announceWebhookUrl();
        if (t) {
          const rows = (await PrizeCodes(b).filter({ raffle_id: t.id }, { limit: 20 })).items;
          out.code_slots = (t.prizes || []).map((x, i) => {
            if (x.kind !== 'code') return null;
            const row = rows.find((r) => Number(r.place) === i + 1 && (r.status === 'reserved' || r.status === 'assigned'));
            return { place: i + 1, last4: row ? row.last4 : '', status: row ? row.status : '', dm_status: row ? row.dm_status || '' : '' };
          });
        }
      }
      return Response.json(out);
    }

    // ---------- members ----------
    if (p.action === 'buy' || p.action === 'reroll') {
      const t = await activeTour(b);
      if (!t || t.status !== 'signup') throw new UserError('There is no tournament open for sign-up.');
      if (me.banned) throw new UserError('You are banned from the games.', 403);
      const res = p.action === 'buy' ? await buy(b, t, me, String(p.item || ''), Number(p.count || 1)) : await reroll(b, t, me);
      return Response.json({ ok: true, ...res, me: res.me ? { ...publicEntrant(res.me), rerolled: !!res.me.rerolled, weapon_tries: res.me.weapon_tries || 0, mount_resets: res.me.mount_resets || 0 } : null });
    }

    if (p.action === 'bet' || p.action === 'remove') {
      const t = await activeTour(b);
      if (!t || t.status !== 'running' || !Array.isArray(t.matches)) throw new UserError('No tournament match is open for bets.');
      const m = t.matches.find((x) => x.no === Number(p.match));
      if (!m) throw new UserError('That match is not in this tournament.');
      if (!m.open_at || arrived < tms(m.open_at)) throw new UserError('Betting on that match has not opened yet.');
      const key = { scope: 'tour' as const, tour_id: t.id, match_no: m.no };
      const names = [t.field[m.a].name, t.field[m.b].name];
      const label = `Tournament "${t.title}" match ${m.no}`;
      const res = p.action === 'bet'
        ? await placeBets(b, me, settings, { key, label, names, closeAt: tms(m.close_at), arrived, odds: m.odds, raw: p.lines })
        : await removeBets(b, me, { key, label, closeAt: tms(m.close_at), arrived, all: p.all === true, k: String(p.k || '') });
      return Response.json({ ok: true, balance: res.balance, mine: res.mine ? { match_no: m.no, ...res.mine } : null });
    }

    if (p.action === 'settle') {
      const resolve = tourResolver(b);
      const pending = await payMine(b, me, { scope: 'tour' }, resolve, settings);
      await payOthers(b, { scope: 'tour' }, resolve, settings, me.id, 3);
      return Response.json({ ok: true, pending });
    }

    // ---------- the Guild Leader ----------
    if (!leader) throw new UserError('Only the Guild Leader can run tournaments.', 403);

    if (p.action === 'create') {
      if (await activeTour(b)) throw new UserError('A tournament is already open. Finish or cancel it first.');
      const title = String(p.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!title) throw new UserError('Give the tournament a name.');
      const starts = p.starts_at ? Date.parse(String(p.starts_at)) : 0;
      if (p.starts_at && (!Number.isFinite(starts) || starts < Date.now() + 60000)) throw new UserError('Pick a start time at least a minute from now, or leave it empty and use Start now.');
      if (starts && starts > Date.now() + 60 * 24 * 3600000) throw new UserError('A tournament can be scheduled up to 60 days ahead.');
      const raw = Array.isArray(p.prizes) ? p.prizes : [];
      const specs = raw.filter((x) => x && (String(x.label || '').trim() || Number(x.points) > 0)).map(codeSpec);
      const prizes = markStock(cleanPrizes(raw), specs);
      prizes.forEach((x, i) => { if (x.kind === 'code' && !specs[i]) throw new UserError(`Add the code for the ${PLACE[i]} prize, or take one from stock.`); });
      const repeat = cleanRepeat(p.repeat);
      if (repeat !== 'none' && !starts) throw new UserError('A repeating tournament needs a start time.');
      const typed = new Set();
      for (let i = 0; i < prizes.length; i++) {
        const sp = specs[i];
        if (prizes[i].kind !== 'code' || !sp || sp.from_stock) continue;
        const c = checkCode(sp.code).toUpperCase();
        if (typed.has(c)) throw new UserError('The same code is used for two prizes.');
        typed.add(c);
        await assertNewCode(b, sp.code);
      }
      const t = await E(b).Tournament.create({
        title, status: 'signup', starts_at: starts ? iso(starts) : '', values: normValues(p.values), prizes, repeat,
        entrant_count: 0, bank_in: 0, created_by: me.id, engine: ENGINE_VERSION
      });
      try {
        await runStockLocked(b, async () => {
          for (let i = 0; i < prizes.length; i++) if (prizes[i].kind === 'code') await reserveCode(b, t, i + 1, specs[i], me.id);
        });
      } catch (e) {
        await discardReserved(b, await reservedFor(b, t.id));
        await E(b).Tournament.delete(t.id).catch(() => {});
        throw e;
      }
      await postSystem(b, GUILD_CHANNEL, `Tournament "${title}" is open for sign-up! Entry ${fmt(COSTS.entry)} points. Top prize: ${prizes[0] ? prizes[0].label : 'glory'}.`);
      return Response.json({ ok: true, id: t.id });
    }

    const t = await activeTour(b);
    if (!t) throw new UserError('There is no tournament open.');

    if (p.action === 'edit') {
      return Response.json(await lockTour(b, t.id, async () => {
        const cur = await E(b).Tournament.get(t.id);
        if (cur.status !== 'signup') throw new UserError('The tournament has started; it can no longer be changed.');
        const update: any = {};
        if ('title' in p) { const title = String(p.title || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!title) throw new UserError('Give the tournament a name.'); update.title = title; }
        if ('starts_at' in p) {
          const starts = p.starts_at ? Date.parse(String(p.starts_at)) : 0;
          if (p.starts_at && (!Number.isFinite(starts) || starts < Date.now() + 60000)) throw new UserError('Pick a start time at least a minute from now, or clear it and use Start now.');
          if (starts && starts > Date.now() + 60 * 24 * 3600000) throw new UserError('A tournament can be scheduled up to 60 days ahead.');
          update.starts_at = starts ? iso(starts) : '';
        }
        if ('values' in p) update.values = normValues(p.values);
        if ('repeat' in p) update.repeat = cleanRepeat(p.repeat);
        if ((update.repeat ?? cleanRepeat(cur.repeat)) !== 'none' && !('starts_at' in update ? update.starts_at : cur.starts_at)) throw new UserError('A repeating tournament needs a start time.');
        if ('prizes' in p) {
          const raw = Array.isArray(p.prizes) ? p.prizes : [];
          const specs = raw.filter((x) => x && (String(x.label || '').trim() || Number(x.points) > 0)).map(codeSpec);
          const prizes = markStock(cleanPrizes(raw), specs).map((x, i) => (x.kind === 'code' && !specs[i] && (cur.prizes || [])[i] ? { ...x, from_stock: !!cur.prizes[i].from_stock } : x));
          const held = await reservedFor(b, cur.id);
          // A code prize keeps the code already set aside for its place when it has the same name and no
          // new code was given; anything else set aside goes back.
          const keep = new Set();
          prizes.forEach((x, i) => {
            if (x.kind !== 'code' || specs[i]) return;
            const old = (cur.prizes || [])[i];
            const row = held.find((r) => Number(r.place) === i + 1);
            if (row && old && old.kind === 'code' && old.label === x.label) keep.add(row.id);
            else throw new UserError(`Add the code for the ${PLACE[i]} prize, or take one from stock.`);
          });
          const draft = { ...cur, ...update, prizes };
          const fresh = [];
          await runStockLocked(b, async () => {
            try { for (let i = 0; i < prizes.length; i++) if (prizes[i].kind === 'code' && specs[i]) fresh.push(await reserveCode(b, draft, i + 1, specs[i], me.id)); }
            catch (e) { await discardReserved(b, fresh); throw e; }
          });
          await discardReserved(b, held.filter((r) => !keep.has(r.id)));
          update.prizes = prizes;
        }
        await E(b).Tournament.update(cur.id, update);
        return { ok: true };
      }));
    }

    if (p.action === 'start') {
      return Response.json(await lockTour(b, t.id, async () => {
        const cur = await E(b).Tournament.get(t.id);
        if (cur.status !== 'signup') throw new UserError('The tournament has already started.');
        await startTour(b, cur);
        const after = await E(b).Tournament.get(t.id);
        return { ok: true, status: after.status, cancel_reason: after.cancel_reason || '' };
      }));
    }

    if (p.action === 'cancel') {
      return Response.json(await lockTour(b, t.id, async () => {
        const cur = await E(b).Tournament.get(t.id);
        if (cur.status !== 'signup') throw new UserError('Only a tournament that has not started can be cancelled.');
        const refund = p.refund !== false;
        await cancelTour(b, cur, refund ? 'The Guild Leader cancelled it. Everything paid was refunded.' : 'The Guild Leader cancelled it.', refund, 'cancelled', p.keep_repeating === true);
        return { ok: true };
      }));
    }

    if (p.action === 'announce') {
      if (!announceWebhookUrl()) throw new UserError('Discord announcements are not connected yet. Add the DISCORD_ANNOUNCE_WEBHOOK_URL secret first.');
      if (t.status !== 'signup') throw new UserError('Only a tournament open for sign-up can be posted.');
      if (t.announced_at && Date.now() - tms(t.announced_at) < 60000) throw new UserError('It was just posted. Wait a minute before posting again.');
      const okd = await announceTournamentOpen(t, COSTS.entry, p.ping === true);
      if (!okd) throw new UserError("Discord didn't accept the post. Check the announcements webhook and try again.");
      const at = iso(Date.now());
      await E(b).Tournament.update(t.id, { announced_at: at });
      return Response.json({ ok: true, announced_at: at });
    }

    throw new UserError('Unknown tournament action.');
  } catch (e) {
    return errorResponse(e);
  }
}