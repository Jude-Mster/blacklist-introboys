// Blacklist Derby: the horses, the track, the race engine, the odds and the payouts.
//
// The server runs every race. When a round opens it draws the field and prices the bets
// (both worked out from the round number alone, so two requests opening the same round
// at the same moment always agree), then runs the race once with a secret random seed.
// The finishing order and a compact timeline of every horse's position are kept on the
// table row and only sent out once betting has closed. Every screen then plays back that
// same timeline, so every member sees the same race and the same winner.

export const DERBY_NAME = 'Blacklist Derby';
export const DIST = 1600;            // metres
export const LAP = 2200;             // the oval
export const TL = 430;               // each straight
export const TR = (LAP - 2 * TL) / (2 * Math.PI); // bend radius at the rail
export const LANE_M = 1.6;           // width of one running lane
export const FIN_D = 120;            // the finish, along the lap from the middle of the home straight
export const FIELD_SIZE = 8;
export const SAMPLE_S = 0.5;         // timeline: one position per horse every half second of race time
export const PLAY = 1.4;             // races play back 1.4x faster than real time
export const DERBY_EDGE = 0.10;      // at least 10% kept by the house on the live track
export const CAP = { win: 8, top2: 4, top3: 2.5, fc: 25 }; // highest price per bet type
export const MIN_PRICE = 1.05;       // a bet that would pay less than this is not offered
export const BET_TYPES = ['win', 'top2', 'top3', 'fc'];

// The stable. `base` is each horse's ability (74 to 90); a race adds a little form to it.
export const STABLE = [
  { id: 0, name: 'Crimson Seal', silk: '#ca1622', cap: '#ffffff', coat: '#5a3119', pat: 'sash', sock: 1, base: 88 },
  { id: 1, name: 'Jade Tempest', silk: '#2f9e6a', cap: '#0d3b26', coat: '#7a4220', pat: 'hoops', sock: 0, base: 84 },
  { id: 2, name: 'Black Lotus', silk: '#1b1b1b', cap: '#d4a72c', coat: '#2a1e18', pat: 'stars', sock: 2, blink: 1, base: 86 },
  { id: 3, name: "Fujin's Gale", silk: '#d4a72c', cap: '#ca1622', coat: '#8b5a2b', pat: 'halves', sock: 0, base: 82 },
  { id: 4, name: 'Guanyin Mist', silk: '#3e7fb8', cap: '#ffffff', coat: '#9d9d9d', pat: 'chevron', sock: 0, base: 80 },
  { id: 5, name: 'Iron Ingot', silk: '#8c8c8c', cap: '#1b1b1b', coat: '#4a2c1a', pat: 'hoops', sock: 1, base: 76 },
  { id: 6, name: 'Lantern Runner', silk: '#e2731f', cap: '#1b1b1b', coat: '#6b3a1c', pat: 'plain', sock: 2, blink: 1, base: 78 },
  { id: 7, name: "Dragon's Due", silk: '#7a3fb0', cap: '#d4a72c', coat: '#3a2516', pat: 'sash', sock: 0, base: 85 },
  { id: 8, name: 'Twelve Skies', silk: '#f2f2f2', cap: '#3e7fb8', coat: '#5c3a24', pat: 'stars', sock: 1, base: 87 },
  { id: 9, name: 'Maple Shadow', silk: '#9b2c2c', cap: '#f2f2f2', coat: '#7d5132', pat: 'chevron', sock: 1, blink: 1, base: 79 },
  { id: 10, name: 'Tiger Ledger', silk: '#6f8a2a', cap: '#f2f2f2', coat: '#a06a3a', pat: 'halves', sock: 2, base: 81 },
  { id: 11, name: 'Wuxen Comet', silk: '#1f6f8b', cap: '#d4a72c', coat: '#b8b8b8', pat: 'plain', sock: 0, base: 83 }
];
const STYLES = ['front', 'stalker', 'closer'];

// A small, fast, repeatable random number generator.
export function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Mix two numbers into one 32-bit seed.
const mix = (a: number, b: number) => (Math.imul((a >>> 0) ^ 0x9E3779B9, 2654435761) ^ Math.imul((b >>> 0) + 0x7F4A7C15, 1597334677)) >>> 0;

// Where the race distance `pos` (metres from the start) is on the oval: the bend radius, or 0 on a straight.
export function bendAt(pos: number, dist = DIST) {
  let d = (((FIN_D - dist + pos) % LAP) + LAP) % LAP;
  const half = TL / 2, arc = Math.PI * TR;
  if (d < half) return 0; d -= half;
  if (d < arc) return TR; d -= arc;
  if (d < TL) return 0; d -= TL;
  if (d < arc) return TR;
  return 0;
}

// ---------- the field for a round ----------
// form: each horse's last three finishes (1 = won), newest first, from real past races.
export function makeField(round: number, form: Record<string, number[]> = {}) {
  const r = mulberry32(mix(round, 0xD3B1));
  const ids = STABLE.map((h) => h.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, FIELD_SIZE).map((id, k) => {
    const h = STABLE[id];
    const rating = Math.max(70, Math.min(94, h.base + Math.round((r() - 0.5) * 6)));
    return { no: k + 1, id: h.id, rating, style: STYLES[Math.floor(r() * 3)], form: (form[String(h.id)] || []).slice(0, 3) };
  });
}

// ---------- the race engine ----------
// Real units (metres, seconds). Speed by running style, a final kick, fatigue, traffic
// (a blocked horse has to wait or switch out) and the extra ground run wide on the bends.
export function simulate(field, seed: number, dist = DIST) {
  const rnd = mulberry32(seed >>> 0), dt = 0.1;
  const hs = field.map((f, i) => ({
    i, style: f.style, vc: 16.55 + (f.rating - 80) * 0.016, stamina: rnd(), kick: rnd(), jump: rnd(),
    knots: Array.from({ length: 64 }, () => rnd() * 2 - 1), pos: 0, v: 0, lane: i, laneT: i, fin: 0,
    P: [0] as number[], Ln: [i] as number[]
  }));
  const smooth = (k: number[], x: number) => { const i = Math.floor(x), f = x - i, a = k[i % k.length], b = k[(i + 1) % k.length]; const u = (1 - Math.cos(f * Math.PI)) / 2; return a + (b - a) * u; };
  const kickFrom = dist - Math.min(450, dist * 0.3);
  const pace = hs.reduce((a, h) => a + h.vc, 0) / hs.length;
  let t = 0;
  while (t < 300) {
    t += dt; let done = true;
    for (const h of hs) {
      const f = h.pos / dist; let target;
      if (h.fin) target = Math.max(6, h.v * 0.975);
      else {
        const early = h.style === 'front' ? 1.008 : h.style === 'stalker' ? 1.0 : 0.994;
        const cruise = pace + (h.vc - pace) * 0.15;
        if (h.pos < dist * 0.3) target = cruise * early;
        else if (h.pos < kickFrom) target = cruise * (1 + (early - 1) * 0.3);
        else target = h.vc * (1.035 + 0.006 * h.kick + (h.style === 'closer' ? 0.012 : 0));
        target *= 1 + smooth(h.knots, t * 0.12) * 0.012;
        const tired = Math.max(0, f - 0.5) * ((1 - h.stamina) * 0.03 + Math.max(0, pace - h.vc) / pace * 1.2) + (h.style === 'front' && f > 0.7 ? (f - 0.7) * 0.035 : 0);
        target *= 1 - tired;
        let ahead = null, gap = 1e9;
        for (const o of hs) { if (o === h || o.fin) continue; const d = o.pos - h.pos; if (d > 0 && d < 3.2 && Math.abs(o.lane - h.lane) < 0.85 && d < gap) { gap = d; ahead = o; } }
        if (ahead && ahead.v < target) {
          const want = Math.round(h.laneT) + 1;
          const free = want <= 9 && !hs.some((o) => o !== h && Math.abs(o.pos - h.pos) < 3.4 && Math.abs(o.lane - want) < 0.85);
          if (free) h.laneT = want; else target = Math.min(target, ahead.v);
        } else if (h.laneT > 0) {
          const want = Math.round(h.laneT) - 1;
          const free = !hs.some((o) => o !== h && o.pos - h.pos > -3.0 && o.pos - h.pos < 5 && Math.abs(o.lane - want) < 0.9);
          if (free && rnd() < 0.08) h.laneT = want;
        }
      }
      const acc = h.pos < 30 ? 6 + h.jump * 3 : 1.8;
      h.v += Math.max(-1.6 * dt, Math.min(acc * dt, target - h.v));
      if (h.pos < 2 && t < 0.15 + (1 - h.jump) * 0.35) h.v = 0; // slow out of the stalls
      h.lane += Math.max(-0.7 * dt, Math.min(0.7 * dt, h.laneT - h.lane));
      const R = bendAt(h.pos, dist);
      const prev = h.pos; h.pos += h.v * dt * (R ? R / (R + h.lane * LANE_M) : 1);
      if (!h.fin && h.pos >= dist) h.fin = t - dt + dt * (dist - prev) / (h.pos - prev);
      h.P.push(h.pos); h.Ln.push(h.lane);
      if (!h.fin || h.pos < dist + 60) done = false;
    }
    if (done) break;
  }
  // Order of finish: the earlier finish time first (a dead heat goes to the lower number).
  // Sorted on the finish times exactly as they are sent to the screens (whole milliseconds),
  // so a photo finish shows the same winner on screen as the one that is paid. A horse that
  // somehow never finished goes last.
  const finMs = (h) => (h.fin > 0 ? Math.round(h.fin * 1000) : Number.MAX_SAFE_INTEGER);
  const order = hs.map((h) => h.i).sort((a, b) => finMs(hs[a]) - finMs(hs[b]) || a - b);
  return { dt, hs, order };
}

// The compact timeline sent to the screens: positions in decimetres and lanes in hundredths,
// one sample every SAMPLE_S seconds, plus exact finish times in milliseconds.
export function timelineOf(race) {
  const step = Math.round(SAMPLE_S / race.dt);
  const P = race.hs.map((h) => { const out = []; for (let k = 0; k < h.P.length; k += step) out.push(Math.round(h.P[k] * 10)); return out; });
  const L = race.hs.map((h) => { const out = []; for (let k = 0; k < h.Ln.length; k += step) out.push(Math.round(h.Ln[k] * 100)); return out; });
  return { v: 1, dt: SAMPLE_S, P, L, fin: race.hs.map((h) => (h.fin > 0 ? Math.round(h.fin * 1000) : 300000)), order: race.order };
}
// Seconds of race time from the off until the last horse has pulled up.
export const raceLength = (tl) => Math.max(...tl.fin) / 1000 + 3;

// ---------- odds ----------
// Every race of a round is priced from many practice runs of that same field (seeded by
// the round number, so the prices never depend on who asks first). Practice runs are a
// sample, so each chance is taken at the cautious end of what the sample allows (an upper
// estimate), and a forecast is also checked against the standard formula built from the
// win chances; the higher of the two is used. On top of that the house keeps at least
// DERBY_EDGE, each bet type has a ceiling, and a bet that would pay under MIN_PRICE is not
// offered at all. Together this means no bet is worth more than it costs over time.
export const ODDS_RUNS = 500;
export function makeOdds(field, round: number, edge: number, runs = ODDS_RUNS, dist = DIST) {
  const n = field.length, win = Array(n).fill(0), top2 = Array(n).fill(0), top3 = Array(n).fill(0), fc = Array(n * n).fill(0);
  for (let s = 0; s < runs; s++) {
    const o = simulate(field, mix(round, 1000 + s), dist).order;
    win[o[0]]++; top2[o[0]]++; top2[o[1]]++; top3[o[0]]++; top3[o[1]]++; top3[o[2]]++;
    fc[o[0] * n + o[1]]++;
  }
  const e = Math.max(DERBY_EDGE, Math.min(0.2, Number(edge) || 0));
  const upper = (count: number) => { const p = count / runs; return Math.min(1, p + 2.33 * Math.sqrt((p * (1 - p)) / runs) + 1.5 / runs); };
  const priceFor = (p: number, cap: number) => {
    const v = Math.floor(((1 - e) / p) * 10) / 10; // rounded down: never in the bettor's favour
    if (v < MIN_PRICE) return 0;
    return Math.min(cap, v);
  };
  const pw = win.map(upper);
  return {
    win: win.map((c) => priceFor(upper(c), CAP.win)),
    top2: top2.map((c) => priceFor(upper(c), CAP.top2)),
    top3: top3.map((c) => priceFor(upper(c), CAP.top3)),
    fc: fc.map((c, k) => {
      const a = Math.floor(k / n), b2 = k % n;
      if (a === b2) return 0;
      const harville = pw[a] * Math.min(1, pw[b2] / Math.max(0.05, 1 - pw[a]));
      return priceFor(Math.max(upper(c), Math.min(1, harville)), CAP.fc);
    })
  };
}

// ---------- bets ----------
export function priceOf(odds, line) {
  if (!odds || !line) return 0;
  const n = (odds.win || []).length;
  if (line.type === 'fc') return line.a !== line.b ? Number(odds.fc[line.a * n + line.b]) || 0 : 0;
  return Number((odds[line.type] || [])[line.a]) || 0;
}
export function validLine(line, n = FIELD_SIZE) {
  if (!line || !BET_TYPES.includes(line.type)) return false;
  const okHorse = (x) => Number.isInteger(x) && x >= 0 && x < n;
  if (!okHorse(line.a)) return false;
  if (line.type === 'fc' && (!okHorse(line.b) || line.b === line.a)) return false;
  return Number.isInteger(line.amount) && line.amount > 0;
}
export function lineWins(line, order: number[]) {
  if (line.type === 'win') return order[0] === line.a;
  if (line.type === 'top2') return order.slice(0, 2).includes(line.a);
  if (line.type === 'top3') return order.slice(0, 3).includes(line.a);
  if (line.type === 'fc') return order[0] === line.a && order[1] === line.b;
  return false;
}
// Points returned for one line (stake included), rounded down.
export const lineReturn = (line, order: number[]) => (lineWins(line, order) ? Math.floor(line.amount * line.price) : 0);
export const betReturn = (lines, order: number[]) => (lines || []).reduce((a, l) => a + lineReturn(l, order), 0);

export const TYPE_NAME = { win: 'Win', top2: 'Top 2', top3: 'Top 3', fc: 'Forecast' };
export const describeLine = (line, field) => {
  const h = (i) => { const f = field && field[i]; return f ? `#${f.no} ${STABLE[f.id].name}` : `#${i + 1}`; };
  return line.type === 'fc' ? `${TYPE_NAME.fc} ${h(line.a)} then ${h(line.b)}` : `${TYPE_NAME[line.type]} ${h(line.a)}`;
};