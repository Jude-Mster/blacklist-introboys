// Regular Battle (outpost war) schedule, as published on wiki.wuxen2.com:
// every hour on UTC time. :20 countdown, :30 entrance opens, :33 battle, :48 ends.
export const WAR = { countdownMin: 20, gateMin: 30, battleMin: 33, endMin: 48 };

// Where the war is right now, and how long until the next change.
// phase: "waiting" | "countdown" | "gate" | "battle"
export function warStatus(nowMs = Date.now()) {
  const HOUR = 3600000;
  const into = ((nowMs % HOUR) + HOUR) % HOUR; // ms since the top of the UTC hour
  const hourStart = nowMs - into;
  const at = (min) => hourStart + min * 60000;
  let phase, endsAt;
  if (into < WAR.countdownMin * 60000) { phase = "waiting"; endsAt = at(WAR.gateMin); }
  else if (into < WAR.gateMin * 60000) { phase = "countdown"; endsAt = at(WAR.gateMin); }
  else if (into < WAR.battleMin * 60000) { phase = "gate"; endsAt = at(WAR.battleMin); }
  else if (into < WAR.endMin * 60000) { phase = "battle"; endsAt = at(WAR.endMin); }
  else { phase = "waiting"; endsAt = at(60 + WAR.gateMin); }
  const nextGate = into < WAR.gateMin * 60000 ? at(WAR.gateMin) : at(60 + WAR.gateMin);
  return { phase, endsAt, left: Math.max(0, endsAt - nowMs), nextGate };
}

export function clock(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const localTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });