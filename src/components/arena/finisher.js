// 6.25 preview: the dramatic slow-motion finisher.
//
// Only how the fight is SHOWN changes: the fight itself (every hit, the winner, the length the bets are
// settled on) is exactly the same. The screen's clock is stretched around the killing blow:
//
//   normal speed ─ ramp down ─ the wind-up and the blow at 1/8 speed ─ a frozen impact frame ─ the fall at
//   ~1/4 speed ─ ramp back to normal ─ the result
//
// buildFinisher(fight) returns the stretch for one fight (or null when there is no knockout), with:
//   fightAt(s)    the fight's own time for a time on the screen (both counted from "FIGHT!")
//   rateAt(s)     how fast the fight moves at that moment (1 = normal, 0 = frozen)
//   level(s)      0..1, how deep into the finisher the screen is (bars, colour, camera)
//   impact(s)     0..1 through the frozen impact frame, else -1
//   extra         seconds the finisher's stretch adds
//   shownLength   when the result shows on screen (counted from "FIGHT!")
export const FINISHER = {
  slow: 0.125,    // the wind-up and the blow: 1/8 speed
  rampIn: 0.35,   // fight seconds to slow down into it
  lead: 0.5,      // the slow part starts this long (fight time) before the blow at most (4 s on screen)
  freeze: 0.85,   // screen seconds the moment of impact is held
  post: 0.25,     // the fall: 1/4 speed...
  postFor: 0.7,   // ...for this long (fight time) after the blow
  rampOut: 0.45   // fight seconds to come back to normal speed
};

const smooth = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };

export function buildFinisher(fight, opts = {}) {
  const P = { ...FINISHER, ...opts };
  if (!fight || !fight.events) return null;
  const ko = fight.events.find((e) => e.type === "ko");
  if (!ko) return null;
  const hits = fight.events.filter((e) => e.type === "hit" && e.t <= ko.t + 1e-6);
  const blow = hits[hits.length - 1];
  if (!blow) return null;
  const H = blow.t;
  // the slow part begins with the killer's Skyfall wind-up (its charge or its spin), so the whole swing is seen
  const wind = fight.events.filter((e) => e.who === blow.who && e.type === "spin" && e.t <= H).pop();
  const S0 = Math.max(0, Math.min(H - 0.3, Math.max(H - P.lead, wind ? wind.t - 0.1 : H - P.lead)));
  const A = Math.max(0, S0 - P.rampIn);                   // start slowing down here
  // the fall plays on past the fight's last moment (the knocked-out fighter is still going down)
  const B = H + P.postFor, C = B + P.rampOut;   // the fall, then back to normal
  const rate = (f) => {
    if (f < A) return 1;
    if (f < S0) return 1 - (1 - P.slow) * smooth((f - A) / Math.max(1e-6, S0 - A));
    if (f < H) return P.slow;
    if (f < B) return P.post;
    if (f < C) return P.post + (1 - P.post) * smooth((f - B) / P.rampOut);
    return 1;
  };
  // walk the fight's clock in small steps and add up the screen time (the held impact frame is added at H)
  const df = 1 / 240, sArr = [0], fArr = [0];
  let s = 0, sH = 0, frozen = false;
  for (let f = 0; f < C + df; f += df) {
    const r = rate(f + df / 2);
    if (!frozen && f + df > H) {
      // step exactly to the blow, hold, then carry on
      const part = H - f; s += part / Math.max(r, 1e-6); sArr.push(s); fArr.push(H);
      sH = s; s += P.freeze; sArr.push(s); fArr.push(H); frozen = true;
      const rest = df - part; s += rest / rate(H + rest / 2); sArr.push(s); fArr.push(f + df);
      continue;
    }
    s += df / r; sArr.push(s); fArr.push(f + df);
  }
  const sEnd = sArr[sArr.length - 1], fEnd = fArr[fArr.length - 1];
  const extra = sEnd - fEnd;
  const sA = toScreen(A), sS0 = toScreen(S0), sB = toScreen(B), sC = sEnd;
  function toScreen(f) {
    if (f >= fEnd) return sEnd + (f - fEnd);
    let lo = 0, hi = fArr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fArr[m] <= f) lo = m; else hi = m; }
    const span = fArr[hi] - fArr[lo];
    return span > 0 ? sArr[lo] + ((f - fArr[lo]) / span) * (sArr[hi] - sArr[lo]) : sArr[lo];
  }
  function fightAt(sc) {
    if (sc <= 0) return sc;
    if (sc >= sEnd) return fEnd + (sc - sEnd);
    let lo = 0, hi = sArr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sArr[m] <= sc) lo = m; else hi = m; }
    const span = sArr[hi] - sArr[lo];
    return span > 0 ? fArr[lo] + ((sc - sArr[lo]) / span) * (fArr[hi] - fArr[lo]) : fArr[lo];
  }
  const rateAt = (sc) => (sc >= sH && sc < sH + P.freeze ? 0 : rate(fightAt(sc)));
  // how deep into the finisher: in over the ramp down, all the way through the blow and the fall, out over the ramp up
  const level = (sc) => {
    if (sc <= sA || sc >= sC) return 0;
    if (sc < sS0) return smooth((sc - sA) / Math.max(1e-6, sS0 - sA));
    if (sc <= sB) return 1;
    return 1 - smooth((sc - sB) / Math.max(1e-6, sC - sB));
  };
  const impact = (sc) => (sc >= sH && sc < sH + P.freeze ? (sc - sH) / P.freeze : -1);
  // when the result shows on screen (the fight's own end, stretched, and never before the finisher is over)
  const shownLength = Math.max(toScreen(fight.length), sC - 0.6);
  return { fightAt, toScreen, rateAt, level, impact, extra, shownLength, sStart: sA, sSlow: sS0, sImpact: sH, sFall: sH + P.freeze, sEnd: sC, blowAt: H, killer: 1 - ko.who, victim: ko.who, crit: !!blow.crit, mult: blow.mult || 0, dmg: blow.dmg || 0 };
}
