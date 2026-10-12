// 6.13: the Guild Leader's spending limit per member in a tournament.
import { member, settings, call, pts, ok, done, E } from './h.ts';
import tour from '../base44/functions/tournamentAction/entry.ts';

await settings();
const L = await member('Juts', 100000, 'leader');
const A = await member('Capped A', 50000), B = await member('Capped B', 50000);
const START = 50000;
async function ledger(tag) {
  for (const m of [A, B]) {
    const p = await pts(m), s = (await E.PointLog.filter({ member_id: m.id }, {})).items.reduce((a, l) => a + l.amount, 0);
    ok(p === START + s && p >= 0, `[${tag}] ${m.discord_name}: points = start + PointLog (${p})`);
  }
}

let r = await call(tour, L, { action: 'create', title: 'Capped Cup', max_spend: 1.5, prizes: [{ kind: 'points', points: 100 }] });
ok(r.status === 400 && /whole number/.test(r.error), `a limit of 1.5 is refused (${r.error})`);
r = await call(tour, L, { action: 'create', title: 'Capped Cup', max_spend: 2000, prizes: [{ kind: 'points', points: 100 }] });
ok(r.ok, `created with a 2,000 limit ${r.error || ''}`);
let s = await call(tour, A, { action: 'state' });
ok(s.tournament.max_spend === 2000, `members see the limit (${s.tournament.max_spend})`);

r = await call(tour, A, { action: 'buy', item: 'entry', count: 3, price: 500 });
ok(r.ok && r.me.spent === 1500, `3 entries: 1,500 spent (${r.me && r.me.spent})`);
r = await call(tour, A, { action: 'buy', item: 'entry', count: 2, price: 500 });
ok(r.status === 400 && /500 left/.test(r.error), `2 more (1,000) refused with 500 left: ${r.error}`);
ok((await pts(A)) === START - 1500, 'nothing charged for the refused buy');
r = await call(tour, A, { action: 'buy', item: 'weapon', price: 500 });
ok(r.ok && r.me.spent === 2000, `a weapon try (500) fits exactly: ${r.me && r.me.spent}`);
r = await call(tour, A, { action: 'buy', item: 'entry', count: 1, price: 500 });
ok(r.status === 400 && /reached/.test(r.error), `at the limit, everything is refused: ${r.error}`);
r = await call(tour, A, { action: 'reroll' });
ok(r.ok, 'the free re-roll still works at the limit');

// four buys at once with room for exactly one
r = await call(tour, B, { action: 'buy', item: 'entry', count: 3, price: 500 });
const rs = await Promise.all([1, 2, 3, 4].map(() => call(tour, B, { action: 'buy', item: 'entry', count: 1, price: 500 })));
const okN = rs.filter((x) => x.status === 200).length;
const bs = (await call(tour, B, { action: 'state' })).me.spent;
ok(okN === 1 && bs === 2000, `4 buys at once with room for one: ${okN} accepted, spent ${bs}`);

// the leader raises it, lowers it, removes it
r = await call(tour, L, { action: 'edit', max_spend: 3000 });
ok(r.ok, `limit raised to 3,000 ${r.error || ''}`);
r = await call(tour, A, { action: 'buy', item: 'skill', price: 1000 });
ok(r.ok && r.me.spent === 3000, `a skill fits after the raise: ${r.me && r.me.spent}`);
r = await call(tour, L, { action: 'edit', max_spend: 1000 });
r = await call(tour, A, { action: 'buy', item: 'pet', price: 1500 });
ok(r.status === 400 && (await call(tour, A, { action: 'state' })).me.spent === 3000, 'a lower limit stops further buying and takes nothing back');
r = await call(tour, A, { action: 'edit', max_spend: 0 });
ok(r.status === 403, 'only the leader can change it');
r = await call(tour, L, { action: 'edit', max_spend: 0 });
r = await call(tour, A, { action: 'buy', item: 'pet', price: 1500 });
ok(r.ok, `no limit (0): buying works again ${r.error || ''}`);
await ledger('capped');
await call(tour, L, { action: 'cancel', refund: true });
done();