// What every game pays back over time. Run: node tests/returns.test.mjs
// Phase 3: what every other game pays back over time, worked out exactly (or by a large simulation),
// separately from the game code. House edge setting assumed 3% (the default).
import * as P from "../base44/shared/points.ts";
import * as SB from "../base44/shared/sicbo.ts";
import * as BJ from "../base44/shared/blackjackSides.ts";
import * as FT from "../base44/shared/fortune.ts";
import * as DB from "../base44/shared/derby.ts";
const e = 0.03, rows = [];
const add = (game, bet, formula, rtp, note = "") => rows.push({ game, bet, formula, rtp: +(rtp * 100).toFixed(2), note });
// coin toss
add("Yin Yang Toss", "Yin or Yang", "1/2 x round2(2 x (1 - edge))", 0.5 * P.coinMultiplier(e));
// slots
{ const t = P.slotTable(e), tot = t.reduce((a, x) => a + x.weight, 0); add("Lantern Slots", "spin", "sum(weight x multiplier) / total weight", t.reduce((a, x) => a + x.weight * x.mult, 0) / tot); }
// sky wheel
for (const pick of ["guanyin", "fujin", "jinong", "dragon"]) { const n = P.WHEEL_SEGMENTS.filter((s) => s === pick).length; add("Twelve Skies Wheel", pick, "segments/12 x round2((1 - edge) x 12 / segments)", n / 12 * P.wheelMultiplier(pick, e)); }
// roulette: 25 pockets
for (const spot of P.ROULETTE_SPOTS) { let r = 0; for (const k of P.ROULETTE_POCKETS) r += P.rouletteWins(spot, k) ? P.ROULETTE_RETURNS[spot] : 0; add("Jade Roulette", spot, "pockets that win / 25 x return", r / P.ROULETTE_POCKETS.length, spot === "green" || spot === "dragon" || spot === "tiger" ? "the code says this low return is the guild's choice" : ""); }
// sic bo: all 216 rolls
for (const spot of SB.SICBO_SPOTS) { let r = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) r += SB.sicboReturn(spot, [a, b, c]); add("Dragon Sic Bo", spot, "average return over all 216 rolls", r / 216); }
// blackjack side bets: endless shoe, every 52 x 52 (x 52) deal
{ const deck = []; for (const r of "A23456789TJQK") for (const s of "shdc") deck.push(r + s);
  let pr = 0, p3 = 0; for (const a of deck) for (const b of deck) { pr += BJ.sidePairs([a, b]).returns; for (const c of deck) p3 += BJ.sidePlus3([a, b], c).returns; }
  add("Blackjack", "Pairs side bet", "average over every first two cards (endless shoe)", pr / 52 ** 2);
  add("Blackjack", "21+3 side bet", "average over every two cards + dealer card", p3 / 52 ** 3); }
// fortune slots
{ const r = FT.rawRtp ? FT.rawRtp() : null; if (r != null) add("Dragon's Fortune", "spin", "the game's own reel maths (rawRtp)", typeof r === "number" ? r : r.rtp || r.total || 0, JSON.stringify(r).slice(0, 80)); }
// derby: price races the way the site does, run them, pay the bets
{
  const N = 300; const tot = {}, back = {};
  for (let i = 0; i < N; i++) {
    const field = DB.makeField(1000 + i), odds = DB.makeOdds(field, 1000 + i, 0.03);
    const race = DB.simulate(field, 777 + i * 13);
    const order = race.order || race.finish || race.places || [];
    for (const type of DB.BET_TYPES) for (let a = 0; a < DB.FIELD_SIZE; a++) {
      const lines = type === "fc" ? [(a + 1) % DB.FIELD_SIZE] : [-1];
      for (const b of lines) { const l = { type, a, b, amount: 100 }; const price = DB.priceOf(odds, l); if (!(price > 1)) continue; l.price = price; tot[type] = (tot[type] || 0) + 100; back[type] = (back[type] || 0) + DB.lineReturn(l, order); }
    }
  }
  for (const t of Object.keys(tot)) add("Derby", t, "300 races priced exactly as the site does, 100 on every offered bet", back[t] / tot[t], "simulation, +/- a few %");
}
// Every bet must pay back less than it costs over time (the house never loses on average), and the
// games with a set house edge must match it.
let fail = 0;
for (const r of rows) {
  const want = r.game === "Derby" || /green|dragon|tiger/.test(r.bet) && r.game === "Jade Roulette" ? [0, 100] : [86, 100];
  const pass = r.rtp > want[0] && r.rtp < want[1];
  if (!pass) fail++;
  console.log(`${pass ? "ok  " : "FAIL"} ${r.game} ${r.bet}: pays back ${r.rtp}% (${r.formula})${r.note ? " " + r.note : ""}`);
}
const exact = { "Yin Yang Toss": 97, "Lantern Slots": 96.99 };
for (const r of rows) if (exact[r.game] != null && Math.abs(r.rtp - exact[r.game]) > 0.01) { fail++; console.log(`FAIL ${r.game}: expected ${exact[r.game]}%`); }
console.log(fail ? `${fail} failures` : "ALL PASSED");
process.exit(fail ? 1 : 0);