// Phase 3: tournament brackets for 2 to 12 fighters, run to the end. 6.22: seeded double elimination.
// Checks byes, who advances, that nobody is out before two losses, places 1-4, prizes and that totals add up.
import { member, settings, call, E, advance, ok, done } from './h.ts';
const tour = (await import('../base44/functions/tournamentAction/entry.ts')).default;
await settings({ games_enabled: ['arena'] });
const L = await member('Leader', 1e6, 'leader');
const pool = []; for (let i = 0; i < 12; i++) pool.push(await member('F' + i, 1e6));
const out = [];
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
  const cr = await call(tour, L, { action: 'create', predict_minutes: 0, title: `Cup ${n}`, prizes: [{ kind: 'points', points: 1000 }, { kind: 'points', points: 500 }, { kind: 'points', points: 250 }, { kind: 'points', points: 100 }] });
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
  const fought = ms.filter((m) => m.a != null && m.b != null && !m.skipped);
  const g = fought.filter((m) => m.sec === 'G'), final = g[g.length - 1];
  const lf = ms.find((m) => m.stage === "Losers' final");
  const res = t.results || [];
  const idOf = (i) => field[i] && field[i].member_id;
  const r1 = res.find((r) => r.place === 1), r2 = res.find((r) => r.place === 2), r3 = res.find((r) => r.place === 3);
  const losses = {}; for (const m of fought) losses[m.loser] = (losses[m.loser] || 0) + 1;
  const champ = final ? final.winner : null;
  const reset = ms.find((m) => m.reset);
  ok(t.status === 'done', `${n} fighters: finished (${t.status})`);
  ok(t.format === 'double', `${n} fighters: double elimination`);
  ok(appears.size === n, `${n} fighters: everyone is in the bracket (${appears.size})`);
  ok(unplayed === 0, `${n} fighters: every match with two fighters was fought`);
  ok(fought.length === 2 * n - 2 || fought.length === 2 * n - 1, `${n} fighters: 2n-2 matches, or 2n-1 with the reset (got ${fought.length})`);
  ok(reset && (reset.skipped ? g.length === 1 && g[0].winner === g[0].a : g.length === 2), `${n} fighters: the reset is played only when the losers' side wins the grand final`);
  ok(Object.keys(losses).length === n - (reset && !reset.skipped ? 0 : 1) && Object.entries(losses).every(([i, c]) => (Number(i) === champ ? c <= 1 : c === 2)), `${n} fighters: everyone but the champion is out after exactly two losses (${JSON.stringify(losses)})`);
  ok(r1 && r1.member_id === idOf(champ), `${n} fighters: the grand final's winner gets 1st`);
  ok(r2 && r2.member_id === idOf(final.loser), `${n} fighters: the grand final's loser gets 2nd`);
  if (n >= 3) ok(r3 && lf && r3.member_id === idOf(lf.loser), `${n} fighters: the losers' final loser gets 3rd`);
  ok(field.every((f, i) => Number.isInteger(f.seed)), `${n} fighters: every fighter has a seed`);
  const places = Math.min(n, 4);
  const paid = (await E.PointLog.filter({ source: 'tournament' }, {})).items.filter((l) => l.amount > 0 && l.reason.includes(`Cup ${n}`) && /prize/i.test(l.reason));
  const prizeTotal = [1000, 500, 250, 100].slice(0, places).reduce((a, b) => a + b, 0);
  ok(paid.reduce((a, l) => a + l.amount, 0) === prizeTotal, `${n} fighters: prizes paid add up to ${prizeTotal} (paid ${paid.reduce((a, l) => a + l.amount, 0)} in ${paid.length})`);
  out.push({ n, matches: fought.length, stages: [...new Set(ms.map((m) => m.stage))].join(', ') });
}
console.log(JSON.stringify(out));
done();