// HSB schedule, as published by the game: every Wednesday 16:00-19:00 and every
// Saturday 10:00-13:00. All times are server time, which is UTC.
// To change the schedule, edit this list (day: 0 = Sunday ... 6 = Saturday; hours in UTC).
export const HSB_WINDOWS = [
  { day: 3, start: 16, end: 19 },
  { day: 6, start: 10, end: 13 }
];
const SOON_MS = 30 * 60000; // "starting soon" for the last half hour before it opens
const HOUR = 3600000, DAY = 24 * HOUR, WEEK = 7 * DAY;

// Where HSB is right now, and how long until the next change.
// phase: "live" (open now) | "soon" (opens within 30 minutes) | "waiting"
export function hsbStatus(nowMs = Date.now()) {
  const d = new Date(nowMs);
  // midnight UTC of the Sunday that starts this week
  const weekStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - d.getUTCDay() * DAY;
  let next = null;
  for (const week of [0, WEEK]) {
    for (const w of HSB_WINDOWS) {
      const start = weekStart + week + w.day * DAY + w.start * HOUR;
      const end = weekStart + week + w.day * DAY + w.end * HOUR;
      if (nowMs >= start && nowMs < end) return { phase: "live", startsAt: start, endsAt: end, left: end - nowMs };
      if (start > nowMs && (!next || start < next.start)) next = { start, end };
    }
  }
  const left = next.start - nowMs;
  return { phase: left <= SOON_MS ? "soon" : "waiting", startsAt: next.start, endsAt: next.end, left };
}

// A countdown that reads well from days down to seconds: "2d 5h", "5h 12m", "12:34".
export function longClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// The start in the member's own time zone, e.g. "Wed 12:00 PM".
export const localDayTime = (ms) => new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
