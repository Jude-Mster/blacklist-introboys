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

export const ALL_GAMES = ["coinflip", "dragondice", "lanternslots", "skywheel", "roulette", "poker"];

export async function getSettings(b) {
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

export async function getMemberByUserId(b, userId) {
  const { items } = await b.asServiceRole.entities.Member.filter({ user_id: userId }, { limit: 1 });
  return items[0] || null;
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

// ---------- Record locks ----------
// Base44 entities have no compare-and-set, so this is a best-effort mutex:
// claim the lock, wait a beat, re-read, and only proceed if our token is still there.
export async function withMemberLock(b, memberId: string, fn: () => Promise<any>) {
  return withRecordLock(b, "Member", memberId, fn);
}

// Same lock on any entity that has lock_token + lock_until fields.
export async function withRecordLock(b, entity: string, id: string, fn: () => Promise<any>) {
  const E = b.asServiceRole.entities[entity];
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 25; attempt++) {
    const m = await E.get(id);
    const lockFree = !m.lock_token || !m.lock_until || Date.parse(m.lock_until) < Date.now();
    if (lockFree) {
      await E.update(id, {
        lock_token: token,
        lock_until: new Date(Date.now() + 8000).toISOString()
      });
      await sleep(35);
      const check = await E.get(id);
      if (check.lock_token === token) {
        try {
          return await fn();
        } finally {
          await E.update(id, { lock_token: "", lock_until: new Date(0).toISOString() });
        }
      }
    }
    await sleep(60 + randInt(90));
  }
  throw new UserError("Your last action is still finishing. Try again in a moment.", 409);
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
  const payout = won ? Math.round(multiplier * wager) : 0;
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
  const payout = won ? Math.round(multiplier * wager) : 0;
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
  const payout = Math.round(chosen.mult * wager);
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
  const payout = won ? Math.round(multiplier * wager) : 0;
  return { won, payout, outcome: { index, landed, pick, multiplier } };
}
// European roulette: single zero. Bets is a list of { type, value, amount }.
// Pays the true-odds minus the zero, so the edge is 1/37 (about 2.7%).
export const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_PAYS = { straight: 35, color: 1, parity: 1, half: 1, dozen: 2, column: 2 };

export function validRouletteBet(bet) {
  if (!bet || !(bet.type in ROULETTE_PAYS)) return false;
  const v = bet.value;
  switch (bet.type) {
    case "straight": return Number.isInteger(v) && v >= 0 && v <= 36;
    case "color": return v === "red" || v === "black";
    case "parity": return v === "odd" || v === "even";
    case "half": return v === "low" || v === "high";
    case "dozen":
    case "column": return v === 1 || v === 2 || v === 3;
  }
  return false;
}

export function rouletteWins(bet, n) {
  if (bet.type === "straight") return bet.value === n;
  if (n === 0) return false;
  switch (bet.type) {
    case "color": return (bet.value === "red") === ROULETTE_RED.has(n);
    case "parity": return (bet.value === "even") === (n % 2 === 0);
    case "half": return (bet.value === "low") === (n <= 18);
    case "dozen": return Math.ceil(n / 12) === bet.value;
    case "column": return ((n - 1) % 3) + 1 === bet.value;
  }
  return false;
}

export function resolveRoulette(bets) {
  const number = randInt(37);
  let payout = 0;
  const hits = [];
  for (const bet of bets) {
    if (rouletteWins(bet, number)) {
      const back = bet.amount * (ROULETTE_PAYS[bet.type] + 1);
      payout += back;
      hits.push({ ...bet, back });
    }
  }
  return {
    won: payout > 0,
    payout,
    outcome: { number, index: ROULETTE_ORDER.indexOf(number), color: number === 0 ? "green" : ROULETTE_RED.has(number) ? "red" : "black", bets, hits }
  };
}