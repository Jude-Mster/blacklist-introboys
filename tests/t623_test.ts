// 6.23: a busy tournament stays light. The crowd comes with the screen's own poll, the predictions are one
// shared read, a purchase only clears the fighters list, the grudge board comes with the grudge list, and
// collecting with nothing to collect takes no lock.
import { member, settings, call, ok, done, advance } from './h.ts';
const g = globalThis as any;
g.__settingsCacheMs = 30000;
g.__secrets = { PRIZE_CODE_KEY: 'qa-test-key-0123456789abcdef' };
const tour = (await import('../base44/functions/tournamentAction/entry.ts')).default;
const arena = (await import('../base44/functions/arenaAction/entry.ts')).default;
const ops = async (fn) => { g.__byOp = {}; const r = await fn(); const o = g.__byOp; g.__byOp = null; return { r, o, n: Object.values(o).reduce((a: number, b: any) => a + b, 0) as number }; };
const count = (o, prefix) => Object.entries(o).filter(([k]) => k.startsWith(prefix)).reduce((a, [, v]: any) => a + v, 0);

await settings({ games_enabled: ['arena'] });
const L = await member('Juts', 1e6, 'leader');
const crowd = []; for (let i = 0; i < 20; i++) crowd.push(await member('C' + i, 1e6));

// the Live Arena: the crowd comes with the table
let s = await call(arena, crowd[0], { action: 'state', crowd: true, here: true });
ok(s.status === 200 && s.crowd && s.crowd.watching === 1, `Live Arena state carries the crowd (${JSON.stringify(s.crowd)})`);
s = await call(arena, crowd[1], { action: 'state' });
ok(s.status === 200 && s.crowd === undefined, 'no crowd unless asked');

// a tournament in sign-up
let r = await call(tour, L, { action: 'create', title: 'Light Cup', predict_minutes: 5, prizes: [{ kind: 'points', points: 100 }] });
ok(r.ok, 'created');
for (const m of crowd.slice(0, 8)) await call(tour, m, { action: 'buy', item: 'join' });
s = await call(tour, crowd[0], { action: 'state', crowd: true, here: true });
ok(s.crowd && s.crowd.watching === 1, `tournament state carries the crowd (${JSON.stringify(s.crowd)})`);
await Promise.all(crowd.map((m) => call(tour, m, { action: 'state', crowd: true, here: true })));
s = await call(tour, crowd[5], { action: 'state', crowd: true });
ok(s.crowd.watching === 20, `all 20 counted as watching (${s.crowd.watching})`);

// the Hall of Fame is not read again because someone bought something
await call(tour, crowd[0], { action: 'hall' });
await call(tour, crowd[1], { action: 'buy', item: 'roll', count: 5 });
let m = await ops(() => call(tour, crowd[2], { action: 'hall' }));
ok(m.r.hall && count(m.o, 'Tournament.') === 0 && count(m.o, 'Grudge.') === 0, `a purchase doesn't clear the Hall of Fame (${JSON.stringify(m.o)})`);
// ... but the fighters list shows the purchase at once
s = await call(tour, crowd[3], { action: 'state' });
ok(s.entrants.find((x) => x.member_id === crowd[1].id).ups && Object.values(s.entrants.find((x) => x.member_id === crowd[1].id).ups).reduce((a: number, b: any) => a + b, 0) === 5, 'the purchase shows on the fighters list at once');
// a purchase: one tournament read (the check after saving), not three
m = await ops(() => call(tour, crowd[4], { action: 'buy', item: 'roll', count: 1 }));
ok(m.r.ok && count(m.o, 'Tournament.') <= 1, `a purchase reads the tournament once (${JSON.stringify(m.o)})`);

// the prediction window: 20 screens share one read of the predictions, and the tournament isn't read on every look
r = await call(tour, L, { action: 'start' });
ok(r.ok && r.status === 'predict', 'predictions open');
advance(7000);
m = await ops(() => Promise.all(crowd.map((x) => call(tour, x, { action: 'state' }))));
ok(count(m.o, 'BracketPick.') <= 1, `20 screens: ${count(m.o, 'BracketPick.')} prediction read(s) (one per screen before)`);
ok(count(m.o, 'Tournament.') <= 2, `20 screens: ${count(m.o, 'Tournament.')} tournament reads during the prediction window (the tournament once, the Hall of Fame once after the start) ${JSON.stringify(m.o)}`);
s = await call(tour, crowd[0], { action: 'state' });
const { sidesOf } = await import('../base44/shared/bracket.ts');
let picks = {}; const ms = s.tournament.matches;
for (let k = 0; k < ms.length + 2; k++) { const sd = sidesOf(ms, picks); const mm = ms.find((x) => sd[x.no] !== 'skip' && picks[x.no] == null && sd[x.no] && sd[x.no][0] != null && sd[x.no][1] != null); if (!mm) break; picks = { ...picks, [mm.no]: sd[mm.no][0] }; }
r = await call(tour, crowd[0], { action: 'predict', picks });
ok(r.ok, 'prediction saved');
s = await call(tour, crowd[0], { action: 'state' });
ok(s.my_prediction && s.prediction_count === 1, 'my prediction shows straight away on my next look');
s = await call(tour, crowd[6], { action: 'state' });
ok(!s.my_prediction && s.prediction_count === 1, "others see the count, not someone else's picks");

// collecting with nothing to collect takes no lock
m = await ops(() => call(tour, crowd[7], { action: 'settle' }));
ok(m.r.ok && count(m.o, 'Lock.') === 0, `settle with nothing owed: no lock (${JSON.stringify(m.o)})`);

// a grudge match: the bet board comes with the list
const c = await call(tour, crowd[10], { action: 'challenge', opponent: crowd[11].id, stake: 200, size: 10 });
await call(tour, crowd[11], { action: 'grudge_accept', id: c.id });
let gl = await call(tour, crowd[12], { action: 'grudges' });
let gr = gl.grudges.find((x) => x.id === c.id);
ok(gr && gr.status === 'running' && gr.board && Array.isArray(gr.board.bets), 'the running grudge carries its bet board');
const side = gr.odds.a > 1 ? 'a' : gr.odds.b > 1 ? 'b' : ((gr.odds.side || []).find((x) => x.price > 1) || { id: 'lenover' }).id;
r = await call(tour, crowd[12], { action: 'grudge_bet', id: c.id, lines: [{ k: side, amount: 50 }] });
ok(r.ok, 'grudge bet placed');
gl = await call(tour, crowd[12], { action: 'grudges' });
gr = gl.grudges.find((x) => x.id === c.id);
ok(gr.board.bets.length === 1 && gr.board.mine && gr.board.mine.amount === 50, 'my grudge bet shows on the board with the list');
m = await ops(() => Promise.all(crowd.map((x) => call(tour, x, { action: 'grudges' }))));
ok(count(m.o, 'Grudge.') <= 2, `20 screens on the Grudge tab: ${count(m.o, 'Grudge.')} grudge reads`);
// the list moves on the moment betting closes, even though it is shared for longer
advance(61000);
gl = await call(tour, crowd[13], { action: 'grudges' });
gr = gl.grudges.find((x) => x.id === c.id);
ok(gr.phase === 'fighting' || gr.phase === 'result', `after betting closes the grudge is fought straight away (${gr.phase})`);
done();
