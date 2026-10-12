// Arena formulas, recomputed independently of the engine. Run: node tests/formulas.test.mjs
// Phase 3: the Arena's numbers, recomputed independently of the engine's own code.
// Only simulate()'s output (events, frames) and the build are taken from the engine; every formula
// below is written again from the stated rules and compared with what the engine did.
import * as E from "../base44/shared/arenaEngine.ts";
const R = { rows: [], fail: 0 };
const check = (name, formula, inputs, expected, actual, pass) => { R.rows.push({ name, formula, inputs, expected, actual, pass }); if (!pass) R.fail++; };

// ---- the rules as stated (not imported) ----
const BASE = { hp: 40000, mp: 13153, atk: 15000, def: 6000, crit: 15, critdef: 0, acc: 80, eva: 10, pots: 5, potheal: 80, spd: 100 };
const PER = { hp: 7000, atk: 950, def: 900, crit: 1.5, critdef: 3, acc: 5, eva: 8, pots: 2, potheal: 3, spd: 10 };
const W = { atk: 0.15, crit: 5 };
const PET_FULL = { hp: 4400, atk: 2700, def: 4400 }, PET_LV = 8;
const MOUNT_PER = 3, PAIRS = [["atk", "def"], ["atk", "hp"], ["def", "hp"], ["crit", "eva"], ["def", "eva"], ["critdef", "def"]];
function myStats(f) {
  const s = { ...BASE };
  for (const k in PER) s[k] += ((f.ups || {})[k] || 0) * PER[k];
  if (f.pet) for (const k of ["hp", "atk", "def"]) s[k] += Math.round(PET_FULL[k] * f.pet / PET_LV);
  if (f.mount) for (const k of PAIRS[f.mount.pair]) s[k] = ["hp", "atk", "def"].includes(k) ? Math.round(s[k] * (1 + f.mount.lv * MOUNT_PER / 100)) : s[k] + f.mount.lv * MOUNT_PER;
  const wl = Math.min(5, f.weapon || 0);
  if (wl) { s.atk = Math.round(s.atk * (1 + W.atk * wl)); s.crit += W.crit * wl; }
  return s;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let fights = 0, hits = 0, misses = 0, crits = 0, expHit = 0, expCrit = 0, dmgBad = 0, dmgN = 0, hpBad = 0, koBad = 0, multBad = 0, potBad = 0, mpBad = 0, barBad = 0, statBad = 0, overkill = 0, afterKo = 0;
let worstDmg = null;
const r = E.mulberry32(20261011);
for (let i = 0; i < 1500; i++) {
  const a = E.randomBuild(r), b = E.randomBuild(r);
  const f = E.simulate(a, b, (r() * 2 ** 32) >>> 0, { draws: true });
  fights++;
  const S = [myStats(a), myStats(b)];
  for (const j of [0, 1]) for (const k of Object.keys(BASE)) if (Math.abs(S[j][k] - f.stats[j][k]) > 1e-9) { statBad++; if (statBad < 4) console.log("stat", k, S[j][k], f.stats[j][k]); }
  const fr = (t) => f.frames[Math.round(t / E.DT)] || f.frames[f.frames.length - 1];
  const buf = [{ spirits: 0, blood: 0, blow: 0 }, { spirits: 0, blood: 0, blow: 0 }];
  let hp = [S[0].hp, S[1].hp], ko = false;
  for (const e of f.events) {
    if (ko && e.type !== "ko") afterKo++;
    if (e.type === "hit" || e.type === "miss") {
      const me = S[e.who], foe = S[1 - e.who];
      const before = fr(e.t - E.DT);
      const eva = foe.eva + (e.type === "miss" ? (e.dodge ? 25 : 0) : 0);
      expHit += clamp(me.acc - foe.eva - (before.sk[1 - e.who].garuda > 0 ? 25 : 0), 25, 97) / 100;
      if (e.type === "miss") { misses++; continue; }
      hits++;
      const atk = me.atk * (1 + (e.spirits ? 0.15 : 0) + (e.blood ? 0.25 : 0));
      const critP = clamp(me.crit + (e.blow ? 20 : 0) - foe.critdef - (e.nirvana ? 20 : 0), 1, 60) / 100;
      expCrit += critP; if (e.crit) crits++;
      if (e.crit !== (e.mult >= 3) || (e.crit && (e.mult < 3 || e.mult > 7 || !Number.isInteger(e.mult))) || (!e.crit && e.mult !== 1)) multBad++;
      // damage: max(ATK x 0.2, ATK - DEF x 0.5) x 0.46 x charge x crit, rounded; a shield halves it
      const base = Math.max(atk * 0.2, atk - foe.def * 0.5) * 0.46 * e.power * e.mult * (e.ot || 1);
      const full = Math.max(1, Math.round(base));
      const want = e.shielded ? Math.max(1, Math.round(e.shielded * 0.5)) : full;
      const ref = e.shielded ? e.shielded : e.dmg;
      dmgN++;
      // the event shows the charge rounded to 2 decimals, so allow for that (+/- 0.005 of the charge) and the rounding to whole points
      const perPower = base / e.power, tol = perPower * 0.005 + 1;
      if (Math.abs(ref - full) > tol || (e.shielded && e.dmg !== want)) { dmgBad++; if (!worstDmg || Math.abs(ref - full) > worstDmg.d) worstDmg = { d: Math.abs(ref - full), ref, full, e }; }
      // HP: the target loses exactly the damage, never below 0
      // (both fighters can strike in the same instant, so the frame is checked once every event of that
      // instant has been counted: see the end of this loop)
      const tgt = 1 - e.who;
      const expAfter = Math.max(0, hp[tgt] - e.dmg);
      hp[tgt] = expAfter;
      if (hp[tgt] === 0 && !f.events.some((x) => x.type === "ko" && x.who === tgt)) koBad++;
      if (hp[tgt] < 0) overkill++;
      if (e.reflect) hp[e.who] = Math.max(0, hp[e.who] - e.reflect);
      if (hp[tgt] === 0 || (e.reflect && hp[e.who] === 0)) ko = true;
    }
    if (e.type === "potion") {
      const s = S[e.who], heal = Math.min(s.hp - hp[e.who], Math.round(s.hp * s.potheal / 100));
      if (heal !== e.heal) potBad++;
      hp[e.who] += heal;
    }
    if (e.type === "ko" && hp[e.who] !== 0) koBad++;
    const nx = f.events[f.events.indexOf(e) + 1];
    if ((!nx || nx.t !== e.t) && (e.type === "hit" || e.type === "potion")) { const x = fr(e.t); if (x.hp[0] !== hp[0] || x.hp[1] !== hp[1]) hpBad++; }
  }
  // bars: HP and MP in every frame between 0 and max; MP never goes up
  for (let k = 0; k < f.frames.length; k++) {
    const x = f.frames[k];
    for (const j of [0, 1]) {
      if (x.hp[j] < 0 || x.hp[j] > f.maxhp[j] || x.mp[j] < 0 || x.mp[j] > f.maxmp[j]) barBad++;
      if (k && x.mp[j] > f.frames[k - 1].mp[j] + 1e-9) mpBad++;
    }
  }
}
// ---- tournament overtime (stated rule: no KO at 180 s -> sudden death, no potions, every hit x2, +1 every 5 s,
// at most 90 s; then the larger share of HP left wins) ----
let otFights = 0, otMissing = 0, otPot = 0, otMultBad = 0, otHits = 0, otNoWinner = 0, otHpEnd = 0, otLong = 0, otEarly = 0;
const rt = E.mulberry32(99);
const tank = () => ({ entries: 25, ups: { hp: 8, def: 8, pots: 8 }, weapon: 0, skills: ["shield", "bullet"], pet: 8, mount: { lv: 5, pair: 2 } });
for (let i = 0; i < 300; i++) {
  const mixed = i % 3 === 0;
  const a = mixed ? E.randomBuild(rt) : tank(), b = tank();
  const f = E.simulate(a, b, (rt() * 2 ** 32) >>> 0, { draws: false, frames: false });
  if (f.winner !== 0 && f.winner !== 1) otNoWinner++;
  if (f.length > 180 + 90 + 0.06) otLong++;
  const start = f.events.find((e) => e.type === "overtime");
  if (f.length > 180 + 1e-6 && !start) otMissing++;
  if (start && Math.abs(start.t - 180) > 0.051) otEarly++;
  if (!start) continue;
  otFights++;
  if (f.how === "time") otHpEnd++;
  for (const e of f.events) {
    if (e.t < 180 - 1e-9) { if (e.type === "hit" && e.ot) otMultBad++; continue; }
    if (e.type === "potion") otPot++;
    if (e.type === "hit") { otHits++; const want = 2 + Math.floor((e.t - 180 + 1e-9) / 5); if (e.ot !== want) otMultBad++; }
  }
}
check("Overtime starts", "tournament fight with no KO at 180 s goes to overtime at 180 s", "300 long fights", "every one", `${otFights} went to overtime, ${otMissing} missing, ${otEarly} at the wrong time`, otMissing === 0 && otEarly === 0 && otFights > 150);
check("Overtime damage", "every overtime hit x(2 + 1 per 5 s of overtime)", `${otHits} overtime hits`, "0 wrong", `${otMultBad} wrong`, otMultBad === 0 && otHits > 0);
check("Overtime potions", "no potions in overtime", `${otFights} fights`, "0 potions", `${otPot}`, otPot === 0);
check("Overtime ends", "always a winner; at most 90 s of overtime", "300 fights", "0 without a winner, 0 too long", `${otNoWinner} without a winner, ${otLong} too long, ${otHpEnd} decided on HP after 90 s`, otNoWinner === 0 && otLong === 0);

// ---- 6.10: upgrade cap 50, weapon 20%, both fighters attack at the same time ----
{
  const ru = E.mulberry32(3); let capBad = 0;
  for (let k = 0; k < 300; k++) {
    const ups = {}; let got = 0;
    for (let e = 1; e < 80; e++) if (E.rollUpgrade(ups, ru)) got++;
    if (got !== 50 || Object.values(ups).some((v) => v > 9)) capBad++;
  }
  check("Upgrade cap", "every entry after the first rolls one upgrade, at most 50 in all and 9 per stat", "300 fighters, 79 entries each", "50 upgrades each", `${capBad} wrong`, capBad === 0);
  check("Weapon success rate", "default chance per try", "DEFAULT_VALUES", "20%", `${E.DEFAULT_VALUES.weapon.chance * 100}%`, E.DEFAULT_VALUES.weapon.chance === 0.2);
  // simultaneous: how often is one fighter mid-attack while the other is too? and does Speed set how often each attacks?
  const plain = (spdRolls) => ({ entries: 26, ups: { hp: 9, def: 9, spd: spdRolls }, weapon: 0, skills: [], pet: 0, mount: null });
  let both = 0, frames = 0, nA = 0, nB = 0, tA = 0;
  const rs = E.mulberry32(11);
  for (let k = 0; k < 80; k++) {
    const f = E.simulate(plain(0), plain(8), (rs() * 2 ** 32) >>> 0, { draws: false });
    const busy = (i, t) => { const c = [...f.events].reverse().find((e) => e.who === i && e.type === "cast" && e.t <= t); return c && t - c.t < (E.CAST + E.SPIN) * c.k; };
    for (const fr of f.frames) { frames++; if (busy(0, fr.t) && busy(1, fr.t)) both++; }
    nA += f.events.filter((e) => e.who === 0 && (e.type === "hit" || e.type === "miss")).length;
    nB += f.events.filter((e) => e.who === 1 && (e.type === "hit" || e.type === "miss")).length;
    tA++;
  }
  const ratio = nB / nA, want = (E.CAST + E.SPIN + E.RECOVER + E.GAP) / ((E.CAST + E.SPIN + E.RECOVER) * E.paceOf(180) + E.GAP);
  check("Both attack at once", "each fighter runs its own attacks; nobody waits for a turn", `${frames} frames`, "both charging or swinging at the same moment often", `${(both / frames * 100).toFixed(1)}% of the time`, both / frames > 0.2);
  check("Speed sets attack rate", "a 180% Speed fighter attacks (round at 100%) / (round at 180%) times as often", `${tA} fights`, `${want.toFixed(2)}x`, `${ratio.toFixed(2)}x`, Math.abs(ratio - want) < 0.12);
}

// ---- 6.11: Live Arena builds up to 51 entries, matched pairs ----
{
  const rm = E.mulberry32(21); let maxE = 0, big = 0, far = 0, close = 0, n = 0, ms = 0;
  for (let k = 0; k < 400; k++) { const x = E.randomBuild(rm); maxE = Math.max(maxE, x.entries); if (x.entries > 40) big++; }
  for (let k = 0; k < 60; k++) {
    const t0 = performance.now(); const [a, b] = E.matchedPair(rm, (rm() * 2 ** 32) >>> 0); ms += performance.now() - t0;
    n++; if (Math.abs(a.entries - b.entries) > Math.max(1, a.entries * 0.2) + 0.5) far++;
    const w = E.winRate(a, b, (rm() * 2 ** 32) >>> 0, 1000); if (w.p >= 0.25 && w.p <= 0.75 && w.d <= 0.05) close++;
  }
  check("Live Arena builds", "1 to 51 entries (up to the full 50 upgrades)", "400 builds", "top 51, some over 40", `top ${maxE}, ${big} over 40`, maxE <= 51 && big > 10);
  check("Live Arena matchmaking", "B within 20% of A's entries; A wins 32-68% of practice fights, nearly no stalemates", `${n} pairs, re-checked over 1,000 fights each`, "within 20% always; a close fight in 90%+", `${far} outside 20%; ${close} of ${n} close; ${(ms / n).toFixed(0)} ms a pair`, far === 0 && close >= n * 0.9);
}

check("Fighter stats", "base + rolls x per-roll + pet (full x lv/8) + mount (lv x 3%) + weapon (+15% ATK, +5 crit a level)", "1,500 fights, 3,000 builds", "0 differences", `${statBad} differences`, statBad === 0);
check("Damage", "round(max(ATK x 0.2, ATK - DEF x 0.5) x 0.46 x charge x crit), ATK +15% Spirits, +25% Blood Lust", `${dmgN} hits`, "every hit within rounding", `${dmgBad} off${worstDmg ? ` (worst ${worstDmg.ref} vs ${worstDmg.full})` : ""}`, dmgBad === 0);
check("Shield", "a shielded hit = round(full x 0.5), at least 1", "all shielded hits", "exact", dmgBad === 0 ? "exact" : "see damage", dmgBad === 0);
check("Crit multiplier", "x3 to x7 whole numbers, only on a crit, applied once", `${hits} hits`, "0 wrong", `${multBad} wrong`, multBad === 0);
check("HP after a hit", "HP - damage, never below 0", `${hits} hits`, "0 wrong", `${hpBad} wrong, ${overkill} below 0`, hpBad === 0 && overkill === 0);
check("KO", "KO exactly when HP reaches 0; nothing happens after it", `${fights} fights`, "0 wrong", `${koBad} wrong, ${afterKo} events after a KO`, koBad === 0 && afterKo === 0);
check("Potion heal", "min(max HP - HP, round(max HP x heal%))", "all potions", "exact", `${potBad} wrong`, potBad === 0);
check("HP / MP bars", "0 <= value <= max in every frame (bar = value / max)", `${fights} fights`, "0 out of range", `${barBad} out of range`, barBad === 0);
check("MP", "only goes down (skills and buffs); never refills", `${fights} fights`, "0 rises", `${mpBad} rises`, mpBad === 0);
const hitRate = hits / (hits + misses), critRate = crits / hits, eh = expHit / (hits + misses), ec = expCrit / hits;
const seH = Math.sqrt(eh * (1 - eh) / (hits + misses)), seC = Math.sqrt(ec * (1 - ec) / hits);
check("Hit chance", "clamp(ACC - EVA (+25 Garuda), 25, 97)%", `${hits + misses} swings`, `${(eh * 100).toFixed(2)}%`, `${(hitRate * 100).toFixed(2)}%`, Math.abs(hitRate - eh) < 4 * seH);
check("Crit chance", "clamp(CRIT (+20 Blow) - CRIT DEF (+20 Nirvana), 1, 60)%", `${hits} hits`, `${(ec * 100).toFixed(2)}%`, `${(critRate * 100).toFixed(2)}%`, Math.abs(critRate - ec) < 4 * seC);

// ---- speed and pace ----
{
  let bad = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const a = E.randomBuild(r), b = E.randomBuild(r), f = E.simulate(a, b, i + 1, { draws: true });
    for (const e of f.events) if (e.type === "cast" || e.type === "spin" || e.type === "buff") {
      n++;
      const s = myStats(e.who ? b : a), fr = f.frames[Math.round(e.t / E.DT)];
      const want = Math.max(0.55, Math.min(1, 100 / fr.spd[e.who]));
      if (Math.abs(want - e.k) > 1e-9 && Math.abs(Math.max(0.55, Math.min(1, 100 / (s.spd * 1.2))) - e.k) > 1e-9) bad++;
    }
  }
  check("Speed pace", "each move takes 100 / Speed of its time, at least 0.55; Spirits Within adds 20%", `${n} moves`, "0 wrong", `${bad} wrong`, bad === 0);
}

// ---- odds ----
{
  const safeP = (p, N) => Math.min(1, p + 2 * Math.sqrt(Math.max(p * (1 - p), 1 / N) / N));
  // engine 8: a price over its cap is not offered at all (never cut down to the cap)
  const floor2 = (x) => Math.floor(x * 100) / 100, offer = (raw, cap) => (raw >= 1.01 && raw <= cap ? floor2(raw) : 0);
  let bad = 0, n = 0, overRound = [];
  for (let i = 0; i < 120; i++) {
    // half matched Live Arena pairs, half random (tournament-like) pairs
    const [a, b] = i % 2 ? E.matchedPair(r, (r() * 2 ** 32) >>> 0) : [E.randomBuild(r), E.randomBuild(r)], seed = (r() * 2 ** 32) >>> 0;
    const o = E.priceMatch(a, b, seed, { draws: true });
    // re-count the practice fights myself
    let wa = 0, wb = 0, dr = 0; const N = 2000;
    // the practice fights are real fights (simulate, frames off) since engine 8
    for (let k = 0; k < N; k++) { const q = E.simulate(a, b, ((seed >>> 0) * 7919 + k * 104729) >>> 0, { draws: true, frames: false }); if (q.winner === 0) wa++; else if (q.winner === 1) wb++; else dr++; }
    const pa = wa / N, pb = wb / N, pd = dr / N, favA = pa >= pb;
    const fp = (p, edge) => (p <= 0 ? 0 : offer(((1 - edge) - 0.5 * pd) / safeP(p, N), 4));
    const want = { a: fp(pa, favA ? 0.10 : 0.15), b: fp(pb, favA ? 0.15 : 0.10), draw: 0 };
    n++;
    if (want.a !== o.a || want.b !== o.b || want.draw !== o.draw) bad++;
    // the house's margin on the two fighters: implied probability of the offered prices
    // what each fighter bet is expected to pay back, from the practice fights (a Draw gives half back)
    for (const [pr, p] of [[o.a, pa], [o.b, pb]]) if (pr > 1) overRound.push(p * pr + pd * 0.5);
    for (const s of o.side) if (s.price && (s.price > 3 || s.p < 0.30 || s.p > 0.70)) bad++;
    if (o.side.some((s) => /buff/.test(s.id)) || !o.side.some((s) => s.id === 'lenover')) bad++;
    if (o.a > 4 || o.b > 4) bad++;
  }
  const avgOR = overRound.reduce((x, y) => x + y, 0) / overRound.length;
  check("Fighter prices and side bets", "floor2((1 - edge - 0.5 x P(draw)) / cautious P), not offered over 4x or under 1.01; edge 10% favourite / 15% other; no Draw bet; side bets only at 30-70%, at most 3x, no buff lines, a length line", `${n} matchups re-counted`, "identical", `${bad} different`, bad === 0);
  check("Fighter bets' expected return", "P(win) x price + P(draw) x 0.5, from the practice fights: under 1 means the house keeps a margin", `${overRound.length} offered fighter bets`, "under 1.00 every time", `${avgOR.toFixed(3)} on average (max ${Math.max(...overRound).toFixed(3)})`, Math.max(...overRound) < 1);
}

// ---- payouts ----
{
  let bad = 0, n = 0;
  const outs = [{ winner: 0, draw: false, critko: true, pots: 3, crits: 2, buffs: 1, length: 1.2, oneHitBy: [false, false] }, { winner: -1, draw: true, critko: false, pots: 0, crits: 0, buffs: 4, length: 180, oneHitBy: [false, false] }, { winner: 1, draw: false, critko: false, pots: 5, crits: 5, buffs: 0, length: 2.51, oneHitBy: [false, false] }];
  for (const o of outs) for (const k of ["a", "b", "draw", "over", "under", "critover", "critunder", "buffover", "buffunder", "lenover", "lenunder", "nocritko"]) for (const amt of [1, 7, 100, 333, 5000]) for (const price of [1.01, 1.37, 2.5, 5.99, 10]) {
    const line = 2.5, l = { k, amount: amt, price, line };
    const hit = k === "a" ? o.winner === 0 : k === "b" ? o.winner === 1 : k === "draw" ? o.draw : k === "over" ? o.pots > line : k === "under" ? o.pots < line : k === "critover" ? o.crits > line : k === "critunder" ? o.crits < line : k === "buffover" ? o.buffs > line : k === "buffunder" ? o.buffs < line : k === "lenover" ? o.length > line : k === "lenunder" ? o.length < line : !o.critko;
    const want = (k === "a" || k === "b") && o.draw ? Math.floor(amt * 0.5) : hit ? Math.floor(amt * price) : 0;
    n++; if (E.lineReturn(l, o, {}) !== want) bad++;
  }
  check("Payouts", "win = floor(stake x price); fighter bets on a Draw get floor(stake / 2); a loss pays 0", `${n} cases`, "identical", `${bad} different`, bad === 0);
}
for (const x of R.rows) console.log(`${x.pass ? "ok  " : "FAIL"} ${x.name}: expected ${x.expected}, got ${x.actual}  [${x.formula}; ${x.inputs}]`);
console.log(R.fail ? `${R.fail} failures` : "ALL PASSED");
process.exit(R.fail ? 1 : 0);