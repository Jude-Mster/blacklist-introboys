// 6.15: the account read is light unless a page asks for detail; rank skips members without access.
import { member, settings, call, ok, done, E } from './h.ts';
(globalThis as any).__rankCacheMs = 0;
import acct from '../base44/functions/getMyAccount/entry.ts';

await settings({ guild_id: '' });
const L = await member('Juts', 90000, 'leader');
const A = await member('Top', 80000), B = await member('Mid', 50000), C = await member('Gone', 70000);
await E.Member.update(C.id, { no_access: true });
await E.PointLog.create({ member_id: B.id, amount: 5, source: 'award', created_date: new Date().toISOString() });

let r = await call(acct, B, {});
ok(r.linked && r.member && r.settings, 'light read: member and settings');
ok(!('recentLogs' in r) && !('rank' in r) && !('stats' in r), 'light read: no history, stats or rank');
r = await call(acct, B, { detail: true });
ok(r.detail === true && Array.isArray(r.recentLogs) && Array.isArray(r.recentBets) && r.stats, 'detail read: history and stats');
ok(r.rank === 3, `rank skips a member without access (leader, Top, then Mid = 3; got ${r.rank})`);
r = await call(acct, L, { detail: true });
ok(r.rank === 1, `leader ranks first (${r.rank})`);
r = await call(acct, null, {});
ok(r.status === 401, 'no session: 401');
// a body-less call still works
const res = await acct(new Request('http://x/', { method: 'POST', headers: { 'x-guild-session': A.token } }));
const j = await res.json();
ok(res.status === 200 && j.linked, 'a call with no body is a light read');
done();