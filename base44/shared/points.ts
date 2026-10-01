// Shared points + game logic for BLACKLIST INTROBOYS.
// Every points change goes through changePoints so balances never go below 0
// and a PointLog row is written together with the balance update.

export function randInt(maxExclusive) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function getSettings(b) {
  const { items } = await b.asServiceRole.entities.Settings.filter({}, { limit: 1 });
  if (items.length === 0) {
    return await b.asServiceRole.entities.Settings.create({
      guild_id: "",
      officer_role_id: "",
      min_bet: 10,
      max_bet: 5000,
      daily_bet_cap: 50000,
      house_edge_pct: 3,
      daily_wheel_prizes: [50, 100, 150, 250, 500, 1000],
      award_cap_per_day: 10000,
      games_enabled: ["coinflip", "dragondice", "lanternslots"]
    });
  }
  return items[0];
}

export async function getMemberByUserId(b, userId) {
  const { items } = await b.asServiceRole.entities.Member.filter({ user_id: userId }, { limit: 1 });
  return items[0] || null;
}

export async function getMemberByDiscordId(b, discordId) {
  const { items } = await b.asServiceRole.entities.Member.filter({ discord_id: String(discordId) }, { limit: 1 });
  return items[0] || null;
}

// The single helper that mutates points. amount may be negative.
export async function changePoints(b, memberId, amount, source, reason, byMemberId) {
  const member = await b.asServiceRole.entities.Member.get(memberId);
  const newBalance = (member.points || 0) + amount;
  if (newBalance < 0) throw new Error("Not enough points");
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

// ---------- Games ----------

export function resolveCoinFlip(wager, choice, houseEdgePct) {
  const side = randInt(2) === 0 ? "heads" : "tails";
  const won = side === choice;
  const payout = won ? Math.round(2 * (1 - houseEdgePct / 100) * wager) : 0;
  return { won, payout, outcome: { side, choice } };
}

export function resolveDragonDice(wager, target, direction, houseEdgePct) {
  const roll = randInt(100) + 1;
  const win = direction === "under" ? roll < target : roll > target;
  const chance = direction === "under" ? target - 1 : 100 - target;
  const multiplier = (100 - houseEdgePct) / chance;
  const payout = win ? Math.round(multiplier * wager) : 0;
  return { won: win, payout, outcome: { roll, target, direction, chance, multiplier: Number(multiplier.toFixed(3)) } };
}

const SLOT_SYMBOLS = ["crest", "lantern", "dragon", "maple", "coin"];
// Weights tuned so total return = (100 - house_edge)% with house_edge 3 => 0.97.
const SLOT_TABLE = [
  { tier: "3crest", weight: 1, mult: 25 },
  { tier: "3lantern", weight: 2, mult: 20 },
  { tier: "3dragon", weight: 4, mult: 15 },
  { tier: "3maple", weight: 8, mult: 10 },
  { tier: "3coin", weight: 15, mult: 5 },
  { tier: "pair", weight: 230, mult: 3 },
  { tier: "lose", weight: 740, mult: 0 }
];
const SLOT_TOTAL_WEIGHT = SLOT_TABLE.reduce((s, t) => s + t.weight, 0);

export function resolveLanternSlots(wager, houseEdgePct) {
  let r = randInt(SLOT_TOTAL_WEIGHT);
  let chosen = SLOT_TABLE[SLOT_TABLE.length - 1];
  for (const t of SLOT_TABLE) {
    r -= t.weight;
    if (r < 0) { chosen = t; break; }
  }
  let reels;
  if (chosen.tier === "pair") {
    const s = SLOT_SYMBOLS[randInt(5)];
    let other = SLOT_SYMBOLS[randInt(5)];
    while (other === s) other = SLOT_SYMBOLS[randInt(5)];
    reels = [s, s, other];
    if (randInt(2) === 0) { const tmp = reels[0]; reels[0] = reels[2]; reels[2] = tmp; }
  } else if (chosen.tier === "lose") {
    const a = randInt(5);
    let b = (a + 1 + randInt(4)) % 5;
    let c = (b + 1 + randInt(4)) % 5;
    if (c === a || c === b) c = (c + 1) % 5;
    reels = [SLOT_SYMBOLS[a], SLOT_SYMBOLS[b], SLOT_SYMBOLS[c]];
  } else {
    const sym = chosen.tier.replace("3", "");
    reels = [sym, sym, sym];
  }
  const payout = Math.round(chosen.mult * wager);
  return { won: payout > 0, payout, outcome: { reels, tier: chosen.tier, multiplier: chosen.mult } };
}

export const SLOT_PAYOUT_TABLE = [
  { combo: "Crest × Crest × Crest", multiplier: 25 },
  { combo: "Lantern × Lantern × Lantern", multiplier: 20 },
  { combo: "Dragon × Dragon × Dragon", multiplier: 15 },
  { combo: "Maple × Maple × Maple", multiplier: 10 },
  { combo: "Coin × Coin × Coin", multiplier: 5 },
  { combo: "Any matching pair", multiplier: 3 },
  { combo: "No match", multiplier: 0 }
];