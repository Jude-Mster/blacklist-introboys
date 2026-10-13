// @ts-nocheck  (plain JavaScript; the page imports this same file)
// Blacklist Arena: the fight engine, shared by the server and the page.
//
// The server decides every fight: it picks a secret seed, runs the fight once with it and settles
// the bets on what happened. After betting closes it sends the seed to the screens, and each screen
// runs the very same fight again here, frame by frame, to play it. The fight uses nothing but plain
// arithmetic on numbers and its own seeded dice, so the server and every browser get the identical
// fight from the same seed.
//
// Plain JavaScript on purpose: the backend functions (Deno) and the page (Vite) both import this
// one file, so the rules can never drift apart. Change ENGINE_VERSION whenever a rule changes.

export const ENGINE_VERSION = 9;   // 9: 6.18 balance (stronger base, potions at 85%, crits 2x-8x, weapon 35%, mount pairs) · 8: priced from real fights, tighter caps, length line, Live Arena matchmaking (7: both attack at once)
export const ENGINE_VERSION_NOTES = 5;   // 2: tighter prices, no near-certain or long-shot side bets
                                   // 4: Speed sets the pace of every move, MP only spent by skills, the Draw always offered
                                   // 5: new upgrade values (see DEFAULT_VALUES), stronger weapon levels, pet and mount, Spirits Within +20% Speed

// ---------- dice ----------
export const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- the fighter sheet ----------
// Every fighter starts from the same base. Each entry after the first rolls one upgrade on top.
export const BASE = { hp: 50000, mp: 13153, atk: 17500, def: 9000, crit: 15, critdef: 0, acc: 100, eva: 10, pots: 7, potheal: 100, spd: 100 };
// w = how likely an entry is to roll this stat (6.18): Crit rate 1 in 15, Crit defense 1 in 9, the other seven
// share the rest (about 1 in 8.5 each). Potion heal is no longer an upgrade: every potion heals 100%.
export const UPGRADES = [
  { id: "hp", name: "HP", unit: "", w: 0.1175 },
  { id: "atk", name: "ATK", unit: "", w: 0.1175 },
  { id: "def", name: "DEF", unit: "", w: 0.1175 },
  { id: "crit", name: "Crit rate", unit: "%", w: 1 / 15 },
  { id: "critdef", name: "Crit defense", unit: "%", w: 1 / 9 },
  { id: "acc", name: "Accuracy", unit: "%", w: 0.1175 },
  { id: "eva", name: "Evasion", unit: "%", w: 0.1175 },
  { id: "pots", name: "HP potions", unit: "", w: 0.1175 },
  { id: "spd", name: "Speed", unit: "%", w: 0.1175 }
];
export const PER_STAT = 9, TOTAL_CAP = 50;
// What each upgrade gives. The Guild Leader can change these for a tournament (saved on it).
export const DEFAULT_VALUES = {
  ups: { hp: 8500, atk: 1150, def: 900, crit: 3.5, critdef: 3.5, acc: 10, eva: 5, pots: 2, spd: 10 },
  weapon: { atk: 0.15, crit: 5, chance: 0.35 }
};
// Keep only sane numbers; anything missing falls back to the default.
export function normValues(v) {
  const ups = {}, w = (v && v.weapon) || {};
  for (const u of UPGRADES) {
    const x = Number(v && v.ups && v.ups[u.id]);
    ups[u.id] = Number.isFinite(x) && x >= 0 && x <= 1000000 ? x : DEFAULT_VALUES.ups[u.id];
  }
  const num = (x, lo, hi, d) => (Number.isFinite(Number(x)) && Number(x) >= lo && Number(x) <= hi ? Number(x) : d);
  return { ups, weapon: { atk: num(w.atk, 0, 1, DEFAULT_VALUES.weapon.atk), crit: num(w.crit, 0, 20, DEFAULT_VALUES.weapon.crit), chance: num(w.chance, 0.01, 1, DEFAULT_VALUES.weapon.chance) } };
}

// ---------- prices in the tournament shop ----------
// The defaults; the Guild Leader sets a tournament's own prices when opening it (saved on it as costs).
export const COSTS = { entry: 500, skill: 1000, weaponTry: 500, pet: 1500, mountLevel: 1500, mountReset: 2500 };
export const COST_ITEMS = [
  { id: "entry", name: "Entry (each)" }, { id: "skill", name: "Add skill" }, { id: "weaponTry", name: "Weapon upgrade try" },
  { id: "pet", name: "Pet growth (each 25%)" }, { id: "mountLevel", name: "Mount level (each)" }, { id: "mountReset", name: "Mount stat reset" }
];
// Whole points from 1 to 1,000,000; anything else falls back to the default.
export function normCosts(c) {
  const out = {};
  for (const { id } of COST_ITEMS) { const x = Math.floor(Number(c && c[id])); out[id] = Number.isFinite(x) && x >= 1 && x <= 1000000 ? x : COSTS[id]; }
  return out;
}

// ---------- pet, mount, weapon ----------
// Iron Condor (Epic): 25% of growth per level, up to 200%. Each 25% gives HP +550, ATK +337.5, DEF +550
// (twice the game's own bonus since 6.7), so at 200%: HP +4,400, ATK +2,700, DEF +4,400.
export const PET = { name: "Iron Condor (Epic)", levels: 8, full: { hp: 4400, atk: 2700, def: 4400 } };
export const petGrowth = (lv) => lv * 25;
export const petBonus = (lv, id) => Math.round((PET.full[id] || 0) * lv / PET.levels);
// Mount: the first level draws one pair at random; every level after adds MOUNT.per % more to the same pair.
// HP, ATK and DEF grow by that % of the fighter's total; Crit rate, Dodge, Crit defense and Accuracy by that many points.
// 6.18: pair 2 is ATK + Accuracy (was ATK + HP) and pair 7 (ATK + Crit rate) is new. w = how likely the draw is:
// pairs 4 to 7 1 in 12 each, pairs 1 to 3 share the rest (2 in 9 each).
export const MOUNT = {
  levels: 10, per: 3,
  pairs: [["atk", "def"], ["atk", "acc"], ["def", "hp"], ["crit", "eva"], ["def", "eva"], ["critdef", "def"], ["atk", "crit"]],
  w: [2 / 9, 2 / 9, 2 / 9, 1 / 12, 1 / 12, 1 / 12, 1 / 12]
};
// Draw a mount pair by its weight; `not` = a pair to leave out (a reset never gives the same pair back).
export function drawPair(rnd, not = -1) {
  const ids = MOUNT.pairs.map((_, i) => i).filter((i) => i !== not);
  const total = ids.reduce((a, i) => a + MOUNT.w[i], 0);
  let x = rnd() * total;
  for (const i of ids) { x -= MOUNT.w[i]; if (x < 0) return i; }
  return ids[ids.length - 1];
}
export const STAT_NAME = { hp: "HP", atk: "ATK", def: "DEF", crit: "Crit rate", eva: "Dodge", critdef: "Crit defense", acc: "Accuracy" };
export const mountPct = (lv) => lv * MOUNT.per;
export const mountText = (m, lv = m.lv) => MOUNT.pairs[m.pair].map((id) => `${STAT_NAME[id]} +${mountPct(lv)}%`).join(" · ");
// Weapon: each try works the tournament's chance; each level adds ATK % and Crit rate, and an aura.
export const WEAPON = {
  max: 5,
  looks: [{ name: "Light blue", color: 0x8fd8ff }, { name: "Light purple", color: 0xc9a2ff }, { name: "Dark purple", color: 0x7a2fd0 }, { name: "Dark pink", color: 0xd8287c }, { name: "Red", color: 0xff1e1e }]
};

// ---------- characters ----------
// The 50 looks (dyed versions of Juts's character). The page knows what each looks like; the server
// only hands them out.
export const LOOK_KEYS = ["juts", "judy", "bronze", "ivory", "ember", "jade", "violet", "blood", ...Array.from({ length: 42 }, (_, i) => "m" + (i + 1))];

// ---------- the skills ----------
// Buff skills: bought with Add skill (random, never one the fighter has, up to 2). Every one that is off
// cooldown rolls its chance at the start of each of the fighter's rounds; all that come up are cast (0.6 s each) and their
// effects add up. Cast again while up, its uses add on, up to stackCap casts' worth.
//   attacks = the owner's own attacks; guards = the opponent's attacks (hits and misses); charges = hits
//   that land. cd = the owner's attacks after casting before it can be cast again. MP never stops a cast.
export const SKILLS = {
  shield: { name: "Heavenly Shield", chance: 0.35, cd: 3, charges: 2, cut: 0.5, mp: 1035.3, color: 0x5aa8ff, text: "halves the next 2 hits that land" },
  blow: { name: "Heavenly Blow", chance: 0.15, cd: 4, attacks: 2, crit: 20, mp: 1035.3, color: 0xff3030, text: "+20% Crit rate for 2 attacks, then 4 attacks to cool down" },
  spirits: { name: "Spirits Within", chance: 0.2, cd: 0, attacks: 3, atk: 0.15, spd: 0.20, mp: 108.75, color: 0xa8e4ff, text: "+15% ATK and +20% Speed for 3 attacks" },
  blood: { name: "Blood Lust", chance: 0.2, cd: 0, attacks: 3, atk: 0.25, mp: 415.14, color: 0xff5a1a, text: "+25% ATK for 3 attacks, and the blade catches fire" },
  garuda: { name: "Garuda's Prayer", chance: 0.15, cd: 0, guards: 3, eva: 25, mp: 1144.43, color: 0xc9a0ff, text: "+25% Evasion against the next 3 attacks" },
  nirvana: { name: "Nirvana Soul Blast", chance: 0.25, cd: 4, guards: 3, critdef: 20, mp: 1821.04, color: 0xb060ff, text: "+20% Crit defense against the next 3 attacks, then 4 attacks to cool down" },
  bullet: { name: "Extreme Bullet Proof", passive: true, chance: 0.1, reflect: 0.5, color: 0x40e070, text: "passive: 10% chance on every hit taken to send 50% of it back at the attacker" }
};
export const SKILL_IDS = Object.keys(SKILLS), MAX_SKILLS = 2, BUFF_CAST = 0.6;
export const BUFF_STACK = { stackCap: 2 };
const OWN_BUFFS = ["blow", "spirits", "blood"], GUARD_BUFFS = ["garuda", "nirvana"];
export const noBuffs = () => ({ shield: 0, blow: 0, spirits: 0, blood: 0, garuda: 0, nirvana: 0 });
export const usesOf = (id) => SKILLS[id].charges || SKILLS[id].attacks || SKILLS[id].guards;
// Crimson LightningCharger: every fighter's own buff skill, cast before each Skyfall. It charges the spear so the
// Skyfall hits for 1x to 2x. (It is not one of the bought buff skills and is not counted in the buff side bets.)
export const CHARGE = { name: "Crimson LightningCharger", mp: 145.5, upTo: 2, color: 0xff2a3a };

// ---------- timings (seconds) ----------
export const CAST = 1.0, SPIN = 0.8, RECOVER = 0.35, POTION = 0.6, GAP = 0.3, RANGE = 3.2, WALK = 3.4, DT = 0.05;
export const LIMIT = 180;   // a fight lasts at most 3 minutes
// Overtime (tournament matches only; the Live Arena calls a Draw instead): with no knockout at the time limit
// the fight goes on as sudden death. No potions, and every hit does OT.start times its damage, plus one
// more for every OT.every seconds of overtime. If nobody is down after OT.max seconds (practically never),
// the larger share of HP left wins, and an exact tie is settled by the fight's own coin toss.
export const OT = { max: 90, start: 2, every: 5 };
export const otMult = (sinceLimit) => OT.start + Math.floor(Math.max(0, sinceLimit) / OT.every);
const DMG_K = 0.46, CRIT_MIN = 2, CRIT_MAX = 8, POT_AT = 0.85;   // 6.18: crits 2x-8x (was 3x-7x), potions at 85% HP (was 70%)
// Speed is one stat: it sets the pace of the fighter's own moves, and so how often they attack. At 100% a buff
// cast, the charge, Skyfall and the recovery take their full time; faster fighters do them quicker (down to
// PACE_MIN of the time). Spirits Within adds its Speed the moment it is cast. MP only goes down when a skill
// is cast; it does not come back during the fight.
export const PACE_MIN = 0.55;
export const paceOf = (spd) => clamp(100 / Math.max(1, spd), PACE_MIN, 1);
const START = [4.0, 8.0];

// ---------- a fighter's numbers ----------
// f: { ups: {id: rolls}, pet: level, mount: { lv, pair }, weapon: level, skills: [] }
export function statsOf(f, values) {
  const V = values || DEFAULT_VALUES;
  const s = { ...BASE };
  for (const u of UPGRADES) s[u.id] += ((f.ups && f.ups[u.id]) || 0) * (V.ups[u.id] ?? DEFAULT_VALUES.ups[u.id]);
  if (f.pet) for (const id of ["hp", "atk", "def"]) s[id] += petBonus(f.pet, id);
  if (f.mount && MOUNT.pairs[f.mount.pair]) for (const id of MOUNT.pairs[f.mount.pair]) s[id] = ["hp", "atk", "def"].includes(id) ? Math.round(s[id] * (1 + mountPct(f.mount.lv) / 100)) : s[id] + mountPct(f.mount.lv);
  const wl = Math.min(WEAPON.max, f.weapon || 0);
  if (wl) { s.atk = Math.round(s.atk * (1 + V.weapon.atk * wl)); s.crit += V.weapon.crit * wl; }
  return s;
}
// One entry's upgrade roll: a stat at random (by weight) that isn't full yet. Returns the upgrade or null.
export function rollUpgrade(ups, rnd) {
  const total = Object.values(ups).reduce((a, b) => a + b, 0);
  if (total >= TOTAL_CAP) return null;
  const open = UPGRADES.filter((u) => (ups[u.id] || 0) < PER_STAT);
  let x = rnd() * open.reduce((a, o) => a + o.w, 0), u = open[open.length - 1];
  for (const o of open) if ((x -= o.w) < 0) { u = o; break; }
  ups[u.id] = (ups[u.id] || 0) + 1;
  return u;
}
// A random fighter for the Live Arena: 1 to 51 entries (up to the full 50 upgrades), weapon tries at the
// default success rate, 0 to 2 skills, sometimes a pet or a mount. near: an entry count to stay within 20% of.
export function randomBuild(rnd, near = 0) {
  const top = TOTAL_CAP + 1;
  let entries = 1 + Math.floor(Math.pow(rnd(), 1.3) * top);
  if (near > 0) { const lo = Math.max(1, Math.round(near * 0.8)), hi = Math.min(top, Math.round(near * 1.2)); entries = lo + Math.floor(rnd() * (hi - lo + 1)); }
  const ups = {};
  for (let k = 1; k < entries; k++) rollUpgrade(ups, rnd);
  let weapon = 0; const tries = Math.floor(rnd() * 20); for (let k = 0; k < tries && weapon < WEAPON.max; k++) if (rnd() < DEFAULT_VALUES.weapon.chance) weapon++;
  const ns = rnd() < 0.4 ? 0 : rnd() < 0.58 ? 1 : 2, pool = SKILL_IDS.slice(), skills = [];
  for (let j = 0; j < ns; j++) skills.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const pet = rnd() < 0.3 ? 1 + Math.floor(rnd() * PET.levels) : 0;
  const mount = rnd() < 0.35 ? { lv: 1 + Math.floor(rnd() * MOUNT.levels), pair: drawPair(rnd) } : null;
  return { entries, ups, weapon, skills, pet, mount };
}

const hitChance = (acc, eva) => clamp(acc - eva, 25, 97) / 100;          // base 100 − 10 = 90% (6.18)
const critChance = (crit, critdef) => clamp(crit - critdef, 1, 60) / 100; // base 15%, at most 60%
const effAtk = (m) => m.s.atk * (1 + (m.buf.spirits > 0 ? SKILLS.spirits.atk : 0) + (m.buf.blood > 0 ? SKILLS.blood.atk : 0));
const effSpd = (m) => m.s.spd * (m.buf.spirits > 0 ? 1 + SKILLS.spirits.spd : 1);
// the Speed a fighter has right now (with Spirits Within up or not), as a whole %
export const speedNow = (spd, spiritsUp) => Math.round(spd * (spiritsUp ? 1 + SKILLS.spirits.spd : 1));
const effCrit = (m) => m.s.crit + (m.buf.blow > 0 ? SKILLS.blow.crit : 0);
const effEva = (m) => m.s.eva + (m.buf.garuda > 0 ? SKILLS.garuda.eva : 0);
const effCritdef = (m) => m.s.critdef + (m.buf.nirvana > 0 ? SKILLS.nirvana.critdef : 0);

function castBuffs(me, r) {
  const cast = [];
  for (const id of me.sk) {
    const k = SKILLS[id], each = usesOf(id);
    if (k.passive || me.cd[id] > 0 || me.buf[id] >= each * BUFF_STACK.stackCap) continue;
    if (r() < k.chance) { me.mp = Math.max(0, me.mp - k.mp); me.buf[id] = Math.min(each * BUFF_STACK.stackCap, me.buf[id] + each); me.cd[id] = k.cd; cast.push(id); }
  }
  return cast;
}
// One Skyfall. The same dice, in the same order, for the watched fight and the practice fights.
function strike(me, foe, r) {
  me.stepSpd = effSpd(me);
  const used = { blow: me.buf.blow > 0, spirits: me.buf.spirits > 0, blood: me.buf.blood > 0, garuda: foe.buf.garuda > 0, nirvana: foe.buf.nirvana > 0 };
  const res = landStrike(me, foe, r, used);
  for (const id of OWN_BUFFS) if (me.buf[id] > 0) me.buf[id]--;
  for (const id of GUARD_BUFFS) if (foe.buf[id] > 0) foe.buf[id]--;
  for (const id in me.cd) if (me.cd[id] > 0) me.cd[id]--;
  return res;
}
function landStrike(me, foe, r, used) {
  if (r() > hitChance(me.s.acc, effEva(foe))) return { miss: true, dodge: used.garuda, used };
  const power = 1 + r() * (CHARGE.upTo - 1);
  const atk = effAtk(me);
  let dmg = Math.max(atk * 0.2, atk - foe.s.def * 0.5) * DMG_K * power;
  const crit = r() < critChance(effCrit(me), effCritdef(foe));
  const mult = crit ? CRIT_MIN + Math.floor(r() * (CRIT_MAX - CRIT_MIN + 1)) : 1;
  dmg = Math.max(1, Math.round(dmg * mult * (me.ot || 1)));
  let shielded = 0;
  if (foe.buf.shield > 0) { shielded = dmg; dmg = Math.max(1, Math.round(dmg * SKILLS.shield.cut)); foe.buf.shield--; }
  const before = foe.hp;
  foe.hp = Math.max(0, foe.hp - dmg);
  const dead = foe.hp <= 0;
  let reflect = 0, reflectKo = false;
  if (!dead && foe.sk.includes("bullet") && r() < SKILLS.bullet.chance) {
    reflect = Math.max(1, Math.round(dmg * SKILLS.bullet.reflect)); me.hp = Math.max(0, me.hp - reflect); reflectKo = me.hp <= 0;
  }
  return {
    dmg, shielded, crit, mult, power: Math.round(power * 100) / 100, used, reflect, reflectKo, dead,
    oneHit: dead && before >= foe.s.hp * 0.95,
    drink: !dead && !foe.ot && foe.hp <= foe.s.hp * POT_AT && foe.pots > 0,
    drinkMe: reflect > 0 && !reflectKo && !me.ot && me.hp <= me.s.hp * POT_AT && me.pots > 0
  };
}
const drinkPot = (d) => { const heal = Math.min(d.s.hp - d.hp, Math.round(d.s.hp * d.s.potheal / 100)); d.hp += heal; d.pots--; return heal; };
const mkSide = (f, x, dir, values) => { const s = statsOf(f, values); return { f, s, x, dir, hp: s.hp, mp: s.mp, pots: s.pots, charged: false, dead: false, ot: 0, sk: (f.skills || []).filter((id) => SKILLS[id]).slice(0, MAX_SKILLS), buf: noBuffs(), cd: noBuffs(), stepSpd: s.spd }; };
const round2 = (n) => Math.round(n * 100) / 100;

// One fight, frame by frame. Both fighters attack at the same time, each on their own clock: every
// fighter runs its own round of buff casts, Crimson LightningCharger, Skyfall and recovery, and never
// waits for the other. Speed sets how fast each round goes (pace = 100 / Speed, down to PACE_MIN), so a
// faster fighter simply attacks more often. A hit that leaves the target low makes them drink an HP potion
// at the start of their own next round. When both blows land in the same instant, the fight's coin toss
// decides whose lands first.
//   opts.draws   true (Live Arena): no knockout by the time limit is a Draw (winner -1).
//                false (tournament): at the time limit the fight goes to overtime (see OT).
//   opts.ot      false: stop at the limit with no overtime (only for the short still poses on the page).
//   opts.frames  false on the server, which only needs the events.
//   opts.values  what each upgrade gives (a tournament's own values).
export function simulate(fa, fb, seed, opts = {}) {
  const limit = opts.limit || LIMIT, keepFrames = opts.frames !== false, end = opts.draws || opts.ot === false ? limit : limit + OT.max;
  const r = mulberry32(seed >>> 0);
  const F = [mkSide(fa, START[0], 1, opts.values), mkSide(fb, START[1], -1, opts.values)];
  const frames = [], events = [];
  const toss = r() < 0.5 ? 0 : 1, order = [toss, 1 - toss];
  // each fighter's own round: phase, time left in it, buffs still to cast, its pace, a potion waiting
  const A = [0, 1].map(() => ({ phase: "gap", left: GAP, casting: [], pace: 1, drink: false }));
  let t = 0, winner = -1, how = "", walking = true, done = false;
  const ev = (who, type, extra) => events.push({ t: round2(t), who, type, ...extra });
  const ko = (loser, extra) => { F[loser].dead = true; winner = 1 - loser; how = "ko"; done = true; ev(loser, "ko", extra); };
  // the start of a fighter's round: a waiting potion first, then the buff rolls
  const begin = (i) => {
    const me = F[i], a = A[i];
    if (a.drink && !me.ot && me.pots > 0) { a.drink = false; const heal = drinkPot(me); ev(i, "potion", { heal, left: me.pots }); a.phase = "potion"; a.left = POTION; return; }
    a.drink = false;
    a.casting = castBuffs(me, r).map((id) => ({ id, stacked: me.buf[id] > usesOf(id) }));
    next(i);
  };
  // the next buff to cast, or the charge
  const next = (i) => {
    const me = F[i], a = A[i];
    a.pace = paceOf(effSpd(me));   // a Spirits Within cast just now already counts
    if (a.casting.length) { const c = a.casting.shift(); a.phase = "buff"; a.left = BUFF_CAST * a.pace; ev(i, "buff", { skill: c.id, stacked: c.stacked, k: a.pace }); }
    else { me.mp = Math.max(0, me.mp - CHARGE.mp); a.phase = "cast"; a.left = CAST * a.pace; ev(i, "cast", { k: a.pace }); }
  };
  const blow = (i) => {
    const me = F[i], foe = F[1 - i], a = A[i];
    me.charged = false; a.phase = "recover"; a.left = RECOVER * a.pace;
    const s = strike(me, foe, r), u = s.used;
    if (s.miss) { ev(i, "miss", { dodge: u.garuda, k: a.pace }); return; }
    foe.x = clamp(foe.x - foe.dir * (s.crit ? 0.9 : 0.35), 0.8, 11.2);
    ev(i, "hit", { k: a.pace, ot: me.ot, dmg: s.dmg, shielded: s.shielded, crit: s.crit, mult: s.mult, power: s.power, oneHit: s.oneHit, reflect: s.reflect, reflectKo: s.reflectKo, blow: u.blow, spirits: u.spirits, blood: u.blood, nirvana: u.nirvana });
    if (s.dead) ko(1 - i, { crit: s.crit, oneHit: s.oneHit });
    else if (s.reflectKo) ko(i, { crit: false, oneHit: false, reflect: true });
    else { if (s.drink) A[1 - i].drink = true; if (s.drinkMe) a.drink = true; }
  };
  while (t < end - 1e-9 && !done) {
    if (t >= limit - 1e-9) {   // overtime (never in the Live Arena: its loop ends at the limit)
      const m = otMult(t - limit);
      if (!F[0].ot) ev(-1, "overtime", { mult: m });
      else if (m !== F[0].ot) ev(-1, "otup", { mult: m });
      F[0].ot = F[1].ot = m;
      A[0].drink = A[1].drink = false;   // no potions in overtime
    }
    if (walking) {
      const gap = Math.abs(F[1].x - F[0].x);
      if (gap > RANGE + 1e-6) { const step = Math.min(WALK * DT, (gap - RANGE) / 2); F[0].x += step; F[1].x -= step; }
      else walking = false;
    } else {
      for (const i of order) {
        if (done) break;
        const me = F[i], a = A[i], gap = Math.abs(F[1].x - F[0].x);
        // knocked back: step in again before the next round
        if (a.phase === "gap" && gap > RANGE + 1e-6) { me.x += me.dir * Math.min(WALK * DT, gap - RANGE); continue; }
        if ((a.left -= DT) > 1e-9) continue;
        if (a.phase === "gap") begin(i);
        else if (a.phase === "potion" || a.phase === "buff") next(i);
        else if (a.phase === "cast") { me.charged = true; a.phase = "spin"; a.left = SPIN * a.pace; ev(i, "spin", { k: a.pace }); }
        else if (a.phase === "spin") blow(i);
        else if (a.phase === "recover") { a.phase = "gap"; a.left = GAP; }
      }
    }
    if (keepFrames) frames.push({ t: round2(t), x: [F[0].x, F[1].x], hp: [F[0].hp, F[1].hp], mp: [F[0].mp, F[1].mp], pots: [F[0].pots, F[1].pots], charged: [F[0].charged, F[1].charged], spd: [effSpd(F[0]), effSpd(F[1])], sk: [{ ...F[0].buf }, { ...F[1].buf }], cd: [{ ...F[0].cd }, { ...F[1].cd }], ot: F[0].ot, buff: F.map((m) => (m.charged ? { lightning: 1 } : {})) });
    t += DT;
  }
  if (!done) {
    if (opts.draws) { winner = -1; how = "draw"; ev(-1, "draw", {}); }
    else { const pa = F[0].hp / F[0].s.hp, pb = F[1].hp / F[1].s.hp; winner = pa > pb ? 0 : pb > pa ? 1 : toss; how = "time"; ev(winner, "time", {}); }
  }
  if (keepFrames && frames.length) frames.push({ ...frames[frames.length - 1], t: round2(t) });
  return { frames, events, winner, how, length: round2(t), maxhp: [F[0].s.hp, F[1].s.hp], maxmp: [F[0].s.mp, F[1].s.mp], maxpots: [F[0].s.pots, F[1].s.pots], skills: [F[0].sk, F[1].sk], stats: [F[0].s, F[1].s] };
}

// What a finished fight means for the bets.
export function outcomeOf(fight) {
  const ev = fight.events, ko = ev.find((e) => e.type === "ko");
  return {
    winner: fight.winner, draw: fight.winner === -1, how: fight.how, length: fight.length,
    ot: ev.some((e) => e.type === "overtime"),
    critko: !!(ko && ko.crit),
    oneHitBy: [0, 1].map((i) => ev.some((e) => e.type === "hit" && e.oneHit && e.who === i)),
    pots: ev.filter((e) => e.type === "potion").length,
    crits: ev.filter((e) => e.type === "hit" && e.crit).length,
    buffs: ev.filter((e) => e.type === "buff").length
  };
}

// The same fight without the walking, about 100 times faster: used for the practice fights that set
// the prices. Each fighter keeps its own clock, as in simulate(); whichever has the next move goes.
// (The time it keeps is close to the real fight's, not exact.)
const STEP_IN = 0.15;   // about what stepping back in after a knock-back takes
export function quickFight(fa, fb, seed, opts = {}) {
  const limit = opts.limit || LIMIT, end = opts.draws || opts.ot === false ? limit : limit + OT.max;
  const r = mulberry32(seed >>> 0);
  const F = [mkSide(fa, 0, 1, opts.values), mkSide(fb, 0, -1, opts.values)];
  const toss = r() < 0.5 ? 0 : 1, oneHitBy = [false, false];
  const W = 0.6 + GAP;   // walking in, then the first pause
  const C = [{ at: W, strike: false, pace: 1, drink: false }, { at: W, strike: false, pace: 1, drink: false }];
  let pots = 0, crits = 0, buffs = 0, ot = false, t = W;
  while (true) {
    const i = C[0].at < C[1].at - 1e-9 ? 0 : C[1].at < C[0].at - 1e-9 ? 1 : toss;
    const me = F[i], foe = F[1 - i], c = C[i];
    t = c.at;
    if (t >= end) break;
    if (t >= limit) { ot = true; F[0].ot = F[1].ot = otMult(t - limit); C[0].drink = C[1].drink = false; }
    if (!c.strike) {
      // the start of a round: a waiting potion, then the buffs and the charge
      if (c.drink && !me.ot && me.pots > 0) { c.drink = false; drinkPot(me); pots++; c.at += POTION; continue; }
      c.drink = false;
      const cast = castBuffs(me, r).length; buffs += cast;
      c.pace = paceOf(effSpd(me));
      c.at += (cast * BUFF_CAST + CAST + SPIN) * c.pace; c.strike = true;
      continue;
    }
    const s = strike(me, foe, r);
    c.strike = false; c.at += RECOVER * c.pace + GAP;
    if (s.miss) continue;
    c.at += STEP_IN / 2; C[1 - i].at += STEP_IN / 2;
    if (s.crit) crits++;
    if (s.oneHit) oneHitBy[i] = true;
    if (s.dead) return { winner: i, how: "ko", crit: s.crit, oneHitBy, pots, crits, buffs, t, ot };
    if (s.reflectKo) return { winner: 1 - i, how: "ko", crit: false, reflect: true, oneHitBy, pots, crits, buffs, t, ot };
    if (s.drink) C[1 - i].drink = true;
    if (s.drinkMe) c.drink = true;
  }
  t = Math.min(t, end);
  if (opts.draws) return { winner: -1, how: "draw", crit: false, oneHitBy, pots, crits, buffs, t };
  const pa = F[0].hp / F[0].s.hp, pb = F[1].hp / F[1].s.hp;
  return { winner: pa > pb ? 0 : pb > pa ? 1 : toss, how: "time", crit: false, oneHitBy, pots, crits, buffs, t, ot };
}

// ---------- prices ----------
// Every price comes from 2,000 practice fights between these two exact fighters (every stat, upgrade, weapon
// level, skill, pet and mount), fought by simulate() itself, so the practice is the real thing. To keep the
// house safe and the wins sensible:
//   * each line is priced from the top of its likely range (its rate plus two standard errors);
//   * every line carries a house edge: 10% on the favourite, 15% on the outsider and on the side bets;
//   * a fighter whose fair price would be over 4x is not offered at all (no long shots), and a side bet is
//     only offered when it comes up between 30% and 70% of the time, at most 3x;
//   * side bets: ends without a critical, potions over/under, criticals over/under, fight length over/under;
//   * no Draw bet (a Draw is practically impossible now that both fighters attack at once); if one ever
//     happens in the Live Arena, bets on either fighter get half back, and their prices allow for that;
//   * nobody can hold both fighters or both sides of an over/under on one fight.
export const DEFAULT_EDGES = { fav: 0.08, dog: 0.12, side: 0.12, draw: 0.15,   // 6.18: a little better for players (was 10% / 15% / 15%)
  maxPrice: 4, maxSide: 3, minP: 0.30, maxP: 0.70 };
export const DRAW_REFUND = 0.5;
export const PRACTICE_FIGHTS = 2000;
const floor2 = (x) => Math.floor(x * 100) / 100;
// a price is offered only between 1.01 and its cap; over the cap it is not offered (never cut down to the cap)
const offer = (raw, cap) => (raw >= 1.01 && raw <= cap ? floor2(raw) : 0);
// the cautious rate: what was seen plus two standard errors (and at least one fight's worth)
const safeP = (p, N) => Math.min(1, p + 2 * Math.sqrt(Math.max(p * (1 - p), 1 / N) / N));
// an over/under line at the middle of what the practice fights saw
function overUnder(counts, N) {
  counts.sort((x, y) => x - y);
  const line = counts[N >> 1] + 0.5, over = counts.filter((x) => x > line).length / N;
  return { line, over, under: 1 - over };
}
// What one fight gives the bets, from simulate() (frames off).
function practice(fa, fb, seed, opts) {
  const f = simulate(fa, fb, seed, { draws: opts.draws, frames: false, values: opts.values, limit: opts.limit });
  const o = outcomeOf(f);
  return { winner: o.winner, critko: o.critko, pots: o.pots, crits: o.crits, length: o.length };
}
// How often A beats B, and how often nobody is knocked out, over n real practice fights (used to pair
// Live Arena fighters).
export function winRate(fa, fb, seed, n = 300, opts = {}) {
  let wa = 0, dr = 0;
  for (let k = 0; k < n; k++) { const q = practice(fa, fb, ((seed >>> 0) * 7919 + k * 104729) >>> 0, { draws: true, ...opts }); if (q.winner === 0) wa++; else if (q.winner === -1) dr++; }
  return { p: wa / n, d: dr / n };
}
// Two Live Arena fighters close enough in strength for a real contest: B is drawn near A's entry count and
// kept when A wins 32% to 68% of practice fights against it and almost every fight ends in a knockout
// (two walls of HP that can't finish each other in time make no contest). Otherwise the best of up to 12
// tries; if even that is a stalemate, a fresh A is drawn.
export function matchedPair(rnd, seed, opts = {}) {
  const score = (x) => Math.abs(x.p + x.d / 2 - 0.5) + x.d * 2;
  let best = null;
  for (let round = 0; round < 3; round++) {
    const a = randomBuild(rnd);
    for (let k = 0; k < 12; k++) {
      const b = randomBuild(rnd, a.entries);
      const w = winRate(a, b, (seed + round * 104723 + k * 7717) >>> 0, 300, opts);
      const x = { a, b, ...w };
      if (!best || score(x) < score(best)) best = x;
      if (w.d <= 0.02 && w.p >= 0.32 && w.p <= 0.68) return [a, b];
    }
    if (best.d <= 0.05) break;
  }
  return [best.a, best.b];
}
export function priceMatch(fa, fb, seed, opts = {}) {
  const E = { ...DEFAULT_EDGES, ...(opts.edges || {}) }, N = opts.n || PRACTICE_FIGHTS, draws = !!opts.draws;
  let wa = 0, wb = 0, dr = 0, critKo = 0;
  const potsN = [], critsN = [], lensN = [];
  for (let k = 0; k < N; k++) {
    const q = practice(fa, fb, ((seed >>> 0) * 7919 + k * 104729) >>> 0, { draws, values: opts.values, limit: opts.limit });
    if (q.winner === 0) wa++; else if (q.winner === 1) wb++; else dr++;
    if (q.critko) critKo++;
    potsN.push(q.pots); critsN.push(q.crits); lensN.push(Math.floor(q.length));
  }
  const pa = wa / N, pb = wb / N, pd = dr / N;
  const sideP = (q) => (q < E.minP || q > E.maxP ? 0 : offer((1 - E.side) / safeP(q, N), E.maxSide));
  // A fighter bet returns price x stake on a win and half the stake on a Draw; price it so that the
  // expected return is at most (1 - edge) of the stake.
  const fighterPrice = (p, edge) => {
    const back = draws ? DRAW_REFUND * pd : 0;
    return p <= 0 ? 0 : offer(((1 - edge) - back) / safeP(p, N), E.maxPrice);
  };
  const favA = pa >= pb;
  const po = overUnder(potsN, N), co = overUnder(critsN, N), lo = overUnder(lensN, N);
  const side = [
    { id: "nocritko", name: "Ends without a critical", p: 1 - critKo / N },
    { id: "over", name: `Over ${po.line} potions drunk`, p: po.over, line: po.line },
    { id: "under", name: `Under ${po.line} potions drunk`, p: po.under, line: po.line },
    { id: "critover", name: `Over ${co.line} critical hits`, p: co.over, line: co.line },
    { id: "critunder", name: `Under ${co.line} critical hits`, p: co.under, line: co.line },
    { id: "lenover", name: `Fight lasts over ${lo.line} s`, p: lo.over, line: lo.line },
    { id: "lenunder", name: `Fight lasts under ${lo.line} s`, p: lo.under, line: lo.line }
  ].map((x) => ({ ...x, price: sideP(x.p) }));
  return {
    pa, pb, pd, draws, n: N,
    a: fighterPrice(pa, favA ? E.fav : E.dog), b: fighterPrice(pb, favA ? E.dog : E.fav),
    draw: 0,   // no Draw bet since engine 8
    side
  };
}

// ---------- bets ----------
// A bet line: { k, amount, price } where k is "a", "b", "draw" or a side bet id. line = the over/under line.
export const OPPOSITE = { over: "under", under: "over", critover: "critunder", critunder: "critover", buffover: "buffunder", buffunder: "buffover", lenover: "lenunder", lenunder: "lenover" };
export function lineKeyOk(k, odds) {
  if (k === "draw" && !odds.draws) return false;
  return priceFor(k, odds) > 1;
}
// Bets that can't both be on one fight: both fighters, both sides of an over/under.
export const CONFLICT = { a: "b", b: "a", over: "under", under: "over", critover: "critunder", critunder: "critover", buffover: "buffunder", buffunder: "buffover", lenover: "lenunder", lenunder: "lenover", onehitA: "onehitB", onehitB: "onehitA" };
// The first pair of keys in this list that can't go together, or null.
export function conflictIn(keys) {
  const set = new Set(keys);
  for (const k of set) if (CONFLICT[k] && set.has(CONFLICT[k])) return [k, CONFLICT[k]];
  return null;
}
export function priceFor(k, odds) {
  if (k === "a") return odds.a;
  if (k === "b") return odds.b;
  if (k === "draw") return odds.draws ? odds.draw : 0;
  const s = (odds.side || []).find((x) => x.id === k);
  return s ? s.price : 0;
}
export const lineOf = (k, odds) => { const s = (odds.side || []).find((x) => x.id === k); return s && s.line != null ? s.line : null; };
// What one line pays back (stake included). 0 = lost. On a Draw, bets on either fighter get half back.
export function lineReturn(l, o, odds) {
  const amt = l.amount, won = (p) => Math.floor(amt * p);
  if (l.k === "a" || l.k === "b") {
    if (o.draw) return Math.floor(amt * DRAW_REFUND);
    return o.winner === (l.k === "a" ? 0 : 1) ? won(l.price) : 0;
  }
  if (l.k === "draw") return o.draw ? won(l.price) : 0;
  const line = l.line != null ? l.line : lineOf(l.k, odds);
  const hit = l.k === "onehitA" ? o.oneHitBy[0] : l.k === "onehitB" ? o.oneHitBy[1] : l.k === "nocritko" ? !o.critko
    : l.k === "over" ? o.pots > line : l.k === "under" ? o.pots < line : l.k === "critover" ? o.crits > line : l.k === "critunder" ? o.crits < line
    : l.k === "buffover" ? (o.buffs || 0) > line : l.k === "buffunder" ? (o.buffs || 0) < line
    : l.k === "lenover" ? o.length > line : l.k === "lenunder" ? o.length < line : false;
  return hit ? won(l.price) : 0;
}
export const betReturn = (lines, o, odds) => (lines || []).reduce((a, l) => a + lineReturn(l, o, odds), 0);
export function lineName(k, odds, names) {
  if (k === "a") return `${names[0]} to win`;
  if (k === "b") return `${names[1]} to win`;
  if (k === "draw") return "Draw";
  const s = (odds.side || []).find((x) => x.id === k);
  return s ? s.name : k;
}
// A bet line in words, from the line itself (its over/under line is kept on it).
export function lineLabel(l, names) {
  const n = names || ["Fighter A", "Fighter B"];
  switch (l.k) {
    case "a": return `${n[0]} to win`;
    case "b": return `${n[1]} to win`;
    case "draw": return "Draw";
    case "onehitA": return `One-hit KO by ${n[0]}`;
    case "onehitB": return `One-hit KO by ${n[1]}`;
    case "nocritko": return "Ends without a critical";
    case "over": return `Over ${l.line} potions drunk`;
    case "under": return `Under ${l.line} potions drunk`;
    case "critover": return `Over ${l.line} critical hits`;
    case "critunder": return `Under ${l.line} critical hits`;
    case "buffover": return `Over ${l.line} buff skills cast`;
    case "buffunder": return `Under ${l.line} buff skills cast`;
    case "lenover": return `Fight lasts over ${l.line} s`;
    case "lenunder": return `Fight lasts under ${l.line} s`;
    default: return String(l.k);
  }
}