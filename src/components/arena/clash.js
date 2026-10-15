// 6.26 preview: the weapon clash (a bind).
//
// Both fighters attack on their own clocks, so now and then both Skyfalls come down at the same moment.
// When that happens the screen pauses the fight just before the blows land and plays a bind: both
// fighters drive in with their spears, the spearheads cross and lock, they strain against each other
// (pushing back and forth, the blades grinding with sparks), then they break apart and both blows land.
//
// Only how the fight is SHOWN changes: the fight's own clock stands still during the bind, then carries on
// exactly as decided (same blows, same damage, same winner, same length for the bets). The screen shows the
// fight a little longer (CLASH.bind seconds per clash), like a replay's slow motion.
export const CLASH = {
  window: 0.05,   // both blows within this many fight seconds of each other (one engine step)
  bind: 1.15,     // screen seconds the bind takes (the fight is paused this long)
  drive: 0.14,    //   driving in until the blades meet
  release: 0.12,  //   breaking apart at the end (then the blows land)
  overlap: 0.6,   // metres each spear point reaches past the middle (where the blades cross)
  lean: 0.06,     // body lean (radians) as they push
  cross: 0.2,     // how far each spearhead is turned so the two cross (radians)
  sway: 0.14,     // metres the locked pair is pushed back and forth
  swayHz: 1.3     // how often the push goes back and forth
};

// [{ t, first, second }] for every pair of blows (hit or miss) by the two fighters at the same moment
export function findClashes(fight, opts = {}) {
  const P = { ...CLASH, ...opts };
  if (!fight || !fight.events) return [];
  const blows = fight.events.filter((e) => (e.type === "hit" || e.type === "miss") && (e.who === 0 || e.who === 1));
  const used = new Set(), out = [];
  for (let i = 0; i < blows.length; i++) {
    const a = blows[i];
    if (used.has(a)) continue;
    for (let j = i + 1; j < blows.length; j++) {
      const b = blows[j];
      if (b.t - a.t > P.window + 1e-9) break;
      if (used.has(b) || b.who === a.who) continue;
      used.add(a); used.add(b); out.push({ t: a.t, first: a, second: b });
      break;
    }
  }
  return out;
}

// The screen's timeline for one fight: where the fight stands still (the binds) and how long it shows.
//   fightAt(s)   the fight's own time for a time on the screen (both counted from "FIGHT!")
//   holdAt(s)    { k, clash, u (seconds into the bind), c (0..1) } during a bind, else null
//   toScreen(f)  the screen time of a fight time
//   extra        seconds the binds add; shownLength: when the fight's end shows on the screen
export function buildTimeline(fight, opts = {}) {
  const P = { ...CLASH, ...opts };
  // the fight stands still just before the blows land (its frames are 0.05 s apart)
  const holds = findClashes(fight, P).map((c) => ({ at: Math.max(0, c.t - 0.026), dur: P.bind, clash: c }));
  const walk = (s) => {
    let off = 0;
    for (let k = 0; k < holds.length; k++) {
      const h = holds[k], hs = h.at + off;
      if (s < hs) return { f: s - off, hold: null };
      if (s < hs + h.dur) return { f: h.at, hold: { k, clash: h.clash, u: s - hs, c: (s - hs) / h.dur } };
      off += h.dur;
    }
    return { f: s - off, hold: null };
  };
  const toScreen = (f) => f + holds.filter((h) => h.at < f).reduce((a, h) => a + h.dur, 0);
  const extra = holds.length * P.bind;
  return { holds, fightAt: (s) => walk(s).f, holdAt: (s) => walk(s).hold, toScreen, extra, shownLength: fight.length + extra, P };
}
