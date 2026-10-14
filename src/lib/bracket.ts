// @ts-nocheck  (plain JavaScript; the page imports this same file as src/lib/bracket.js)
// 6.22 tournament brackets: seeded double elimination.
//
// Seeding: the field is ranked strongest first (from practice fights between the real builds) and placed
// with the standard seed order, so #1 and #2 can only meet in the final, #1-#4 not before the semi-finals,
// and the top seeds get any byes.
// Double elimination: a fighter is out after two losses. Losing in the winners' bracket drops you into the
// losers' bracket; the winners' champion meets the losers' champion in the grand final. If the losers'
// champion wins it, both have lost once, so a deciding grand final reset is played.
// Refs: { s: i } = fighter i of the field; { w: no } = the winner of match no; { l: no } = its loser.

// Seed positions for a bracket of size P (a power of 2): position -> seed (1 = strongest).
export function seedPositions(P) {
  let pos = [1];
  while (pos.length < P) {
    const n = pos.length * 2;
    pos = pos.flatMap((x) => [x, n + 1 - x]);
  }
  return pos;
}

// order: field indices, strongest first. Returns { matches, size, format: "double" }.
export function drawDouble(order) {
  const n = order.length;
  let P = 2; while (P < n) P *= 2;
  const k = Math.log2(P);
  const nodes = [];   // { id, sec, r, refs, reset }
  const add = (sec, r, refs, extra = {}) => { const id = nodes.length; nodes.push({ id, sec, r, refs, ...extra }); return id; };
  const seedRef = (seed) => (seed <= n ? { s: order[seed - 1] } : null);
  // winners' bracket
  const pos = seedPositions(P), W = [];
  let prev = [];
  for (let j = 0; j < P / 2; j++) prev.push(add("W", 1, [seedRef(pos[2 * j]), seedRef(pos[2 * j + 1])]));
  W.push(prev);
  for (let r = 2; r <= k; r++) {
    const cur = [];
    for (let j = 0; j < prev.length; j += 2) cur.push(add("W", r, [{ w: prev[j] }, { w: prev[j + 1] }]));
    W.push(cur); prev = cur;
  }
  // losers' bracket (built per round, then everything is put in playing order below)
  const L = [];   // L[round-1] = ids
  let lbChamp = null;
  if (k === 1) lbChamp = { l: W[0][0] };
  else {
    let surv = [];
    const r1 = [];
    for (let j = 0; j < W[0].length; j += 2) r1.push(add("L", 1, [{ l: W[0][j] }, { l: W[0][j + 1] }]));
    L.push(r1); surv = r1;
    for (let i = 2; i <= k; i++) {
      // survivors meet the fighters who just lost in winners' round i (in reverse order every other
      // round, so two fighters who met early don't meet again straight away)
      let drop = W[i - 1].map((id) => ({ l: id }));
      if (i % 2 === 0) drop = drop.slice().reverse();
      const even = surv.map((id, j) => add("L", 2 * (i - 1), [{ w: id }, drop[j]]));
      L.push(even); surv = even;
      if (i < k) {
        const odd = [];
        for (let j = 0; j < surv.length; j += 2) odd.push(add("L", 2 * (i - 1) + 1, [{ w: surv[j] }, { w: surv[j + 1] }]));
        L.push(odd); surv = odd;
      }
    }
    lbChamp = { w: surv[0] };
  }
  const gf = add("G", 1, [{ w: W[k - 1][0] }, lbChamp]);
  const gf2 = add("G", 2, [{ w: gf }, { l: gf }], { reset: true });

  // playing order: W1, L1, W2, L2, L3, W3, L4, L5, ... W(k), L(2k-2), grand final, reset
  const order2 = [];
  order2.push(...W[0]);
  if (L[0]) order2.push(...L[0]);
  for (let i = 2; i <= k; i++) {
    order2.push(...W[i - 1]);
    for (const lr of [2 * (i - 1), 2 * (i - 1) + 1]) if (L[lr - 1]) order2.push(...L[lr - 1]);
  }
  order2.push(gf, gf2);

  // byes: a match with only one real fighter isn't played; that fighter goes straight on and no one
  // drops to the losers' bracket from it
  const pass = new Map();   // id -> { win: ref|null, lose: null }
  const real = (ref) => {
    if (!ref) return null;
    if (ref.s !== undefined) return ref;
    const id = ref.w !== undefined ? ref.w : ref.l;
    if (pass.has(id)) return ref.w !== undefined ? pass.get(id).win : null;
    return ref;
  };
  const kept = [];
  for (const id of order2) {
    const nd = nodes[id], a = real(nd.refs[0]), b = real(nd.refs[1]);
    if (a && b) { kept.push({ ...nd, refs: [a, b] }); continue; }
    pass.set(id, { win: a || b || null });
  }
  // number the matches in playing order and point the refs at those numbers
  const no = new Map(kept.map((nd, i) => [nd.id, i + 1]));
  const fix = (ref) => (ref.s !== undefined ? { s: ref.s } : ref.w !== undefined ? { w: no.get(ref.w) } : { l: no.get(ref.l) });
  const lastR = { W: Math.max(...kept.filter((x) => x.sec === "W").map((x) => x.r)), L: Math.max(0, ...kept.filter((x) => x.sec === "L").map((x) => x.r)) };
  const matches = kept.map((nd, i) => ({
    no: i + 1, sec: nd.sec, round: nd.r, refs: nd.refs.map(fix), reset: !!nd.reset,
    stage: stageName(nd.sec, nd.r, lastR, nd.reset)
  }));
  return { matches, size: P, format: "double" };
}
export function stageName(sec, r, last, reset) {
  if (sec === "G") return reset ? "Grand final reset" : "Grand final";
  if (sec === "W") return r === last.W ? "Winners' final" : r === last.W - 1 ? "Winners' semi-final" : `Winners' round ${r}`;
  return r === last.L ? "Losers' final" : r === last.L - 1 ? "Losers' semi-final" : `Losers' round ${r}`;
}

// Who is in each match, given each match's winner (actual or predicted): winners[no] = field index.
// Returns [[a, b]] by match number (null where not known yet). A reset that isn't needed is marked "skip".
export function sidesOf(ms, winners) {
  const out = {}, lose = {};
  const who = (ref) => (ref.s !== undefined ? ref.s : ref.w !== undefined ? (winners[ref.w] ?? null) : (lose[ref.l] ?? null));
  for (const m of ms) {
    const a = who(m.refs[0]), b = who(m.refs[1]);
    if (m.reset) {
      const gf = ms.find((x) => x.no === m.refs[0].w), gfA = out[gf.no] ? out[gf.no][0] : null, w = winners[gf.no];
      if (w != null && gfA != null && w === gfA) { out[m.no] = "skip"; continue; }   // the winners' champion won: no reset
    }
    out[m.no] = [a, b];
    const w = winners[m.no];
    if (w != null && a != null && b != null) lose[m.no] = w === a ? b : a;
  }
  return out;
}
// The champion from a set of winners (actual or predicted), or null.
export function championOf(ms, winners) {
  const sides = sidesOf(ms, winners), reset = ms.find((m) => m.reset), gf = ms.find((m) => m.sec === "G" && !m.reset);
  if (!gf) return null;
  if (reset && sides[reset.no] !== "skip") return winners[reset.no] ?? null;
  return winners[gf.no] ?? null;
}
// Places 1-4 from the fought bracket: champion, runner-up, loser of the losers' final, loser of the
// losers' semi-final.
export function placesDouble(ms) {
  const done = (m) => m && m.winner != null && !m.skipped;
  const reset = ms.find((m) => m.reset), gf = ms.find((m) => m.sec === "G" && !m.reset);
  const last = done(reset) ? reset : gf;
  if (!done(last)) return [];
  const out = [last.winner, last.loser];
  const lf = ms.find((m) => m.stage === "Losers' final"), ls = ms.find((m) => m.stage === "Losers' semi-final");
  if (done(lf)) out.push(lf.loser);
  if (done(ls)) out.push(ls.loser);
  return out.filter((x, i, a) => x != null && a.indexOf(x) === i);
}
// How a prediction did: picks[no] = predicted winner. Perfect = every match played went as picked
// (which also means the same fighters met) and the reset was played only if it was predicted.
export function scorePicks(ms, picks) {
  let right = 0, played = 0, perfect = true;
  for (const m of ms) {
    if (m.skipped) { if (picks[m.no] != null) perfect = false; continue; }
    played++;
    if (picks[m.no] != null && picks[m.no] === m.winner) right++; else perfect = false;
  }
  return { right, played, perfect };
}
// Check a prediction against the bracket: one pick per match that will be played if it goes as
// predicted, each pick one of that match's two predicted fighters. Returns the clean picks or throws.
export function cleanPicks(ms, raw) {
  const picks = {};
  for (const m of ms) { const v = raw && raw[m.no]; if (v != null && Number.isInteger(Number(v))) picks[m.no] = Number(v); }
  const sides = sidesOf(ms, picks);
  const out = {};
  for (const m of ms) {
    const s = sides[m.no];
    if (s === "skip") continue;
    const p = picks[m.no];
    if (p == null || !s || (p !== s[0] && p !== s[1])) return { ok: false, missing: m.no };
    out[m.no] = p;
  }
  return { ok: true, picks: out, champion: championOf(ms, out) };
}
