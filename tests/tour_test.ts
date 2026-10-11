import { advance, member, settings, call, pts, ok, done, E } from './h.ts';
import tour from '../base44/functions/tournamentAction/entry.ts';
import { simulate, outcomeOf, normValues, betReturn } from '../base44/shared/arenaEngine.ts';

await settings();
const L = await member('Juts', 100000, 'leader');
const ms = [];
for (let i = 0; i < 6; i++) ms.push(await member('F' + i, 50000));

// --- 1 entrant: cancel + refund
let r = await call(tour, ms[0], { action: 'create', title: 'x' });
ok(r.status === 403, 'only leader creates');
r = await call(tour, L, { action: 'create', title: 'Solo Cup', prizes: [{ kind: 'points', points: 1000 }] });
ok(r.ok, 'create');
r = await call(tour, ms[0], { action: 'buy', item: 'weapon' });
ok(r.status === 400 && /first entry/.test(r.error), 'need entry first');
r = await call(tour, ms[0], { action: 'buy', item: 'entry', count: 3 });
ok(r.ok && r.me.entries === 3 && r.rolled.ups.length === 2 && r.me.look, 'entries roll upgrades; character given: ' + r.me.look);
const look0 = r.me.look;
r = await call(tour, ms[0], { action: 'reroll' });
ok(r.ok && r.me.look !== look0 && r.me.rerolled, 'free re-roll gives a different character');
r = await call(tour, ms[0], { action: 'reroll' });
ok(r.status === 400, 'only one re-roll');
ok(await pts(ms[0]) === 50000 - 1500, 'paid 1500');
let s = await call(tour, L, { action: 'state' });
ok(s.bank.balance === 0 && s.tournament.bank_in === 1500, 'held on the fighter until the start: tournament shows 1500 paid in, bank 0');
r = await call(tour, L, { action: 'start' });
ok(r.ok && r.status === 'cancelled' && /Only 1 fighter/.test(r.cancel_reason), 'single entrant cancelled: ' + r.cancel_reason);
ok(await pts(ms[0]) === 50000, 'refunded');
s = await call(tour, L, { action: 'state' });
ok(s.bank.balance === 0 && s.tournament === null && s.last.status === 'cancelled', 'bank back to 0; last shows cancelled');
ok((await E.TourEntrant.filter({}, {})).items.length === 0, 'characters cleared');

// --- 5 entrants, scheduled
r = await call(tour, L, { action: 'create', title: 'Blacklist Cup', starts_at: new Date(Date.now() + 120000).toISOString(),
  values: { ups: { atk: 600 }, weapon: { chance: 0.5 } },
  prizes: [{ kind: 'points', points: 5000, from_bank: true }, { kind: 'points', points: 2000 }, { kind: 'item', label: 'Dragon Ball' }] });
ok(r.ok, 'create scheduled with values');
for (let i = 0; i < 5; i++) await call(tour, ms[i], { action: 'buy', item: 'entry', count: 1 + i * 3 });
r = await call(tour, ms[4], { action: 'buy', item: 'skill' });
ok(r.ok && r.me.skills.length === 1, 'skill bought: ' + r.rolled.skill);
r = await call(tour, ms[4], { action: 'buy', item: 'skill' });
r = await call(tour, ms[4], { action: 'buy', item: 'skill' });
ok(r.status === 400, 'max 2 skills');
r = await call(tour, ms[3], { action: 'buy', item: 'mount' });
ok(r.ok && r.me.mount.lv === 1 && r.rolled.drew, 'mount drew pair');
const oldPair = r.me.mount.pair;
r = await call(tour, ms[3], { action: 'buy', item: 'mountReset' });
ok(r.ok && r.me.mount.pair !== oldPair, 'mount reset gives a new pair');
r = await call(tour, ms[2], { action: 'buy', item: 'pet' });
ok(r.ok && r.me.pet === 1, 'pet');
for (let i = 0; i < 6; i++) await call(tour, ms[1], { action: 'buy', item: 'weapon' });
s = await call(tour, ms[1], { action: 'state' });
ok(s.me && s.me.weapon_tries >= 1 && s.entrants.length === 5, 'state shows me and entrants; weapon +' + s.me.weapon);
const looks = new Set(s.entrants.map((x) => x.look));
ok(looks.size === 5, 'unique characters');
const st0 = await call(tour, L, { action: 'state' });
const bankBefore = st0.bank.balance + st0.tournament.bank_in;   // paid in goes to the bank at the start
ok(st0.tournament.bank_in > 0 && st0.bank.balance === 0, 'paid in ' + st0.tournament.bank_in + ', bank still ' + st0.bank.balance);

// schedule passes: next visit starts it
advance(121000);
s = await call(tour, ms[5], { action: 'state' });
ok(s.tournament.status === 'running' && s.tournament.field.length === 5, 'auto-started on time');
const M = s.tournament.matches;
ok(M.length === 5 && M.some((m) => m.bronze) && M[M.length - 1].stage === 'Final', 'bracket: ' + M.map((m) => m.stage).join(', '));
ok(M.every((m) => m.seed === null && m.outcome === null), 'no seeds before matches');
const later = M.filter((m) => m.refs.some((x) => x.s === undefined));
ok(later.every((m) => m.a === null || m.refs[0].s !== undefined), 'later fighters hidden');

r = await call(tour, ms[5], { action: 'buy', item: 'entry' });
ok(r.status === 400, 'shop closed after start');

// bet on match 1 while open
advance(12000);
s = await call(tour, ms[5], { action: 'state' });
const m1 = s.tournament.matches[0];
ok(m1.status === 'betting' && m1.odds, 'match 1 open for bets');
r = await call(tour, ms[5], { action: 'bet', match: 1, lines: [{ k: 'a', amount: 500 }, { k: 'b', amount: 100 }] });
ok(r.status === 400 && /both/.test(r.error), 'no bet on both fighters in a match');
r = await call(tour, ms[5], { action: 'bet', match: 1, lines: [{ k: 'a', amount: 500 }] });
ok(r.ok, 'bet on match');
const fa = s.tournament.field[m1.a];
r = await call(tour, ms.find((x) => x.id === fa.member_id) || ms[0], { action: 'bet', match: 1, lines: [{ k: 'a', amount: 50 }] });
ok(r.ok, 'entrant can bet on own match');
r = await call(tour, ms[5], { action: 'bet', match: 2, lines: [{ k: 'a', amount: 10 }] });
ok(r.status === 400, 'later match not open');
advance(11000);
r = await call(tour, ms[5], { action: 'bet', match: 1, lines: [{ k: 'a', amount: 10 }] });
ok(r.status === 400, 'closed after 10 s');
s = await call(tour, ms[5], { action: 'state' });
const m1f = s.tournament.matches[0];
ok(m1f.seed !== null && m1f.status === 'fighting', 'seed out while fighting');
const values = normValues(s.tournament.values);
const F = s.tournament.field;
const fight = simulate({ ...F[m1f.a].build, name: F[m1f.a].name }, { ...F[m1f.b].build, name: F[m1f.b].name }, m1f.seed, { draws: false, values });
const o = outcomeOf(fight);

// run to the end
advance(3600 * 1000);
const before5 = await pts(ms[5]);
s = await call(tour, ms[5], { action: 'state' });
ok(s.tournament === null && s.last.status === 'done', 'finished');
const tr = (await E.Tournament.filter({ status: 'done' }, {})).items[0];
ok(JSON.stringify(tr.matches[0].outcome) === JSON.stringify(o), 'replay == server result');
const res = s.last.results;
ok(res.length >= 3 && res[0].paid && res[1].paid, 'prizes: ' + res.map((x) => `${x.place} ${x.name} ${x.prize} ${x.paid}`).join(' | '));
const win = ms.find((x) => x.id === res[0].member_id);
ok((await E.PointLog.filter({ member_id: win.id, source: 'tournament' }, {})).items.some((x) => x.amount === 5000), '1st got 5000');
s = await call(tour, L, { action: 'state' });
ok(s.bank.balance === bankBefore - 5000, 'from_bank prize came out of the bank: ' + s.bank.balance);
ok((await E.TourEntrant.filter({}, {})).items.length === 0, 'fighters cleared after the end');
r = await call(tour, ms[5], { action: 'settle' });
const row = (await E.ArenaBet.filter({ member_id: ms[5].id }, {})).items[0];
ok(row.settled && row.payout === betReturn(row.lines, o, {}), 'match bet paid ' + row.payout);
ok((await pts(ms[5])) === before5 + row.payout, 'balance matches');
// sweep
const secret = '102b949348f55485eb70915811df64e9899d03770a523a43';   // the Tournament Clock workflow secret (tournamentAction)
r = await call(tour, null, { action: 'sweep', __wf_secret: secret });
ok(r.ok, 'sweep ok');
ok((await E.ArenaBet.filter({ settled: false }, {})).items.length === 0, 'all bets settled');

// --- 2 entrants: single 1v1, and leader cancel refunds
r = await call(tour, L, { action: 'create', title: 'Duel' });
await call(tour, ms[0], { action: 'buy', item: 'entry' });
await call(tour, ms[1], { action: 'buy', item: 'entry' });
r = await call(tour, L, { action: 'start' });
s = await call(tour, L, { action: 'state' });
ok(s.tournament.matches.length === 1 && s.tournament.matches[0].stage === 'Final', '2 fighters: one final');
advance(3600 * 1000);
s = await call(tour, L, { action: 'state' });
ok(s.last.status === 'done' && s.last.results.length === 2, 'duel done');
r = await call(tour, L, { action: 'create', title: 'Oops' });
await call(tour, ms[2], { action: 'buy', item: 'entry', count: 2 });
const p2 = await pts(ms[2]);
r = await call(tour, L, { action: 'cancel' });
ok(r.ok && (await pts(ms[2])) === p2 + 1000, 'leader cancel refunds');
// bigger bracket
r = await call(tour, L, { action: 'create', title: 'Big' });
const many = [];
for (let i = 0; i < 13; i++) { const m = await member('B' + i, 10000); many.push(m); await call(tour, m, { action: 'buy', item: 'entry' }); }
r = await call(tour, L, { action: 'start' });
s = await call(tour, L, { action: 'state' });
ok(s.tournament.matches.length === 13, '13 fighters: 12 knockouts + 3rd place = ' + s.tournament.matches.length);
advance(3 * 3600 * 1000);
s = await call(tour, L, { action: 'state' });
ok(s.last.status === 'done' && new Set(s.last.results.map((x) => x.member_id)).size === 4, '4 distinct places');
done();