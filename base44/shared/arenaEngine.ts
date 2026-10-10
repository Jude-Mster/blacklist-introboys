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

export const ENGINE_VERSION = 1;

// ---------- dice ----------
export const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- the fighter sheet ----------
// Every fighter starts from the same base. Each entry after the first rolls one upgrade on top.
export const BASE = { hp: 40000, mp: 13153, atk: 15000, def: 6000, crit: 15, critdef: 0, acc: 80, eva: 10, pots: 5, potheal: 80, spd: 100 };
// w = how likely an entry is to roll this stat: Crit defense 1 in 5, the other nine about 1 in 11 each.
export const UPGRADES = [
  { id: "hp", name: "HP", unit: "", w: 0.0889 },
  { id: "atk", name: "ATK", unit: "", w: 0.0889 },
  { id: "def", name: "DEF", unit: "", w: 0.0889 },
  { id: "crit", name: "Crit rate", unit: "%", w: 0.0889 },
  { id: "critdef", name: "Crit defense", unit: "%", w: 0.20 },
  { id: "acc", name: "Accuracy", unit: "%", w: 0.0889 },
  { id: "eva", name: "Evasion", unit: "%", w: 0.0889 },
  { id: "pots", name: "HP potions", unit: "", w: 0.0889 },
  { id: "potheal", name: "Potion heal", unit: "%", w: 0.0889 },
  { id: "spd", name: "Attack speed", unit: "%", w: 0.0889 }
];
export const PER_STAT = 9, TOTAL_CAP = 25;
// What each upgrade gives. The Guild Leader can change these for a tournament (saved on it).
export const DEFAULT_VALUES = {
  ups: { hp: 5000, atk: 400, def: 400, crit: 1, critdef: 2, acc: 5, eva: 5, pots: 1, potheal: 3, spd: 5 },
  weapon: { atk: 0.10, crit: 3, chance: 0.30 }
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
export const COSTS = { entry: 500, skill: 1000, weaponTry: 500, pet: 1500, mountLevel: 1500, mountReset: 2500 };

// ---------- pet, mount, weapon ----------
// Iron Condor (Epic): 25% of growth per level, up to 200%. At 200% the game's full bonus.
export const PET = { name: "Iron Condor (Epic)", levels: 8, full: { hp: 2200, atk: 1350, def: 2200 } };
export const petGrowth = (lv) => lv * 25;
export const petBonus = (lv, id) => Math.round((PET.full[id] || 0) * lv / PET.levels);
// Mount: the first level draws one pair at random; every level after adds 1% more to the same pair.
// HP, ATK and DEF grow by that % of the fighter's total; Crit rate, Dodge and Crit defense by that many points.
export const MOUNT = { levels: 10, pairs: [["atk", "def"], ["atk", "hp"], ["def", "hp"], ["crit", "eva"], ["def", "eva"], ["critdef", "def"]] };
export const STAT_NAME = { hp: "HP", atk: "ATK", def: "DEF", crit: "Crit rate", eva: "Dodge", critdef: "Crit defense" };
export const mountText = (m, lv = m.lv) => MOUNT.pairs[m.pair].map((id) => `${STAT_NAME[id]} +${lv}%`).join(" · ");
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
// cooldown rolls its chance at the start of each turn; all that come up are cast (0.6 s each) and their
// effects add up. Cast again while up, its uses add on, up to stackCap casts' worth.
//   attacks = the owner's own attacks; guards = the opponent's attacks (hits and misses); charges = hits
//   that land. cd = the owner's attacks after casting before it can be cast again. MP never stops a cast.
export const SKILLS = {
  shield: { name: "Heavenly Shield", chance: 0.35, cd: 3, charges: 2, cut: 0.5, mp: 1035.3, color: 0x5aa8ff, text: "halves the next 2 hits that land" },
  blow: { name: "Heavenly Blow", chance: 0.15, cd: 4, attacks: 2, crit: 20, mp: 1035.3, color: 0xff3030, text: "+20% Crit rate for 2 attacks, then 4 attacks to cool down" },
  spirits: { name: "Spirits Within", chance: 0.2, cd: 0, attacks: 3, atk: 0.15, spd: 0.15, mp: 108.75, color: 0xa8e4ff, text: "+15% ATK and +15% attack speed for 3 attacks" },
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
export const CHARGE = { name: "Crimson LightningCharger", mp: 145.5, upTo: 2 };

// ---------- timings (seconds) ----------
export const CAST = 1.0, SPIN = 0.8, RECOVER = 0.35, POTION = 0.6, GAP = 0.3, RANGE = 3.2, WALK = 3.4, DT = 0.05;
export const LIMIT = 180;   // a fight lasts at most 3 minutes
const DMG_K = 0.46, CRIT_MIN = 3, CRIT_MAX = 7, MP_REGEN = 20, POT_AT = 0.7;
const START = [4.0, 8.0];

// ---------- a fighter's numbers ----------
// f: { ups: {id: rolls}, pet: level, mount: { lv, pair }, weapon: level, skills: [] }
export function statsOf(f, values) {
  const V = values || DEFAULT_VALUES;
  const s = { ...BASE };
  for (const u of UPGRADES) s[u.id] += ((f.ups && f.ups[u.id]) || 0) * (V.ups[u.id] ?? DEFAULT_VALUES.ups[u.id]);
  if (f.pet) for (const id of ["hp", "atk", "def"]) s[id] += petBonus(f.pet, id);
  if (f.mount && MOUNT.pairs[f.mount.pair]) for (const id of MOUNT.pairs[f.mount.pair]) s[id] = ["hp", "atk", "def"].includes(id) ? Math.round(s[id] * (1 + f.mount.lv / 100)) : s[id] + f.mount.lv;
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
// A random fighter for the Live Arena: 1 to 25 entries, a weapon, 0 to 2 skills, sometimes a pet or a mount.
export function randomBuild(rnd) {
  const entries = 1 + Math.floor(Math.pow(rnd(), 1.3) * 25), ups = {};
  for (let k = 1; k < entries; k++) rollUpgrade(ups, rnd);
  let weapon = 0; const tries = Math.floor(rnd() * 14); for (let k = 0; k < tries && weapon < WEAPON.max; k++) if (rnd() < 0.3) weapon++;
  const ns = rnd() < 0.4 ? 0 : rnd() < 0.58 ? 1 : 2, pool = SKILL_IDS.slice(), skills = [];
  for (let j = 0; j < ns; j++) skills.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const pet = rnd() < 0.3 ? 1 + Math.floor(rnd() * PET.levels) : 0;
  const mount = rnd() < 0.35 ? { lv: 1 + Math.floor(rnd() * MOUNT.levels), pair: Math.floor(rnd() * MOUNT.pairs.length) } : null;
  return { entries, ups, weapon, skills, pet, mount };
}

const hitChance = (acc, eva) => clamp(acc - eva, 25, 97) / 100;          // base 80 − 10 = 70%
const critChance = (crit, critdef) => clamp(crit - critdef, 1, 60) / 100; // base 15%, at most 60%
const effAtk = (m) => m.s.atk * (1 + (m.buf.spirits > 0 ? SKILLS.spirits.atk : 0) + (m.buf.blood > 0 ? SKILLS.blood.atk : 0));
const effSpd = (m) => m.s.spd * (m.buf.spirits > 0 ? 1 + SKILLS.spirits.spd : 1);
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
  dmg = Math.max(1, Math.round(dmg * mult));
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
    drink: !dead && foe.hp <= foe.s.hp * POT_AT && foe.pots > 0,
    drinkMe: reflect > 0 && !reflectKo && me.hp <= me.s.hp * POT_AT && me.pots > 0
  };
}
const drinkPot = (d) => { const heal = Math.min(d.s.hp - d.hp, Math.round(d.s.hp * d.s.potheal / 100)); d.hp += heal; d.pots--; return heal; };
const mkSide = (f, x, dir, values) => { const s = statsOf(f, values); return { f, s, x, dir, hp: s.hp, mp: s.mp, pots: s.pots, charged: false, dead: false, sk: (f.skills || []).filter((id) => SKILLS[id]).slice(0, MAX_SKILLS), buf: noBuffs(), cd: noBuffs(), stepSpd: s.spd }; };
// Turn order by attack speed: each fighter's place on the timeline moves on by 100 ÷ speed after each of
// their attacks, and the one furthest behind attacks next. Equal speeds take turns.
const nextActor = (nx, last) => (nx[0] < nx[1] - 1e-9 ? 0 : nx[1] < nx[0] - 1e-9 ? 1 : 1 - last);
const round2 = (n) => Math.round(n * 100) / 100;

// One fight, frame by frame.
//   opts.draws   true (Live Arena): no knockout by the time limit is a Draw (winner -1).
//                false (tournament): at the time limit the higher share of HP wins.
//   opts.frames  false on the server, which only needs the events.
//   opts.values  what each upgrade gives (a tournament's own values).
export function simulate(fa, fb, seed, opts = {}) {
  const limit = opts.limit || LIMIT, keepFrames = opts.frames !== false;
  const r = mulberry32(seed >>> 0);
  const F = [mkSide(fa, START[0], 1, opts.values), mkSide(fb, START[1], -1, opts.values)];
  const frames = [], events = [];
  const toss = r() < 0.5 ? 0 : 1, nx = [100 / F[0].s.spd, 100 / F[1].s.spd];
  let t = 0, winner = -1, how = "", turn = nextActor(nx, 1 - toss), phase = "walk", left = 0, done = false;
  const drinks = [];
  let casting = [];
  const ev = (who, type, extra) => events.push({ t: round2(t), who, type, ...extra });
  const nextTurn = () => { nx[turn] += 100 / F[turn].stepSpd; const prev = turn; turn = nextActor(nx, prev); if (turn === prev) ev(turn, "again", {}); phase = "gap"; left = GAP; };
  ev(turn, "first", { toss: toss === turn });
  while (t < limit && !done) {
    for (const m of F) m.mp = Math.min(m.s.mp, m.mp + MP_REGEN * DT);
    const gap = Math.abs(F[1].x - F[0].x);
    if (phase === "walk") {
      if (gap > RANGE + 1e-6) { const step = Math.min(WALK * DT, (gap - RANGE) / 2); F[0].x += step; F[1].x -= step; }
      else { phase = "gap"; left = GAP; }
    } else if (phase === "gap" && gap > RANGE + 1e-6) {
      const me = F[turn]; me.x += me.dir * Math.min(WALK * DT, gap - RANGE);
    } else if ((left -= DT) <= 0) {
      const me = F[turn], foe = F[1 - turn];
      if (phase === "gap") casting = castBuffs(me, r).map((id) => ({ id, stacked: me.buf[id] > usesOf(id) }));
      if ((phase === "gap" || phase === "buff") && casting.length) { const c = casting.shift(); phase = "buff"; left = BUFF_CAST; ev(turn, "buff", { skill: c.id, stacked: c.stacked }); }
      else if (phase === "gap" || phase === "buff") { me.mp = Math.max(0, me.mp - CHARGE.mp); phase = "cast"; left = CAST; ev(turn, "cast", {}); }
      else if (phase === "cast") { me.charged = true; phase = "spin"; left = SPIN; ev(turn, "spin", {}); }
      else if (phase === "spin") {
        me.charged = false; phase = "recover"; left = RECOVER;
        const s = strike(me, foe, r), u = s.used;
        if (s.miss) ev(turn, "miss", { dodge: u.garuda });
        else {
          foe.x = clamp(foe.x - foe.dir * (s.crit ? 0.9 : 0.35), 0.8, 11.2);
          ev(turn, "hit", { dmg: s.dmg, shielded: s.shielded, crit: s.crit, mult: s.mult, power: s.power, oneHit: s.oneHit, reflect: s.reflect, reflectKo: s.reflectKo, blow: u.blow, spirits: u.spirits, blood: u.blood, nirvana: u.nirvana });
          if (s.dead) { foe.dead = true; winner = turn; how = "ko"; done = true; ev(1 - turn, "ko", { crit: s.crit, oneHit: s.oneHit }); }
          else if (s.reflectKo) { me.dead = true; winner = 1 - turn; how = "ko"; done = true; ev(turn, "ko", { crit: false, oneHit: false, reflect: true }); }
          else { if (s.drink) drinks.push(1 - turn); if (s.drinkMe) drinks.push(turn); }
        }
      }
      else if (phase === "recover" || phase === "potion") {
        if (drinks.length) { const d = drinks.shift(), heal = drinkPot(F[d]); ev(d, "potion", { heal, left: F[d].pots }); phase = "potion"; left = POTION; }
        else nextTurn();
      }
    }
    if (keepFrames) frames.push({ t: round2(t), x: [F[0].x, F[1].x], hp: [F[0].hp, F[1].hp], mp: [F[0].mp, F[1].mp], pots: [F[0].pots, F[1].pots], charged: [F[0].charged, F[1].charged], sk: [{ ...F[0].buf }, { ...F[1].buf }], cd: [{ ...F[0].cd }, { ...F[1].cd }], buff: F.map((m) => (m.charged ? { lightning: 1 } : {})) });
    t += DT;
  }
  if (!done) {
    if (opts.draws) { winner = -1; how = "draw"; ev(-1, "draw", {}); }
    else { const pa = F[0].hp / F[0].s.hp, pb = F[1].hp / F[1].s.hp; winner = pa >= pb ? 0 : 1; how = "time"; ev(winner, "time", {}); }
  }
  if (keepFrames && frames.length) frames.push({ ...frames[frames.length - 1], t: round2(t) });
  return { frames, events, winner, how, length: round2(t), maxhp: [F[0].s.hp, F[1].s.hp], maxmp: [F[0].s.mp, F[1].s.mp], maxpots: [F[0].s.pots, F[1].s.pots], skills: [F[0].sk, F[1].sk], stats: [F[0].s, F[1].s] };
}

// What a finished fight means for the bets.
export function outcomeOf(fight) {
  const ev = fight.events, ko = ev.find((e) => e.type === "ko");
  return {
    winner: fight.winner, draw: fight.winner === -1, how: fight.how, length: fight.length,
    critko: !!(ko && ko.crit),
    oneHitBy: [0, 1].map((i) => ev.some((e) => e.type === "hit" && e.oneHit && e.who === i)),
    pots: ev.filter((e) => e.type === "potion").length,
    crits: ev.filter((e) => e.type === "hit" && e.crit).length
  };
}

// The same fight without the walking, about 100 times faster: used for the practice fights that set
// the prices. (The time it keeps is close to the real fight's, not exact.)
const TURN_T = GAP + CAST + SPIN + RECOVER + 0.15;
export function quickFight(fa, fb, seed, opts = {}) {
  const limit = opts.limit || LIMIT;
  const r = mulberry32(seed >>> 0);
  const F = [mkSide(fa, 0, 1, opts.values), mkSide(fb, 0, -1, opts.values)];
  const toss = r() < 0.5 ? 0 : 1, nx = [100 / F[0].s.spd, 100 / F[1].s.spd], oneHitBy = [false, false];
  let t = 0.6, turn = nextActor(nx, 1 - toss), pots = 0, crits = 0;
  while (t < limit) {
    const me = F[turn], foe = F[1 - turn];
    t += TURN_T;
    t += castBuffs(me, r).length * BUFF_CAST;
    const s = strike(me, foe, r);
    if (!s.miss) {
      if (s.crit) crits++;
      if (s.oneHit) oneHitBy[turn] = true;
      if (s.dead) return { winner: turn, how: "ko", crit: s.crit, oneHitBy, pots, crits, t };
      if (s.reflectKo) return { winner: 1 - turn, how: "ko", crit: false, reflect: true, oneHitBy, pots, crits, t };
      if (s.drink) { drinkPot(foe); pots++; t += POTION; }
      if (s.drinkMe) { drinkPot(me); pots++; t += POTION; }
    }
    nx[turn] += 100 / me.stepSpd; turn = nextActor(nx, turn);
  }
  if (opts.draws) return { winner: -1, how: "draw", crit: false, oneHitBy, pots, crits, t };
  const pa = F[0].hp / F[0].s.hp, pb = F[1].hp / F[1].s.hp;
  return { winner: pa >= pb ? 0 : 1, how: "time", crit: false, oneHitBy, pots, crits, t };
}

// ---------- prices ----------
// From 1,000 practice fights. The fighter more likely to win carries the favourite's house edge, the other
// one the outsider's; prices are capped at 10x. Side bets carry their own edge and are capped at 6x.
// The Draw (Live Arena only) is rare, so it pays much more, capped at drawCap. On a Draw, bets on either
// fighter get half back, so their prices allow for that.
export const DEFAULT_EDGES = { fav: 0.10, dog: 0.15, side: 0.15, draw: 0.15, maxPrice: 10, maxSide: 6, drawCap: 50 };
export const DRAW_REFUND = 0.5;
const floor2 = (x) => Math.floor(x * 100) / 100;
const priceOf = (q, edge, cap) => Math.min(cap, Math.max(1.05, floor2((1 - edge) / Math.max(0.01, q))));
export function priceMatch(fa, fb, seed, opts = {}) {
  const E = { ...DEFAULT_EDGES, ...(opts.edges || {}) }, N = opts.n || 1000, draws = !!opts.draws;
  let wa = 0, wb = 0, dr = 0, critKo = 0;
  const potsN = [], critsN = [], oneBy = [0, 0];
  for (let k = 0; k < N; k++) {
    const q = quickFight(fa, fb, ((seed >>> 0) * 7919 + k * 104729) >>> 0, { draws, values: opts.values, limit: opts.limit });
    if (q.winner === 0) wa++; else if (q.winner === 1) wb++; else dr++;
    if (q.how === "ko" && q.crit) critKo++;
    if (q.oneHitBy[0]) oneBy[0]++;
    if (q.oneHitBy[1]) oneBy[1]++;
    potsN.push(q.pots); critsN.push(q.crits);
  }
  const pa = wa / N, pb = wb / N, pd = dr / N;
  // A fighter bet returns price × stake on a win and half the stake on a Draw; price it so that the
  // expected return is (1 − edge) of the stake.
  const fighterPrice = (p, edge) => {
    const back = draws ? DRAW_REFUND * Math.max(pd, 0.002) : 0;
    return Math.min(E.maxPrice, Math.max(1.05, floor2(((1 - edge) - back) / Math.max(0.01, p))));
  };
  const favA = pa >= pb;
  potsN.sort((x, y) => x - y); critsN.sort((x, y) => x - y);
  const line = potsN[N >> 1] + 0.5, over = potsN.filter((x) => x > line).length / N;
  const cline = critsN[N >> 1] + 0.5, cover = critsN.filter((x) => x > cline).length / N;
  const nameA = fa.name || "Fighter A", nameB = fb.name || "Fighter B";
  const side = [
    { id: "onehitA", name: `One-hit KO by ${nameA}`, p: oneBy[0] / N },
    { id: "onehitB", name: `One-hit KO by ${nameB}`, p: oneBy[1] / N },
    { id: "nocritko", name: "Ends without a critical", p: 1 - critKo / N },
    { id: "over", name: `Over ${line} potions drunk`, p: over, line },
    { id: "under", name: `Under ${line} potions drunk`, p: 1 - over, line },
    { id: "critover", name: `Over ${cline} critical hits`, p: cover, line: cline },
    { id: "critunder", name: `Under ${cline} critical hits`, p: 1 - cover, line: cline }
  ].map((s) => ({ ...s, price: priceOf(s.p, E.side, E.maxSide) }));
  return {
    pa, pb, pd, draws,
    a: fighterPrice(pa, favA ? E.fav : E.dog), b: fighterPrice(pb, favA ? E.dog : E.fav),
    // the Draw is priced from at least 1 in 200, so a pair that rarely draws doesn't get an absurd price
    draw: draws ? Math.min(E.drawCap, Math.max(1.05, floor2((1 - E.draw) / Math.max(pd, 0.005)))) : 0,
    side
  };
}

// ---------- bets ----------
// A bet line: { k, amount, price } where k is "a", "b", "draw" or a side bet id. line = the over/under line.
export const OPPOSITE = { over: "under", under: "over", critover: "critunder", critunder: "critover" };
export function lineKeyOk(k, odds) {
  if (k === "a" || k === "b") return true;
  if (k === "draw") return !!odds.draws && odds.draw > 1;
  return (odds.side || []).some((s) => s.id === k);
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
    : l.k === "over" ? o.pots > line : l.k === "under" ? o.pots < line : l.k === "critover" ? o.crits > line : l.k === "critunder" ? o.crits < line : false;
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
    default: return String(l.k);
  }
}
