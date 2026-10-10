import { recentMember } from './session.ts';
// Shared points + game logic for BLACKLIST INTROBOYS.
// Every points change goes through changePoints so balances never go below 0
// and a PointLog row is written together with the balance update.
// Callers that read a balance and then change it wrap the work in withMemberLock
// so two requests at the same moment can't spend the same points twice.

// ---------- Randomness ----------

// Unbiased integer in [0, maxExclusive) from the platform CSPRNG (rejection sampling).
export function randInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error("randInt: bad range");
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % maxExclusive;
  }
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Settings + lookups ----------

export const ALL_GAMES = ["coinflip", "dragondice", "lanternslots", "skywheel", "roulette", "blackjack", "lucky9", "poker", "pusoy", "fortune", "derby", "arena"];

// Ranks, lowest to highest. "officer" is shown as Vice Guild Member.
export const RANKS = ["member", "guild_member", "officer", "leader"];
export const RANK_TITLE = { member: "Member", guild_member: "Guild Member", officer: "Vice Guild Member", leader: "Guild Leader" };
export const GAME_NAMES = {
  coinflip: "Blacklist Yin Yang Toss",
  dragondice: "Blacklist Dragon Dice",
  lanternslots: "Blacklist Lantern Slots",
  skywheel: "Blacklist Twelve Skies Wheel",
  roulette: "Blacklist Jade Roulette",
  blackjack: "Blacklist Blackjack",
  lucky9: "Blacklist Lucky 9",
  poker: "Poker Room",
  pusoy: "Pusoy Dos",
  fortune: "Blacklist Dragon's Fortune",
  derby: "Blacklist Derby",
  arena: "Blacklist Arena"
};

// Settings change rarely but are needed by every request, so each running copy of a
// function remembers them for a few seconds instead of reading them every time.
const SETTINGS_CACHE_MS = Number((globalThis as any).__settingsCacheMs ?? 10000); // tests set this to 0
let settingsCache: { v: any; at: number } | null = null;
export function clearSettingsCache() { settingsCache = null; }

export async function getSettings(b, fresh = false) {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) return settingsCache.v;
  const v = await readSettings(b);
  settingsCache = { v, at: Date.now() };
  return v;
}

async function readSettings(b) {
  const { items } = await b.asServiceRole.entities.Settings.filter({}, { limit: 1 });
  if (items.length === 0) {
    return await b.asServiceRole.entities.Settings.create({
      guild_id: "",
      officer_role_id: "",
      discord_invite_url: "",
      min_bet: 10,
      max_bet: 5000,
      daily_bet_cap: 50000,
      house_edge_pct: 3,
      daily_wheel_prizes: [50, 100, 150, 250, 500, 1000],
      award_cap_per_day: 10000,
      games_enabled: ALL_GAMES
    });
  }
  return items[0];
}

export function houseEdge(settings) {
  const e = Number(settings.house_edge_pct);
  if (!Number.isFinite(e) || e < 0) return 0;
  return Math.min(e, 20) / 100;
}

// The member row for the signed-in caller, whether or not they still have access.
// `userId` is the id from sessionUser(), which is the Member id.
export async function getMemberRecordByUserId(b, userId) {
  if (!userId) return null;
  const seen = recentMember(userId); // just read by sessionUser() for this request
  if (seen) return seen;
  try {
    return (await b.asServiceRole.entities.Member.get(userId)) || null;
  } catch {
    return null;
  }
}

// Used by every function: someone who lost the guild role counts as signed out.
export async function getMemberByUserId(b, userId) {
  const m = await getMemberRecordByUserId(b, userId);
  return m && !m.no_access ? m : null;
}

export async function getMemberByDiscordId(b, discordId) {
  const { items } = await b.asServiceRole.entities.Member.filter({ discord_id: String(discordId) }, { limit: 1 });
  return items[0] || null;
}

// Pull a friendly error out of a thrown value. Messages prefixed with "!" are user-facing.
export class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(e) {
  if (e instanceof UserError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: e && e.message ? e.message : "Something went wrong." }, { status: 500 });
}

// ---------- Riding out the platform's request limit ----------
// The data store refuses calls when too many arrive at once ("Rate limit exceeded").
// A refused call was not carried out, so it is safe to wait a moment and send it again.
// resilient(client) makes every entity call do that, instead of failing the whole
// request (and showing the member an error) because of one busy moment.
const RETRY_BASE_MS = Number((globalThis as any).__retryBaseMs ?? 250); // tests set this lower
const RETRIES = 5;
const isRateLimit = (e) => {
  const status = e && (e.status || (e.response && e.response.status));
  const text = `${(e && e.message) || ""} ${(e && e.response && e.response.data && e.response.data.error) || ""}`;
  return status === 429 || /rate limit|too many requests/i.test(text);
};
async function withRetry(fn: () => Promise<any>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= RETRIES || !isRateLimit(e)) throw e;
      await sleep(RETRY_BASE_MS * 2 ** attempt + randInt(Math.max(1, RETRY_BASE_MS)));
    }
  }
}
const wrapEntities = (entities) => {
  const cache = new Map();
  return new Proxy({}, {
    get(_, name) {
      if (typeof name !== "string") return undefined;
      if (!cache.has(name)) {
        const E = entities[name];
        cache.set(name, new Proxy({}, {
          get(__, method) {
            const f = E[method];
            return typeof f === "function" ? (...args) => withRetry(() => f.apply(E, args)) : f;
          }
        }));
      }
      return cache.get(name);
    }
  });
};
export function resilient(b) {
  let service = null;
  return new Proxy(b, {
    get(target, key) {
      if (key === "asServiceRole") {
        if (!service) {
          const real = target.asServiceRole;
          const entities = wrapEntities(real.entities);
          service = new Proxy(real, {
            get(t, k) {
              if (k === "entities") return entities;
              const v = Reflect.get(t, k, t);
              return typeof v === "function" ? v.bind(t) : v;
            }
          });
        }
        return service;
      }
      const v = Reflect.get(target, key, target);
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
}

// ---------- Clearing a saved date ----------
// Saving "no date" as null is not reliable on every store: a field set to null can be
// left holding its old value. So an empty date is written as the year-1970 date and
// read back as null. Wrap an entity with this and the rest of the code can keep using null.
const NO_DATE = new Date(0).toISOString();
export function nullSafe(E, dateFields: string[]) {
  const out = (row) => {
    if (!row || typeof row !== "object") return row;
    const r = { ...row };
    for (const f of dateFields) if (r[f] && !(Date.parse(r[f]) > 0)) r[f] = null;
    return r;
  };
  const inn = (d) => {
    const r = { ...d };
    for (const f of dateFields) if (f in r && !r[f]) r[f] = NO_DATE;
    return r;
  };
  return {
    get: async (id) => out(await E.get(id)),
    filter: async (q, o) => { const res = await E.filter(q, o); return { ...res, items: (res.items || []).map(out) }; },
    create: async (d) => out(await E.create(inn(d))),
    update: async (id, d) => out(await E.update(id, inn(d))),
    delete: (id) => E.delete(id)
  };
}

// ---------- Record locks ----------
// A real mutex (Lamport's bakery algorithm) on top of the Lock entity. It needs
// nothing atomic from the platform, only that a row we wrote can be read back.
//   1. Add a row for the record, marked "choosing".
//   2. Read every row for that record and take a ticket number one higher than the
//      highest. Clear "choosing".
//   3. Wait until no other row is still choosing and none holds a lower ticket.
//      Then the record is ours; delete the row when done.
// Requests are served first come, first served, and two can never hold the same
// record at once. (The old version wrote a token onto the record and re-read it
// 35 ms later; two requests arriving together could both pass, which allowed the
// same refund or cash-out to be paid twice.)
const LOCK_WAIT_MS = 20000;

export async function withMemberLock(b, memberId: string, fn: () => Promise<any>, ttlMs = 15000) {
  return withRecordLock(b, "Member", memberId, fn, ttlMs);
}

// ttlMs: the longest the work inside may take. If the holder crashes, the lock is
// ignored after that. Give long jobs (settling a full table) a long ttl.
export async function withRecordLock(b, entity: string, id: string, fn: () => Promise<any>, ttlMs = 15000) {
  if (!id) throw new UserError("Not found.", 404);
  const L = b.asServiceRole.entities.Lock;
  const key = `${entity}:${id}`;
  const started = Date.now();
  const live = (r) => r.expires_at && Date.parse(r.expires_at) > Date.now();
  const others = async (myId: string) => {
    const rows = (await L.filter({ key }, { limit: 200 })).items || [];
    for (const r of rows) if (r.id !== myId && !live(r)) L.delete(r.id).catch(() => {}); // crashed holders
    return rows.filter((r) => r.id !== myId && live(r));
  };

  const mine = await L.create({ key, choosing: true, number: 0, expires_at: new Date(started + LOCK_WAIT_MS + ttlMs).toISOString() });
  let entered = false;
  try {
    const seen = await others(mine.id);
    const number = 1 + seen.reduce((m, r) => Math.max(m, Number(r.number) || 0), 0);
    await L.update(mine.id, { number, choosing: false });
    const ahead = (r) => r.choosing || (Number(r.number) || 0) < number || ((Number(r.number) || 0) === number && String(r.id) < String(mine.id));
    // Waiting politely matters: checking many times a second is itself what trips the
    // platform's request limit. Start quick and ease off to about 3 checks a second.
    let pause = 70;
    while (true) {
      const rows = await others(mine.id);
      if (!rows.some(ahead)) break;
      if (Date.now() - started > LOCK_WAIT_MS) throw new UserError("Your last action is still finishing. Try again in a moment.", 409);
      await sleep(pause + randInt(60));
      pause = Math.min(300, Math.round(pause * 1.4));
    }
    entered = true;
    return await fn();
  } finally {
    // A lock that isn't removed blocks everyone else on this record until it expires,
    // so make sure it really goes.
    await L.delete(mine.id).catch(async () => { await sleep(400); await L.delete(mine.id).catch(() => {}); });
  }
}

// ---------- Points ----------

// The single helper that mutates points. amount may be negative.
// Call it inside withMemberLock when the amount depends on a balance you just read.
export async function changePoints(b, memberId, amount, source, reason, byMemberId) {
  const member = await b.asServiceRole.entities.Member.get(memberId);
  const newBalance = (member.points || 0) + amount;
  if (newBalance < 0) throw new UserError("Not enough points.");
  const updated = await b.asServiceRole.entities.Member.update(memberId, { points: newBalance });
  await b.asServiceRole.entities.PointLog.create({
    member_id: memberId,
    discord_id: member.discord_id,
    amount,
    balance_after: newBalance,
    source,
    reason: reason || "",
    by_member_id: byMemberId || null
  });
  return { member: updated, balance: newBalance };
}

// Officer award cap: total positive awards by this officer in the last 24 hours.
export async function awardedLast24h(b, officerMemberId) {
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { items } = await b.asServiceRole.entities.PointLog.filter(
    { by_member_id: officerMemberId, source: "award", amount: { $gt: 0 }, created_date: { $gte: start } },
    { limit: 1000 }
  );
  return items.reduce((s, l) => s + l.amount, 0);
}

// ---------- Games ----------
// Every resolver returns { won, payout, outcome }. payout is the total returned
// (0 on a loss), so the net change is payout - wager.

// Payouts always round DOWN to a whole point. Rounding to nearest let a player pick
// wagers whose payout rounded up, which beat the house edge on some dice bets.
export function payoutOf(multiplier: number, wager: number) {
  return Math.floor(multiplier * wager + 1e-9);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Yin Yang Toss (stored as coinflip). Choice: "heads" = Yang, "tails" = Yin.
export function coinMultiplier(edge: number) {
  return round2(2 * (1 - edge));
}
export function resolveCoinFlip(wager, choice, edge) {
  const side = randInt(2) === 0 ? "heads" : "tails";
  const won = side === choice;
  const multiplier = coinMultiplier(edge);
  const payout = won ? payoutOf(multiplier, wager) : 0;
  return { won, payout, outcome: { side, choice, multiplier } };
}

// Dragon Dice: roll 1-100. Under wins on roll < target, over wins on roll > target.
export function diceChance(target, direction) {
  return direction === "under" ? target - 1 : 100 - target;
}
export function diceMultiplier(chance, edge) {
  return round2((100 * (1 - edge)) / chance);
}
export function resolveDragonDice(wager, target, direction, edge) {
  const roll = randInt(100) + 1;
  const won = direction === "under" ? roll < target : roll > target;
  const chance = diceChance(target, direction);
  const multiplier = diceMultiplier(chance, edge);
  const payout = won ? payoutOf(multiplier, wager) : 0;
  return { won, payout, outcome: { roll, target, direction, chance, multiplier } };
}

// Lantern Slots: weighted outcome table. The losing weight is derived from the
// house edge so the long-run return is exactly (1 - edge).
export const SLOT_SYMBOLS = ["seal", "dragon", "lantern", "maple", "ingot"];
const SLOT_WINS = [
  { tier: "3seal", weight: 1, mult: 50 },
  { tier: "3dragon", weight: 3, mult: 20 },
  { tier: "3lantern", weight: 8, mult: 10 },
  { tier: "3maple", weight: 20, mult: 5 },
  { tier: "3ingot", weight: 40, mult: 3 },
  { tier: "pair", weight: 150, mult: 2 }
];

export function slotTable(edge: number) {
  const winWeight = SLOT_WINS.reduce((s, t) => s + t.weight, 0);
  const ev = SLOT_WINS.reduce((s, t) => s + t.weight * t.mult, 0);
  const total = Math.max(winWeight + 1, Math.round(ev / (1 - edge)));
  return [...SLOT_WINS, { tier: "lose", weight: total - winWeight, mult: 0 }];
}

export function resolveLanternSlots(wager, edge) {
  const table = slotTable(edge);
  const total = table.reduce((s, t) => s + t.weight, 0);
  let r = randInt(total);
  let chosen = table[table.length - 1];
  for (const t of table) {
    r -= t.weight;
    if (r < 0) { chosen = t; break; }
  }
  const pick = () => SLOT_SYMBOLS[randInt(SLOT_SYMBOLS.length)];
  let reels;
  if (chosen.tier === "pair") {
    const s = pick();
    let other = pick();
    while (other === s) other = pick();
    reels = [s, s, other];
    const gap = randInt(3); // put the odd symbol on a random reel
    [reels[gap], reels[2]] = [reels[2], reels[gap]];
  } else if (chosen.tier === "lose") {
    const shuffled = [...SLOT_SYMBOLS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    reels = shuffled.slice(0, 3);
  } else {
    const sym = chosen.tier.slice(1);
    reels = [sym, sym, sym];
  }
  const payout = payoutOf(chosen.mult, wager);
  return { won: payout > 0, payout, outcome: { reels, tier: chosen.tier, multiplier: chosen.mult } };
}

// Twelve Skies Wheel: 12 segments. Bet on a faction (or the dragon).
// Payout is (1 - edge) x 12 / segments of that kind.
export const WHEEL_SEGMENTS = [
  "guanyin", "fujin", "jinong", "guanyin", "fujin", "jinong",
  "guanyin", "fujin", "jinong", "guanyin", "fujin", "dragon"
];
export function wheelMultiplier(pick, edge) {
  const count = WHEEL_SEGMENTS.filter((s) => s === pick).length;
  return count ? round2((1 - edge) * (WHEEL_SEGMENTS.length / count)) : 0;
}
export function resolveSkyWheel(wager, pick, edge) {
  const index = randInt(WHEEL_SEGMENTS.length);
  const landed = WHEEL_SEGMENTS[index];
  const won = landed === pick;
  const multiplier = wheelMultiplier(pick, edge);
  const payout = won ? payoutOf(multiplier, wager) : 0;
  return { won, payout, outcome: { index, landed, pick, multiplier } };
}
// Jade Roulette (guild rules): a wheel of 25 pockets.
//   12 red, 12 black, 1 green. One of the reds carries the Dragon and one of the blacks
//   carries the Tiger.
//   Red or Black returns 2x, Green 14x, Dragon 7x, Tiger 7x (the stake included).
//   The Dragon pocket is still red and the Tiger pocket is still black, so colour bets win on them too.
// Long-run return: Red and Black 24/25 (96%); Green 14/25 (56%); Dragon and Tiger 7/25 (28%).
// Green, the Dragon and the Tiger are single pockets, paid at the guild's chosen 14x and 7x.
export const ROULETTE_POCKETS = [
  "green", "red", "black", "red", "black", "red", "black", "dragon",
  "black", "red", "black", "red", "black", "red", "black", "red",
  "black", "red", "tiger", "red", "black", "red", "black", "red",
  "black"
];
export const ROULETTE_RETURNS = { red: 2, black: 2, green: 14, dragon: 7, tiger: 7 };
export const ROULETTE_SPOTS = Object.keys(ROULETTE_RETURNS);
export const pocketColor = (kind: string) => (kind === "dragon" ? "red" : kind === "tiger" ? "black" : kind);
export function validRouletteBet(bet) {
  return !!bet && ROULETTE_SPOTS.includes(bet.type);
}
// Does a chip on `spot` win when the ball lands in a pocket of this kind?
export function rouletteWins(spot: string, kind: string) {
  return spot === kind || spot === pocketColor(kind);
}
// What a set of chips returns for a pocket. Chips from the old table layout are handed back.
export function roulettePayout(bets, kind: string) {
  let payout = 0;
  for (const x of bets || []) {
    if (!ROULETTE_SPOTS.includes(x.type)) payout += x.amount;
    else if (rouletteWins(x.type, kind)) payout += x.amount * ROULETTE_RETURNS[x.type];
  }
  return payout;
}