import { advance, member, settings, call, pts, ok, done, E } from './h.ts';
import arena from '../base44/functions/arenaAction/entry.ts';
import { simulate, outcomeOf, betReturn } from '../base44/shared/arenaEngine.ts';
const offeredKey = (o) => (o.a > 1 ? 'a' : o.b > 1 ? 'b' : ((o.side || []).find((x) => x.price > 1) || { id: 'lenover' }).id);   // a fighter if one is offered, else a side bet

await settings();
const A = await member('Juts'), B = await member('Judy'), C = await member('Kael');
for (let i = 0; i < 6; i++) await member('M' + i);

let s = await call(arena, A, { action: 'state' });
ok(s.status === 200 && s.table.status === 'betting', 'state opens a round in betting');
ok(s.table.fight === null && s.table.outcome === null, 'no seed or result before close');
ok(!JSON.stringify(s).includes('"seed"') && !JSON.stringify(s.table).includes('fight_ends_at'), 'seed and end time not leaked');
ok(s.table.fighters.length === 2 && s.table.fighters[0].look !== s.table.fighters[1].look, 'two fighters with different looks');
ok(s.table.odds.a <= 4 && s.table.odds.b <= 4 && s.table.odds.draw === 0, 'prices capped (about 1 matchup in 50 offers neither fighter): ' + JSON.stringify([s.table.odds.a, s.table.odds.b, s.table.odds.draw]));
ok(s.table.odds.side.every((x) => x.price === 0 || x.price <= 5), 'side bets capped at 5x');
const round = s.table.round_no;

// a heavy favourite isn't offered (its price would be under 1.01): bet on the side that is
const fk = offeredKey(s.table.odds), fo = fk === 'a' ? 'b' : 'a';
const ov = ['over', 'lenover', 'critover'].find((k) => s.table.odds.side.some((x) => x.id === k && x.price > 1)) || 'lenover';
const OPP = { over: 'under', lenover: 'lenunder', critover: 'critunder' };
let r;
r = await call(arena, A, { action: 'bet', round, lines: [{ k: fk, amount: 1000 }, { k: ov, amount: 15 }] });
ok(r.ok && r.balance === 100000 - 1015, 'bet takes points ' + (r.error || ''));
r = await call(arena, A, { action: 'bet', round, lines: [{ k: fo, amount: 10 }] });
ok(r.status === 400 && /both|offered/.test(r.error), 'no bet on both fighters: ' + r.error);
r = await call(arena, A, { action: 'bet', round, lines: [{ k: OPP[ov], amount: 10 }] });
ok(r.status === 400 && /both/.test(r.error), 'no over and under: ' + r.error);
r = await call(arena, B, { action: 'bet', round, lines: [{ k: 'onehitA', amount: 10 }, { k: 'onehitB', amount: 10 }] });
ok(r.status === 400, 'no one-hit KO by each');
r = await call(arena, A, { action: 'react', emoji: '🔥' });
ok(r.ok, 'react');
r = await call(arena, A, { action: 'react', emoji: '🔥' });
ok(r.status === 429, 'react rate limit');
r = await call(arena, A, { action: 'react', emoji: 'x' });
ok(r.status === 400, 'only arena emojis');
r = await call(arena, B, { action: 'pulse', scope: 'live', here: true });
r = await call(arena, A, { action: 'pulse', scope: 'live', here: true });
ok(r.watching === 2 && r.reactions.length === 1 && r.reactions[0].mine, 'pulse: watching 2, one reaction');
ok(s.table.bet_seconds === 15, 'betting time defaults to 15 s (was 30 before 6.12)');
r = await call(arena, A, { action: 'bet', round, lines: [{ k: fk, amount: 4000 }] });
ok(r.status === 400, 'limit / conflict: ' + r.error);
r = await call(arena, A, { action: 'bet', round, lines: [{ k: 'zzz', amount: 10 }] });
ok(r.status === 400, 'unknown bet refused');
r = await call(arena, A, { action: 'bet', round, lines: [{ k: 'a', amount: 0 }] });
ok(r.status === 400, 'zero refused');
r = await call(arena, B, { action: 'bet', round, lines: [{ k: fo === 'b' && s.table.odds.b > 1 ? 'b' : fk, amount: 1 }] });
ok(r.ok, 'minimum 1 accepted');
const cu = s.table.odds.side.find((x) => x.id === 'critunder' && x.price > 1) ? 'critunder' : 'under';
r = await call(arena, C, { action: 'bet', round, lines: [{ k: fk, amount: 300 }, { k: cu, amount: 50 }] });
r = await call(arena, C, { action: 'remove', round, k: cu });
ok(r.ok && r.balance === 100000 - 300, 'take one bet back');

// just after close (fights are short since 6.10, so don't wait long or it may already be over)
advance(Date.parse(s.table.bets_close_at) - Date.now() + 500);
s = await call(arena, A, { action: 'state' });
ok(s.table.status === 'fighting' && s.table.fight && Number.isInteger(s.table.fight.seed), 'seed revealed after close');
ok(s.table.outcome === null, 'result hidden while fighting');
r = await call(arena, B, { action: 'bet', round, lines: [{ k: 'a', amount: 10 }] });
ok(r.status === 400, 'no bets after close');
const T = s.table, f = T.fighters;
const fight = simulate({ ...f[0].build, name: f[0].name }, { ...f[1].build, name: f[1].name }, T.fight.seed, { draws: true });
const o = outcomeOf(fight);
ok(Math.abs(Date.parse(T.fight.ends_at) - Date.parse(T.fight.starts_at) - Math.ceil((3 + fight.length) * 1000)) < 2, 'client replay length matches end time');

advance(200000);
s = await call(arena, A, { action: 'state' });
ok(s.table.status === 'result' || s.table.round_no === round + 1, 'result or next round');
const tab = (await E.ArenaTable.filter({}, {})).items[0];
const outcome = tab.round_no === round ? tab.outcome : tab.recent[0].o;
ok(JSON.stringify(outcome) === JSON.stringify(o), 'client replay outcome == server outcome');
const mine = (await E.ArenaBet.filter({ member_id: A.id }, {})).items[0];
const expect = betReturn(mine.lines, o, {});
const before = await pts(A);
r = await call(arena, A, { action: 'settle' });
ok(r.ok, 'settle');
ok(await pts(A) === before + expect, `A paid ${expect} (winner ${o.winner}, draw ${o.draw})`);
r = await call(arena, A, { action: 'settle' });
ok(await pts(A) === before + expect, 'not paid twice');
// sweep pays the others
const bB = 100000 - 1, bC = 100000 - 300;
r = await call(arena, null, { action: 'sweep', __wf_secret: 'nope' });
ok(r.status === 401, 'sweep needs secret');
const secret = 'b5accf91588c6e85eac6c78d13fd4d3acec3b0ed15fbc065';   // the Arena Payouts workflow secret (arenaAction)
r = await call(arena, null, { action: 'sweep', __wf_secret: secret });
ok(r.ok, 'sweep runs (others were already paid by A\'s settle): ' + r.paid);
const rowB = (await E.ArenaBet.filter({ member_id: B.id }, {})).items[0], rowC = (await E.ArenaBet.filter({ member_id: C.id }, {})).items[0];
ok(rowB.settled && rowC.settled && (await pts(B)) === bB + rowB.payout && (await pts(C)) === bC + rowC.payout, 'others paid correct');

// draw handling via betReturn
const dro = { winner: -1, draw: true, oneHitBy: [false, false], critko: false, pots: 3, crits: 1 };
ok(betReturn([{ k: 'a', amount: 101, price: 1.8 }, { k: 'draw', amount: 10, price: 50 }], dro, {}) === 50 + 500, 'draw: half back on fighter bet, draw pays 50x');

// many rounds roll forward and history builds
for (let i = 0; i < 5; i++) { advance(400000); s = await call(arena, A, { action: 'state' }); }
ok(s.table.recent.length >= 1 && s.table.recent[0].seed !== undefined, 'history with replays: ' + s.table.recent.length);
done();