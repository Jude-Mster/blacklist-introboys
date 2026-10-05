// Blacklist Dragon's Fortune: a 5-reel, 3-row video slot with 10 paylines.
//   - Line wins read left to right from the first reel: 3, 4 or 5 of a kind.
//   - WILD (reels 2, 3 and 4) stands in for any symbol except the scatter.
//   - SCATTER pays anywhere: 3, 4 or 5 on screen pay 2x / 10x / 50x the whole bet
//     and award 8 / 12 / 20 free spins. Every win in a free spin is doubled, and free
//     spins can win more free spins.
//   - The whole spin (and any free spins it wins) is decided here in one go; the page
//     only plays it back.
// The return to players is exact: the reels' own return is worked out from the strips
// below (rawRtp), and every prize is scaled so the long-run return is (1 - house edge).
import { randInt } from './points.ts';

export const REELS: string[][] = [["scatter","water","sword","gold","wood","water","tiger","wood","gold","water","lantern","dragon","water","wood","gold","tiger","lantern","fire","wood","sword","gold","lantern","dragon","fire","sword","gold","fire","water","fire","wood"],["lantern","gold","tiger","water","scatter","sword","water","wood","fire","wood","fire","wild","fire","gold","water","lantern","gold","wild","water","tiger","sword","wood","gold","dragon","wild","lantern","water","fire","wood","gold"],["wood","fire","water","fire","sword","gold","fire","scatter","lantern","water","gold","wood","dragon","fire","wild","sword","gold","lantern","water","wild","wood","tiger","gold","lantern","water","tiger","gold","wood","wild","water"],["wood","wild","fire","sword","wild","wood","fire","gold","wood","water","sword","fire","lantern","tiger","gold","wild","gold","water","lantern","gold","water","fire","scatter","gold","wood","water","lantern","water","tiger","dragon"],["lantern","wood","scatter","lantern","fire","wood","water","fire","gold","wood","lantern","water","sword","lantern","dragon","sword","water","fire","wood","water","tiger","gold","fire","gold","sword","wood","tiger","water","gold","fire"]];
export const ROWS = 3;
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0]
];
// Prize for 3 / 4 / 5 of a kind, as a multiple of the LINE bet (the bet divided by 10 lines).
export const PAYTABLE: Record<string, number[]> = {
  dragon: [50, 200, 1000], tiger: [30, 100, 500], sword: [20, 60, 250], lantern: [15, 40, 150],
  gold: [10, 25, 100], wood: [8, 20, 80], water: [5, 15, 60], fire: [5, 10, 50]
};
export const SCATTER_PAY = { 3: 2, 4: 10, 5: 50 };     // multiple of the whole bet
export const SCATTER_SPINS = { 3: 8, 4: 12, 5: 20 };
export const FREE_MULTIPLIER = 2;
export const MAX_FREE_SPINS = 60;
export const MAX_WIN_X = 2000; // the most one paid spin (with its free spins) can return

const windowOf = (reel: string[], stop: number) => Array.from({ length: ROWS }, (_, r) => reel[(stop + r) % reel.length]);

// The reels' return before scaling, worked out exactly from the strips.
export function rawRtp() {
  const p = (i: number, s: string) => REELS[i].filter((x) => x === s).length / REELS[i].length;
  let lines = 0;
  for (const s of Object.keys(PAYTABLE)) {
    const q = [0, 1, 2, 3, 4].map((i) => p(i, s) + p(i, 'wild'));
    const first = p(0, s);
    lines += first * q[1] * q[2] * (1 - q[3]) * PAYTABLE[s][0] + first * q[1] * q[2] * q[3] * (1 - q[4]) * PAYTABLE[s][1] + first * q[1] * q[2] * q[3] * q[4] * PAYTABLE[s][2];
  }
  // Chance each reel shows a scatter, from every stop position.
  const show = REELS.map((reel) => reel.filter((_, stop) => windowOf(reel, stop).includes('scatter')).length / reel.length);
  const dist = [1, 0, 0, 0, 0, 0];
  for (const x of show) for (let k = 5; k >= 0; k--) dist[k] = dist[k] * (1 - x) + (k ? dist[k - 1] * x : 0);
  let pay = 0, spins = 0;
  for (const k of [3, 4, 5]) { pay += dist[k] * SCATTER_PAY[k]; spins += dist[k] * SCATTER_SPINS[k]; }
  const perSpin = lines + pay;                             // one spin with no multiplier
  const freeSpin = (FREE_MULTIPLIER * perSpin) / (1 - spins); // a free spin, counting the ones it wins
  return perSpin + spins * freeSpin;
}
export const RAW_RTP = rawRtp();
export const prizeScale = (edge: number) => (1 - edge) / RAW_RTP;

// One spin of the reels: what landed and what it pays, in units of the whole bet (before scaling).
export function spinOnce(stops = REELS.map((r) => randInt(r.length))) {
  const grid = REELS.map((reel, i) => windowOf(reel, stops[i])); // grid[reel][row]
  const lines = [];
  let lineUnits = 0;
  LINES.forEach((rows, n) => {
    const base = grid[0][rows[0]];
    if (!PAYTABLE[base]) return;
    let count = 1;
    while (count < 5 && (grid[count][rows[count]] === base || grid[count][rows[count]] === 'wild')) count++;
    if (count >= 3) { const mult = PAYTABLE[base][count - 3]; lineUnits += mult / LINES.length; lines.push({ line: n, symbol: base, count, mult }); }
  });
  const scatters = grid.reduce((a, col) => a + (col.includes('scatter') ? 1 : 0), 0);
  const scatterUnits = SCATTER_PAY[scatters] || 0;
  return { grid, lines, scatters, awarded: SCATTER_SPINS[scatters] || 0, units: lineUnits + scatterUnits, scatterUnits };
}

// Play one paid spin and every free spin it leads to.
export function resolveFortune(wager: number, edge: number) {
  const scale = prizeScale(edge);
  const cap = wager * MAX_WIN_X;
  const spins = [];
  let payout = 0, units = 0, freeLeft = 0, freeWon = 0, paid = false;
  while (!paid || (freeLeft > 0 && payout < cap)) {
    const free = paid;
    if (free) freeLeft--;
    paid = true;
    const s = spinOnce();
    const mult = free ? FREE_MULTIPLIER : 1;
    const award = Math.min(s.awarded, MAX_FREE_SPINS - freeWon);
    freeWon += award; freeLeft += award;
    // Points are whole numbers, so the running total is rounded down once (not prize by
    // prize, which would shave more off small bets). Each spin's win is how far the
    // total moved.
    units += s.units * mult;
    const total = Math.min(cap, Math.floor(wager * units * scale + 1e-9));
    const win = total - payout;
    payout = total;
    const lines = s.lines.map((l) => ({ ...l, win: Math.round((wager * l.mult * mult * scale) / LINES.length) }));
    spins.push({ grid: s.grid, free, lines, scatter: { count: s.scatters, win: Math.round(wager * s.scatterUnits * mult * scale), spins: award }, win });
  }
  const best = spins.flatMap((s) => s.lines).sort((a, b) => b.win - a.win)[0] || null;
  return {
    won: payout > 0, payout,
    outcome: { spins, free_spins: freeWon, multiplier: Math.round((payout / wager) * 100) / 100, scale, best: best ? { symbol: best.symbol, count: best.count } : null }
  };
}