// Test helpers: clock, members, sessions, calls.
const g = globalThis as any;
g.__settingsCacheMs = 0; g.__retryBaseMs = 1;
const realNow = Date.now.bind(Date);
g.__off = 0;
Date.now = () => realNow() + g.__off;
export const advance = (ms: number) => { g.__off += ms; };
import { createClientFromRequest } from './fake/sdk.ts';
export const b = createClientFromRequest(null);
export const E = b.asServiceRole.entities;
async function sha(t: string) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
let n = 0;
export async function member(name: string, points = 100000, role = 'member') {
  const m = await E.Member.create({ discord_id: '1000000000000' + String(100000 + ++n), discord_name: name, avatar_url: '', points, role, banned: false, no_access: false });
  const token = (n.toString(16).padStart(2, '0')).repeat(32).slice(0, 64);
  await E.Session.create({ token_hash: await sha(token), member_id: m.id, expires_at: new Date(realNow() + 1e12).toISOString() });
  return { ...m, token };
}
export async function settings(extra = {}) {
  await E.Settings.create({ min_bet: 10, max_bet: 5000, daily_bet_cap: 1000000, house_edge_pct: 3, games_enabled: ['arena', 'derby'], ...extra });
}
export async function call(fn, who, body) {
  const req = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', ...(who ? { 'x-guild-session': who.token } : {}) }, body: JSON.stringify(body) });
  const res = await fn(req);
  const j = await res.json();
  return { status: res.status, ...j };
}
export const pts = async (m) => (await E.Member.get(m.id)).points;
export function ok(c: boolean, msg: string) { if (!c) { console.error('FAIL:', msg); g.__fail = (g.__fail || 0) + 1; } else console.log('ok -', msg); }
export const done = () => { if (g.__fail) { console.error(g.__fail, 'failures'); Deno.exit(1); } console.log('ALL PASSED'); };// 6.22: join a tournament, then buy random stats so the fighter has `n` entries in all (1 join + n - 1
// random stats, bought as packs of 10, 5 and 1). Returns the last answer, with every rolled stat.
export async function enter(fn, who, n = 1, price?: number) {
  let r = await call(fn, who, { action: 'buy', item: 'join', ...(price != null ? { price } : {}) });
  if (!r.ok) return r;
  const ups = [];
  let left = n - 1;
  for (const pack of [10, 5, 1]) while (left >= pack) {
    r = await call(fn, who, { action: 'buy', item: 'roll', count: pack, ...(price != null ? { price } : {}) });
    if (!r.ok) return r;
    ups.push(...r.rolled.ups); left -= pack;
  }
  return { ...r, rolled: { ...r.rolled, ups } };
}
