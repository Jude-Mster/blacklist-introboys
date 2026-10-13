import { advance, member, settings, call, pts, ok, done, E } from './h.ts';
import arena from '../base44/functions/arenaAction/entry.ts';
import tour from '../base44/functions/tournamentAction/entry.ts';
import * as Eng from '../base44/shared/arenaEngine.ts';
const offeredKey = (o) => (o.a > 1 ? 'a' : o.b > 1 ? 'b' : ((o.side || []).find((x) => x.price > 1) || { id: 'lenover' }).id);   // a fighter if one is offered, else a side bet
await settings();
const L = await member('Juts', 100000, 'leader'), A = await member('A'), B = await member('B');
// prices (engine 8): fighters at most 4x, side bets at most 3x, no Draw bet
const r = Eng.mulberry32(9); let maxF = 0, maxS = 0, maxD = 0, draws = 0;
for (let i = 0; i < 200; i++) { const o = Eng.priceMatch(Eng.randomBuild(r), Eng.randomBuild(r), i, { draws: true }); maxF = Math.max(maxF, o.a, o.b); maxD = Math.max(maxD, o.draw); if (o.draw) draws++; for (const s of o.side) maxS = Math.max(maxS, s.price); }
ok(maxF <= 4 && maxS <= 3.5 && maxD === 0, `caps: fighter ${maxF}, side ${maxS}, draw ${maxD}, draw offered in ${draws}/200`);
let s = await call(arena, A, { action: 'state' });
const round = s.table.round_no;
let row = (await E.ArenaTable.filter({}, {})).items[0];
ok(row.fought === false && !row.seed && !row.outcome.winner && row.outcome.winner !== 0, 'live: nothing decided while betting is open');
ok(s.table.odds.side.every((q) => !/onehit|buff/.test(q.id)) && s.table.odds.side.some((q) => q.id === 'lenover') && s.table.odds.draw === 0, 'side bets: no one-hit KO, no buffs, a fight-length line, no Draw bet');
// both fighters must be offered to test the "not both" rule (a heavy favourite isn't offered at all)
const both = s.table.odds.a > 1 && s.table.odds.b > 1, fk = offeredKey(s.table.odds);
let x = await call(arena, A, { action: 'bet', round, lines: [{ k: 'a', amount: 10 }, { k: 'b', amount: 10 }] });
ok(x.status === 400 && (both ? /both/.test(x.error) : /offered/.test(x.error)), 'a+b refused: ' + x.error);
// about 1 matchup in 400 offers neither fighter (one never won a practice fight and the other would pay under 1.01)
if (s.table.odds.a > 1 || s.table.odds.b > 1) {
  x = await call(arena, A, { action: 'bet', round, lines: [{ k: fk, amount: 10 }] });
  ok(x.ok, 'one fighter alone ok ' + (x.error || ''));
  x = await call(arena, A, { action: 'bet', round, lines: [{ k: fk === 'a' ? 'b' : 'a', amount: 10 }] });
  ok(x.status === 400, 'the other fighter after it refused');
} else console.log('NOTE - neither fighter offered on this matchup; skipped the one-fighter checks');
const side = s.table.odds.side.filter((q) => q.price > 1).map((q) => q.id);
if (side.includes('over') && side.includes('under')) { x = await call(arena, A, { action: 'bet', round, lines: [{ k: 'over', amount: 5 }, { k: 'under', amount: 5 }] }); ok(x.status === 400, 'over+under refused'); }
// crowd
x = await call(arena, A, { action: 'react', scope: 'live', emoji: '🔥' });
ok(x.ok, 'react');
x = await call(arena, A, { action: 'react', scope: 'live', emoji: '🔥' });
ok(x.status === 429, 'react too fast refused');
x = await call(arena, B, { action: 'pulse', scope: 'live', here: true });
ok(x.watching >= 1 && x.reactions.length === 1 && x.reactions[0].name === 'A', 'pulse: watching ' + x.watching);
// repeat + reminder
x = await call(tour, L, { action: 'create', title: 'Weekly', repeat: 'weekly' });
ok(x.status === 400, 'repeat needs time');
const start = Date.now() + 20 * 60000;
x = await call(tour, L, { action: 'create', title: 'Weekly', repeat: 'weekly', starts_at: new Date(start).toISOString(), prizes: [{ kind: 'points', points: 100 }] });
ok(x.ok, 'weekly created');
await call(tour, A, { action: 'buy', item: 'entry' }); await call(tour, B, { action: 'buy', item: 'entry' });
advance(11 * 60000);
s = await call(tour, A, { action: 'state' });
const t1 = (await E.Tournament.filter({ title: 'Weekly' }, {})).items[0];
ok(!!t1.reminded_at, 'reminder sent ~10 min before');
advance(10 * 60000);
s = await call(tour, A, { action: 'state' });
ok(s.tournament.status === 'running', 'started');
const tr = (await E.Tournament.filter({ title: 'Weekly', status: 'running' }, {})).items[0];
ok(tr.matches.every((m) => !m.fought && !m.seed && !m.outcome), 'tournament: no match fought at the start');
advance(25000);
await call(tour, A, { action: 'state' });
const tr2 = (await E.Tournament.get(tr.id));
ok(tr2.matches[0].fought && tr2.matches[0].seed, 'match fought once its betting closed');
advance(3600000);
s = await call(tour, A, { action: 'state' });
const all = (await E.Tournament.filter({ title: 'Weekly' }, {})).items;
ok(all.length === 2 && s.tournament && s.tournament.status === 'signup' && Math.abs(Date.parse(s.tournament.starts_at) - (start + 7 * 86400000)) < 1000, 'next week opened: ' + (s.tournament && s.tournament.starts_at));
ok((await E.ChatMessage.filter({}, {})).items.some((m) => /starts in/.test(m.text)), 'chat reminder posted');
done();