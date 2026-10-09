// Blacklist Derby: what the browser needs to know about the track and the bets.
// The server (base44/shared/derby.ts) runs every race and decides every result; the
// track shape here must match it so the horses are drawn in the right place.

export const DERBY_NAME = "Blacklist Derby";
export const LAP = 2200;                         // metres round the oval
export const TL = 430;                           // each straight
export const TR = (LAP - 2 * TL) / (2 * Math.PI); // bend radius at the rail
export const TW = 22;                            // width of the racing surface
export const LANE_M = 1.6;                       // one running lane
export const FIN_D = 120;                        // the finish, along the lap from the middle of the home straight
export const startD = (dist) => FIN_D - dist;

// A point `off` metres out from the inside rail, `d` metres along the lap, with the
// direction of running (tx, tz). The lap starts in the middle of the home straight and
// runs left to right in front of the grandstand.
export function trackAt(d, off) {
  d = ((d % LAP) + LAP) % LAP;
  const half = TL / 2, arc = Math.PI * TR, r = TR + off;
  if (d < half) return { x: d, z: -r, tx: 1, tz: 0 };
  d -= half;
  if (d < arc) { const a = -Math.PI / 2 + (d / arc) * Math.PI; return { x: half + Math.cos(a) * r, z: Math.sin(a) * r, tx: -Math.sin(a), tz: Math.cos(a) }; }
  d -= arc;
  if (d < TL) return { x: half - d, z: r, tx: -1, tz: 0 };
  d -= TL;
  if (d < arc) { const a = Math.PI / 2 + (d / arc) * Math.PI; return { x: -half + Math.cos(a) * r, z: Math.sin(a) * r, tx: -Math.sin(a), tz: Math.cos(a) }; }
  d -= arc;
  return { x: -half + d, z: -r, tx: 1, tz: 0 };
}

export const TYPES = [
  { id: "win", name: "Win", what: "to win" },
  { id: "top2", name: "Top 2", what: "to finish 1st or 2nd" },
  { id: "top3", name: "Top 3", what: "to finish in the top 3" },
  { id: "fc", name: "Forecast", what: "1st and 2nd, in that order" }
];
export const TYPE_NAME = Object.fromEntries(TYPES.map((t) => [t.id, t.name]));
export const STYLE_NAME = { front: "Front runner", stalker: "Stalker", closer: "Closer" };
export const PLACE = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
export const lineKey = (l) => `${l.type}:${l.a}:${l.type === "fc" ? l.b : ""}`;
export function priceOf(odds, type, a, b) {
  if (!odds) return 0;
  const n = (odds.win || []).length;
  if (type === "fc") return a !== b && b >= 0 ? Number(odds.fc[a * n + b]) || 0 : 0;
  return Number((odds[type] || [])[a]) || 0;
}
export function lineWins(l, order) {
  if (!order) return false;
  if (l.type === "win") return order[0] === l.a;
  if (l.type === "top2") return order.slice(0, 2).includes(l.a);
  if (l.type === "top3") return order.slice(0, 3).includes(l.a);
  return order[0] === l.a && order[1] === l.b;
}
export const lineReturn = (l, order) => (lineWins(l, order) ? Math.floor(l.amount * l.price) : 0);
export const isLight = (c) => c === "#f2f2f2" || c === "#d4a72c" || c === "#ffffff";

// ----- the race timeline sent by the server -----
// P: positions in decimetres, L: lanes in hundredths, one sample every `dt` seconds of race
// time; fin: finish times in milliseconds.
export function makeTimeline(raw) {
  if (!raw || !Array.isArray(raw.P) || !raw.P.length) return null;
  const dt = Number(raw.dt) || 0.5;
  const P = raw.P.map((a) => Float32Array.from(a, (v) => v / 10));
  const L = raw.L.map((a) => Float32Array.from(a, (v) => v / 100));
  const fin = raw.fin.map((v) => v / 1000);
  const sample = (arr, t) => { const x = t / dt, k = Math.floor(x); if (k <= 0) return arr[0]; if (k >= arr.length - 1) return arr[arr.length - 1]; return arr[k] + (arr[k + 1] - arr[k]) * (x - k); };
  const order = fin.map((_, i) => i).sort((a, b) => fin[a] - fin[b] || a - b);
  return {
    dt, fin, order, n: P.length,
    length: Math.max(...fin) + 3,
    pos: (i, t) => sample(P[i], Math.max(0, t)),
    lane: (i, t) => sample(L[i], Math.max(0, t)),
    speed: (i, t) => { const a = sample(P[i], Math.max(0, t - 0.25)), b = sample(P[i], Math.max(0, t + 0.25)); return (b - a) / 0.5; }
  };
}
// The running order at race time t: finished horses in finishing order, then the rest by position.
export function orderAt(tl, t) {
  if (!tl) return [];
  const fin = tl.order.filter((i) => tl.fin[i] <= t);
  const live = [...Array(tl.n).keys()].filter((i) => !fin.includes(i)).sort((a, b) => tl.pos(b, t) - tl.pos(a, t));
  return [...fin, ...live];
}
export function lengthsText(seconds) {
  const L = (seconds * 17) / 2.4;
  return L < 0.08 ? "a nose" : L < 0.2 ? "a short head" : L < 0.35 ? "a head" : L < 0.6 ? "a neck" : `${L.toFixed(1)} lengths`;
}
export const raceClock = (s) => { const v = Math.max(0, s), m = Math.floor(v / 60); return `${m}:${(v - m * 60).toFixed(1).padStart(4, "0")}`; };