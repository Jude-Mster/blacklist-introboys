// Regular Battle (outpost war) schedule, as published on wiki.wuxen2.com (#outpost-war; checked 29 Oct 2026):
// EVERY 2 HOURS (00:00, 02:00 ... 22:00 UTC; it used to be every hour). :20 countdown (10 min), :30 entrance opens (3 min),
// :33 battle (15 min), :48 ends.
export const WAR = { everyHours: 2, countdownMin: 20, gateMin: 30, battleMin: 33, endMin: 48 };

// Where the war is right now, and how long until the next change.
// phase: "waiting" | "countdown" | "gate" | "battle"
export function warStatus(nowMs = Date.now()) {
  const CYCLE = WAR.everyHours * 3600000;
  const into = ((nowMs % CYCLE) + CYCLE) % CYCLE; // ms since the start of this 2-hour block (UTC)
  const blockStart = nowMs - into;
  const at = (min) => blockStart + min * 60000;
  const next = WAR.everyHours * 60;
  let phase, endsAt;
  if (into < WAR.countdownMin * 60000) { phase = "waiting"; endsAt = at(WAR.gateMin); }
  else if (into < WAR.gateMin * 60000) { phase = "countdown"; endsAt = at(WAR.gateMin); }
  else if (into < WAR.battleMin * 60000) { phase = "gate"; endsAt = at(WAR.battleMin); }
  else if (into < WAR.endMin * 60000) { phase = "battle"; endsAt = at(WAR.endMin); }
  else { phase = "waiting"; endsAt = at(next + WAR.gateMin); }
  const nextGate = into < WAR.gateMin * 60000 ? at(WAR.gateMin) : at(next + WAR.gateMin);
  return { phase, endsAt, left: Math.max(0, endsAt - nowMs), nextGate };
}

export function clock(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const localTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });