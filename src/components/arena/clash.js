// 6.26 preview: the weapon clash.
//
// Both fighters attack on their own clocks, so now and then both Skyfalls come down at the same moment.
// When that happens the two weapons meet in the middle: they lock for a beat with sparks pouring off them,
// then both fighters are thrown back.
//
// Only how the fight is SHOWN changes: both blows still land (or miss) exactly as the fight decided, with
// the same damage, so the winner, the length and every bet are unchanged. The clash is found from the
// fight's own events, so every screen shows the same clashes at the same moments.
export const CLASH = {
  window: 0.05,   // both blows within this many fight seconds of each other (one engine step)
  hold: 0.32,     // screen seconds the weapons stay locked together
  push: 0.55,     // how far both fighters are thrown back (metres), easing back over `back` seconds
  back: 0.5
};

// [{ t, first, second }] for every pair of blows (hit or miss) by the two fighters at the same moment;
// first is the one that comes first in the fight's events (the clash shows on it)
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
