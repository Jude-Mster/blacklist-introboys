// 6.16: a short-lived shared answer for reads that every screen asks for at once.
//
// Ten members watching the same fight used to mean ten identical database reads every few
// seconds. memo(key, ms, fn) gives every request handled by this running copy of the function
// the same answer for `ms` milliseconds, and requests that arrive while the read is on its way
// wait for that one read instead of starting their own. So the database cost of a screen that
// everyone polls stays about the same whether 3 or 30 members are watching.
//
// Only for reads whose answer may be a second or two old (what is on the table, who is
// watching, the chat). Anything that moves points reads fresh and calls bust() afterwards.
const MEMO_OFF = () => Number((globalThis as any).__memoOff || 0) > 0; // tests can switch it off
const store = new Map<string, { at: number; ms: number; v: any }>();
const pending = new Map<string, Promise<any>>();

// valid(v, at): optional extra check; a remembered answer it rejects is read again (6.17: used to keep
// an answer longer but drop it the moment a known change time - a fight closing, a match opening - passes).
export async function memo<T>(key: string, ms: number, fn: () => Promise<T>, valid?: (v: T, at: number) => boolean): Promise<T> {
  if (MEMO_OFF()) return await fn();
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < hit.ms && (!valid || valid(hit.v, hit.at))) return hit.v;
  const p = pending.get(key);
  if (p) return await p;
  const run = (async () => {
    try {
      const v = await fn();
      if (store.size > 400) store.clear();
      store.set(key, { at: Date.now(), ms, v });
      return v;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, run);
  return await run;
}

// Put a value we just wrote (or just read fresh) in place, so the next readers see it at once.
export function remember(key: string, ms: number, v: any) {
  if (store.size > 400) store.clear();
  store.set(key, { at: Date.now(), ms, v });
}

// Forget every remembered answer whose key starts with `prefix`.
export function bust(prefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
