// The guild's timed events, worked out on the server for push alerts. These must match the
// website's own schedules in src/lib/war.js and src/lib/hsb.js.
//   War (Regular Battle): the entrance opens at :30 of every hour, UTC.
//   HSB: Wednesday 16:00-19:00 and Saturday 10:00-13:00, UTC.
export const WAR_GATE_MIN = 30;
export const HSB_WINDOWS = [
  { day: 3, start: 16 },
  { day: 6, start: 10 }
];
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY;

export type GuildEvent = { kind: 'war' | 'hsb'; at: number; id: string };

// Every event starting between `fromMs` and `toMs`.
export function eventsBetween(fromMs: number, toMs: number): GuildEvent[] {
  const out: GuildEvent[] = [];
  for (let h = Math.floor(fromMs / HOUR) - 1; h <= Math.floor(toMs / HOUR) + 1; h++) {
    const at = h * HOUR + WAR_GATE_MIN * MIN;
    if (at >= fromMs && at <= toMs) out.push({ kind: 'war', at, id: `war:${at}` });
  }
  const d = new Date(fromMs);
  const weekStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - d.getUTCDay() * DAY;
  for (const w of [-WEEK, 0, WEEK]) for (const s of HSB_WINDOWS) {
    const at = weekStart + w + s.day * DAY + s.start * HOUR;
    if (at >= fromMs && at <= toMs) out.push({ kind: 'hsb', at, id: `hsb:${at}` });
  }
  return out.sort((x, y) => x.at - y.at);
}

export const WAR_MIN_CHOICES = [3, 6, 10, 15];
export const HSB_MIN_CHOICES = [5, 10, 15, 30];

// What the notification says.
export function alertText(ev: GuildEvent, nowMs: number) {
  const mins = Math.ceil((ev.at - nowMs) / MIN);
  const hhmm = new Date(ev.at).toISOString().slice(11, 16);
  if (ev.kind === 'war') {
    return mins > 0
      ? { title: `War in ${mins} minute${mins === 1 ? '' : 's'}`, body: `Get ready for War. The entrance opens at ${hhmm} server time.` }
      : { title: 'War entrance is open', body: 'Get ready for War. The entrance is open now.' };
  }
  return mins > 0
    ? { title: `HSB opens in ${mins} minute${mins === 1 ? '' : 's'}`, body: `Get ready for HSB. It opens at ${hhmm} server time and runs for three hours.` }
    : { title: 'HSB is open', body: 'Get ready for HSB. It is open now.' };
}