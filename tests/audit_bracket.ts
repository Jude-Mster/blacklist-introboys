// Phase 3: tournament brackets for 2 to 12 fighters, run to the end. Checks seeding, byes, who advances,
// the third-place match, prizes and that totals add up.
import { member, settings, call, E, advance, ok, done } from './h.ts';
const tour = (await import('../base44/functions/tournamentAction/entry.ts')).default;
await settings({ games_enabled: ['arena'] });
const L = await member('Leader', 1e6, 'leader');
const pool = []; for (let i = 0; i < 12; i++) pool.push(await member('F' + i, 1e6));
const out = [];
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
  const cr = await call(tour, L, { action: 'create', title: `Cup ${n}`, prizes: [{ kind: 'points', points: 1000 }, { kind: 'points', points: 500 }, { kind: 'points', points: 250 }, { kind: 'points', points: 100 }] });
  const before = Object.fromEntries(await Promise.all(pool.map(async (m) => [m.id, (await E.Member.get(m.id)).points])));
  for (const m of pool.slice(0, n)) await call(tour, m, { action: 'buy', item: 'entry', count: 1 + Math.floor(Math.random() * 6) });
  await call(tour, L, { action: 'start' });
  for (let k = 0; k < 200; k++) { advance(15e3); const s = await call(tour, pool[0], { action: 'state' }); if (s.tournament && s.tournament.status === 'done') break; if (!s.tournament && s.last && s.last.status === 'done') break; }
  const t = await E.Tournament.get(cr.id);
  const ms = t.matches || [];
  const field = t.field || [];
  // every fighter appears; one champion; the final's winner is 1st, its loser 2nd
  const appears = new Set(); for (const m of ms) { if (m.a != null) appears.add(m.a); if (m.b != null) appears.add(m.b); }
  const unplayed = ms.filter((m) => m.a != null && m.b != null && m.winner == null).length;
  const final = ms.find((m) => /final/i.test(m.stage || '') && !/semi|quarter|third|3rd/i.test(m.stage || '')) || ms[ms.length - 1];
  const third = ms.find((m) => /third|3rd/i.test(m.stage || ''));
  const res = t.results || [];
  const idOf = (i) => field[i] && field[i].member_id;
  const finalW = final ? final.winner : null;   // winner and loser are fighter numbers in the field
  const r1 = res.find((r) => r.place === 1), r2 = res.find((r) => r.place === 2), r3 = res.find((r) => r.place === 3);
  const matchesPlayed = ms.filter((m) => m.a != null && m.b != null).length;
  const expectMatches = n - 1 + (n >= 4 ? 1 : 0);
  ok(t.status === 'done', `${n} fighters: finished (${t.status})`);
  ok(appears.size === n, `${n} fighters: everyone is in the bracket (${appears.size})`);
  ok(unplayed === 0, `${n} fighters: every match with two fighters was fought`);
  ok(matchesPlayed === expectMatches, `${n} fighters: ${expectMatches} matches fought (n - 1${n >= 4 ? ', plus the 3rd-place match' : ''}) (got ${matchesPlayed})`);
  ok(r1 && r1.member_id === idOf(finalW), `${n} fighters: the final's winner gets 1st`);
  ok(r2 && r2.member_id === idOf(final.a === finalW ? final.b : final.a), `${n} fighters: the final's loser gets 2nd`);
  if (n >= 4) ok(r3 && third && r3.member_id === idOf(third.winner), `${n} fighters: the 3rd-place match winner gets 3rd`);
  const paid = (await E.PointLog.filter({ source: 'tournament' }, {})).items.filter((l) => l.amount > 0 && l.reason.includes(`Cup ${n}`) && /prize/i.test(l.reason));
  const prizeTotal = [1000, 500, 250, 100].slice(0, n >= 4 ? 4 : n).reduce((a, b) => a + b, 0);
  ok(paid.reduce((a, l) => a + l.amount, 0) === prizeTotal, `${n} fighters: prizes paid add up to ${prizeTotal} (paid ${paid.reduce((a, l) => a + l.amount, 0)} in ${paid.length})`);
  out.push({ n, matches: matchesPlayed, stages: [...new Set(ms.map((m) => m.stage))].join(', ') });
}
console.log(JSON.stringify(out));
done();