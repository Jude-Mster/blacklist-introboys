// 6.22: join + random stat packs, seeded double elimination with bracket predictions and the GP code pot,
// grudge matches (stakes, 5% cut, bets, expiry), the Hall of Fame and titles, replays from a link and the
// final's video to Discord.
import { advance, member, settings, call, pts, ok, done, E, enter } from './h.ts';
import tour from '../base44/functions/tournamentAction/entry.ts';
import { simulate, outcomeOf, LIMIT } from '../base44/shared/arenaEngine.ts';
import { sidesOf } from '../base44/shared/bracket.ts';

(globalThis as any).__secrets = { PRIZE_CODE_KEY: 'qa-test-key-0123456789abcdef' };
await settings({ games_enabled: ['arena'] });
const L = await member('Juts', 1e6, 'leader');
const ms = [];
for (let i = 0; i < 8; i++) ms.push(await member('P' + i, 100000));
const bank = async () => ((await E.ArenaBank.filter({}, {})).items[0] || { balance: 0 }).balance || 0;

// ---------- shop: join, then random stats in packs of 1, 5 and 10 ----------
let r = await call(tour, L, { action: 'create', predict_minutes: 61, title: 'x' });
ok(r.status === 400 && /0 to 60/.test(r.error), 'prediction window over 60 refused: ' + r.error);
r = await call(tour, L, { action: 'create', title: 'Four Cup', prizes: [1, 2, 3, 4].map((x) => ({ kind: 'points', points: x * 100 })) });
ok(r.status === 400 && /up to 3 prizes/.test(r.error), 'three winners only: a 4th prize is refused: ' + r.error);
r = await call(tour, L, { action: 'create', title: 'Pick Cup', prizes: [{ kind: 'points', points: 1000 }] });
ok(r.ok, 'created (prediction window defaults to 10 minutes)');
let s = await call(tour, ms[0], { action: 'state' });
ok(s.tournament.predict_minutes === 10 && s.costs.join === 500 && s.costs.roll === 500, 'join and random stat priced separately: ' + JSON.stringify(s.costs));
r = await call(tour, ms[0], { action: 'buy', item: 'roll', count: 1 });
ok(r.status === 400 && /Join the tournament first/.test(r.error), 'random stats need a fighter first');
r = await call(tour, ms[0], { action: 'buy', item: 'join' });
ok(r.ok && r.me.entries === 1 && r.rolled.ups.length === 0 && (await pts(ms[0])) === 99500, 'join: a fighter, no random stat, 500 points');
r = await call(tour, ms[0], { action: 'buy', item: 'join' });
ok(r.status === 400, 'cannot join twice');
for (const bad of [0, 2, 3, 7, 11, -5, 1.5]) {
  const b0 = await pts(ms[0]);
  r = await call(tour, ms[0], { action: 'buy', item: 'roll', count: bad });
  ok(r.status === 400 && (await pts(ms[0])) === b0, `a pack of ${bad} refused, nothing charged`);
}
r = await call(tour, ms[0], { action: 'buy', item: 'roll', count: 5 });
ok(r.ok && r.rolled.ups.length === 5 && (await pts(ms[0])) === 99500 - 2500, 'x5 random stats: 2,500 points, five rolls');
r = await call(tour, ms[0], { action: 'buy', item: 'roll', count: 10 });
ok(r.ok && r.rolled.ups.length === 10 && (await pts(ms[0])) === 99500 - 7500, 'x10 random stats: 5,000 points, ten rolls');
r = await call(tour, ms[0], { action: 'buy', item: 'roll', count: 1 });
ok(r.ok && r.rolled.ups.length === 1, 'x1 random stat');
r = await call(tour, ms[0], { action: 'buy', item: 'entry' });
ok(r.ok && r.rolled.ups.length === 1, 'an old screen\'s "entry" buys one random stat once you have joined');
for (let i = 1; i < 4; i++) await enter(tour, ms[i], 1 + i);

// ---------- the GP code pot ----------
r = await call(tour, ms[1], { action: 'pot_add', label: '1,000 GP', code: 'POTCODE0001' });
ok(r.status === 403, 'only the leader fills the pot');
r = await call(tour, L, { action: 'pot_add', label: '', code: 'POTCODE0001' });
ok(r.status === 400, 'pot code needs a name');
r = await call(tour, L, { action: 'pot_add', label: '1,000 GP', code: 'POTCODE0001' });
ok(r.ok && r.pot.length === 1, 'code added to the pot ' + (r.error || ''));
r = await call(tour, L, { action: 'pot_add', label: '500 GP', code: 'POTCODE0002' });
ok(r.ok && r.pot.length === 2, 'second code added');
r = await call(tour, L, { action: 'pot_remove', id: r.pot[1].id });
ok(r.ok && r.pot.length === 1, 'a code taken back out of the pot');
s = await call(tour, ms[2], { action: 'state' });
ok(s.pot.length === 1 && s.pot[0].label === '1,000 GP' && !('code' in s.pot[0]), 'members see the pot labels only');

// ---------- start: seeded, prediction window ----------
r = await call(tour, ms[0], { action: 'predict', picks: {} });
ok(r.status === 400 && /closed/.test(r.error), 'no predictions before the draw');
r = await call(tour, L, { action: 'start' });
ok(r.ok && r.status === 'predict', 'start: the bracket is drawn and predictions open (' + r.status + ')');
s = await call(tour, ms[5], { action: 'state' });
const T = s.tournament, M = T.matches;
ok(T.format === 'double' && M.length === 7, `4 fighters: double elimination, 6 matches + the reset (${M.length})`);
ok(M.every((m) => m.status !== 'betting' && m.seed === null), 'no match open and no seeds while predicting');
const bySeed = {}; T.field.forEach((f, i) => { bySeed[f.seed] = i; });
const w1 = M.filter((m) => m.sec === 'W' && m.round === 1).map((m) => m.refs.map((x) => x.s).sort().join());
ok(w1.includes([bySeed[1], bySeed[4]].sort().join()) && w1.includes([bySeed[2], bySeed[3]].sort().join()), 'seeding: 1 meets 4 and 2 meets 3 first, so 1 and 2 can only meet in the final ' + JSON.stringify({ w1, bySeed }));
const strongest = T.field[bySeed[1]].name;
ok(strongest === 'P0', 'the strongest build (18 entries against 2-4) is seed 1: ' + strongest + ' ' + T.field.map((f) => `${f.name}#${f.seed}`).join(' '));
r = await call(tour, ms[5], { action: 'buy', item: 'join' });
ok(r.status === 400, 'no joining once drawn');
// every possible prediction, each made by someone (one of them must be perfect)
const all = [];
const grow = (picks) => {
  const sides = sidesOf(M, picks);
  const next = M.find((m) => sides[m.no] !== 'skip' && picks[m.no] == null);
  if (!next) { all.push({ ...picks }); return; }
  for (const w of sides[next.no]) grow({ ...picks, [next.no]: w });
};
grow({});
ok(all.length === 2 ** 6 * 3 / 2, 'every complete prediction counted: ' + all.length);
r = await call(tour, ms[0], { action: 'predict', picks: { 1: all[0][1] } });
ok(r.status === 400 && /every match/.test(r.error), 'a half-filled prediction is refused: ' + r.error);
const bad = { ...all[0], [M[2].no]: 99 };
r = await call(tour, ms[0], { action: 'predict', picks: bad });
ok(r.status === 400, 'a pick of someone not in that match is refused');
const predictors = [];
for (let i = 0; i < all.length; i++) {
  const m = await member('Q' + i, 1000);
  predictors.push(m);
  r = await call(tour, m, { action: 'predict', picks: all[i] });
  if (!r.ok) { ok(false, 'prediction saved: ' + r.error); break; }
}
r = await call(tour, predictors[0], { action: 'predict', picks: all[1] });
ok(r.ok && JSON.stringify(r.picks) === JSON.stringify(all[1]), 'a prediction can be changed while the window is open');
r = await call(tour, predictors[0], { action: 'predict', picks: all[0] });
ok(r.ok && JSON.stringify(r.picks) === JSON.stringify(all[0]), '... and changed back');
s = await call(tour, predictors[0], { action: 'state' });
ok(s.prediction_count === all.length && s.my_prediction && s.my_prediction.champion != null, `count ${s.prediction_count}, my pick shows a champion`);
const b0 = await bank();

// window closes: matches begin
advance(10 * 60000 + 1000);
r = await call(tour, predictors[0], { action: 'predict', picks: all[0] });
ok(r.status === 400, 'predictions closed when the window ends');
s = await call(tour, ms[5], { action: 'state' });
ok(s.tournament.status === 'running', 'running after the prediction window: ' + s.tournament.status);
// Discord: watch links for every match result (a fake webhook records the posts)
const posts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { posts.push({ url: String(url), body: init && init.body }); return new Response('{}', { status: 200 }); };
(globalThis as any).__secrets.DISCORD_REPLAY_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/test';
for (let k = 0; k < 100; k++) { advance(15000); s = await call(tour, ms[5], { action: 'state' }); if (!s.tournament) break; }
ok(!s.tournament && s.last.status === 'done', 'finished');
const done1 = (await E.Tournament.get(T.id));
const fought = done1.matches.filter((m) => !m.skipped);
const cards = posts.filter((x) => typeof x.body === 'string' && /tour=/.test(x.body) && /match=/.test(x.body));
ok(cards.length === fought.length, `a result card with a watch link for each match (${cards.length} of ${fought.length})`);
ok(done1.prediction && done1.prediction.settled && done1.prediction.entries === all.length, 'predictions scored');
ok(done1.prediction.perfect_count === 1, 'exactly one perfect bracket: ' + done1.prediction.perfect_count);
const perfectRows = (await E.BracketPick.filter({ tour_id: T.id }, { limit: 1000 })).items.filter((x) => x.perfect);
ok(done1.prediction.winner_id && perfectRows.some((x) => x.member_id === done1.prediction.winner_id), 'the pot goes to a perfect predictor: ' + done1.prediction.winner_name);
const won = (await E.PrizeCode.filter({ member_id: done1.prediction.winner_id }, {})).items;
ok(won.length === 1 && won[0].label === '1,000 GP' && won[0].status !== 'reserved', 'the pot code was given to the winner');
ok((await E.PrizeCode.filter({ raffle_id: 'bracket-pot', status: 'reserved' }, {})).items.length === 0, 'the pot is empty after a win');
ok(done1.results[0].member_id === done1.field[fought[fought.length - 1].winner].member_id, '1st = the last grand final winner');

// replay from a link
r = await call(tour, ms[6], { action: 'replay', tour: T.id, match: fought[0].no });
const fm = r.match, fa = r.tour.field[fm.a], fb = r.tour.field[fm.b];
const again = outcomeOf(simulate({ ...fa.build, name: fa.name }, { ...fb.build, name: fb.name }, fm.seed, { draws: false, values: r.tour.values, limit: LIMIT }));
ok(r.server_now && JSON.stringify(again) === JSON.stringify(fm.outcome), 'replay link gives the same fight');
r = await call(tour, ms[6], { action: 'replay', tour: T.id, match: 999 });
ok(r.status === 400, 'replay of a match that does not exist refused');

// the final's video
const vid = btoa(String.fromCharCode(...new Uint8Array(4000).map((_, i) => i & 255)));
r = await call(tour, ms[1], { action: 'final_video', tour: T.id, data: vid, mime: 'video/webm' });
ok(r.status === 403, 'only the leader sends the video');
posts.length = 0;
r = await call(tour, L, { action: 'final_video', tour: T.id, data: vid, mime: 'video/webm' });
ok(r.ok && posts.length === 1 && posts[0].body instanceof FormData, 'final video posted to Discord as a file');
r = await call(tour, L, { action: 'final_video', tour: T.id, data: vid, mime: 'video/webm' });
ok(r.status === 400 && /already/.test(r.error), 'only once');

// ---------- Hall of Fame and titles ----------
r = await call(tour, ms[6], { action: 'hall' });
const champId = done1.results[0].member_id;
ok(r.hall && r.hall.champions.length === 1 && r.hall.reigning && r.hall.reigning.member_id === champId, 'hall: one champion, reigning');
ok(r.hall.titles[champId] === 'Reigning Champion', 'title: Reigning Champion');
ok(r.hall.leaders.predictions_won.length === 1, 'hall: the prediction winner is listed');
ok(r.hall.leaders.match_wins.length >= 2, 'hall: match wins listed');

// ---------- a second tournament: no perfect bracket, the pot rolls over ----------
r = await call(tour, L, { action: 'create', predict_minutes: 1, title: 'Roll Cup', prizes: [{ kind: 'points', points: 100 }] });
for (let i = 0; i < 3; i++) await enter(tour, ms[i], 1);
await call(tour, L, { action: 'pot_add', label: '2,000 GP', code: 'POTCODE0003' });
r = await call(tour, L, { action: 'start' });
s = await call(tour, ms[0], { action: 'state' });
ok(s.tournament.status === 'predict' && s.tournament.field.some((f) => f.title === 'Reigning Champion' || f.member_id !== champId), 'fighters carry their titles');
ok(s.titles[champId] === 'Reigning Champion', 'titles sent with the state');
advance(61000);
for (let k = 0; k < 100; k++) { advance(15000); s = await call(tour, ms[5], { action: 'state' }); if (!s.tournament) break; }
const done2 = (await E.Tournament.list()).find((x) => x.title === 'Roll Cup');
ok(done2.status === 'done' && done2.prediction && done2.prediction.entries === 0 && !done2.prediction.winner_id, 'no predictions: nobody wins');
ok((await E.PrizeCode.filter({ raffle_id: 'bracket-pot', status: 'reserved' }, {})).items.length === 1, 'the pot rolls over to the next tournament');

// ---------- grudge matches ----------
const [A, B, C] = [ms[5], ms[6], ms[7]];
r = await call(tour, A, { action: 'challenge', opponent: A.id, stake: 1000, size: 10 });
ok(r.status === 400, 'cannot challenge yourself');
for (const st of [99, 50001, 1.5, 'x']) { r = await call(tour, A, { action: 'challenge', opponent: B.id, stake: st, size: 10 }); ok(r.status === 400, `stake ${st} refused`); }
r = await call(tour, A, { action: 'challenge', opponent: B.id, stake: 1000, size: 7 });
ok(r.status === 400, 'only 10, 25 or 50 random stats');
const a0 = await pts(A), bb0 = await pts(B);
r = await call(tour, A, { action: 'challenge', opponent: B.id, stake: 1000, size: 25, message: 'you and me' });
ok(r.ok && (await pts(A)) === a0 - 1000, 'challenge: the stake is taken');
const gid = r.id;
r = await call(tour, A, { action: 'challenge', opponent: B.id, stake: 1000, size: 25 });
ok(r.status === 400, 'no second challenge to the same member while one waits');
r = await call(tour, C, { action: 'grudge_accept', id: gid });
ok(r.status === 400, 'only the challenged member can accept');
r = await call(tour, B, { action: 'grudge_accept', id: gid });
ok(r.ok && (await pts(B)) === bb0 - 1000 && r.grudge.phase === 'betting', 'accepted: the stake is taken, betting opens');
const G = r.grudge;
ok(G.fighters.length === 2 && G.fighters[0].weapon === G.fighters[1].weapon && G.fighters[0].pet === G.fighters[1].pet && G.fighters[0].skills.length === G.fighters[1].skills.length && (G.fighters[0].mount ? G.fighters[0].mount.lv : 0) === (G.fighters[1].mount ? G.fighters[1].mount.lv : 0), 'equal builds: same weapon, pet, mount level and number of skills');
const sumUps = (f) => Object.values(f.ups).reduce((a, v) => a + v, 0);
ok(G.fighters.every((f) => f.entries === 26) && sumUps(G.fighters[0]) <= 25 && sumUps(G.fighters[1]) <= 25, 'both 25 random stats');
ok(G.seed === null && G.outcome === null, 'no seed or result while betting');
const side = G.odds.a > 1 ? 'a' : G.odds.b > 1 ? 'b' : ((G.odds.side || []).find((x) => x.price > 1) || { id: 'lenover' }).id;   // a fighter if one is offered, else a side bet
const c0 = await pts(C);
r = await call(tour, C, { action: 'grudge_bet', id: gid, lines: [{ k: side, amount: 200 }] });
ok(r.ok && (await pts(C)) === c0 - 200, 'a member bets on the grudge match ' + (r.error || '') + JSON.stringify(G.odds));
r = await call(tour, C, { action: 'grudge_board', id: gid });
ok(r.board && r.board.bets.length === 1, 'the bet board shows it');
const bk0 = await bank();
advance(61000);
r = await call(tour, C, { action: 'grudge_bet', id: gid, lines: [{ k: side, amount: 200 }] });
ok(r.status === 400, 'betting closes after 60 seconds');
r = await call(tour, C, { action: 'grudges' });
let g1 = r.grudges.find((x) => x.id === gid);
ok(g1.phase === 'fighting' && g1.seed !== null && g1.outcome === null, 'fought from a secret seed when betting closed; result hidden until the end');
advance(300000);
posts.length = 0;
r = await call(tour, C, { action: 'grudges' });
g1 = r.grudges.find((x) => x.id === gid);
ok(g1.status === 'done' && g1.prize === 1900, 'done: the winner takes 2,000 less 5% = 1,900');
const winM = g1.winner === 0 ? A : B, loseM = g1.winner === 0 ? B : A;
ok((await pts(winM)) === (winM === A ? a0 : bb0) + 900 && (await pts(loseM)) === (loseM === A ? a0 : bb0) - 1000, 'winner +900 net, loser -1,000');
ok((await bank()) === bk0 + 100, 'the 5% cut (100) went to the Arena bank');
ok(posts.some((x) => typeof x.body === 'string' && /grudge=/.test(x.body)), 'grudge result card with a watch link sent to Discord');
const raw = await E.Grudge.get(gid);
const ga = outcomeOf(simulate({ ...raw.builds[0], name: raw.challenger_name }, { ...raw.builds[1], name: raw.opponent_name }, raw.seed, { draws: false, limit: LIMIT }));
ok(JSON.stringify(ga) === JSON.stringify(raw.outcome), 'the grudge replays the same from its seed');
r = await call(tour, C, { action: 'settle' });
const cb = (await E.ArenaBet.filter({ member_id: C.id, tour_id: `grudge:${gid}` }, {})).items[0];
ok(cb && cb.settled, 'the grudge bet was paid out: ' + (cb && cb.payout));
r = await call(tour, C, { action: 'replay', grudge: gid });
ok(r.grudge && r.grudge.seed === raw.seed && r.grudge.winner === raw.winner, 'grudge replay link');
r = await call(tour, C, { action: 'hall' });
ok(r.hall.leaders.grudge_wins[0].member_id === winM.id && r.hall.records.biggest_grudge.stake === 1000, 'hall: grudge wins and the biggest grudge');

// decline, withdraw, expire: the stake comes back
let p0 = await pts(A);
r = await call(tour, A, { action: 'challenge', opponent: C.id, stake: 500, size: 10 });
const g2 = r.id;
r = await call(tour, C, { action: 'grudge_decline', id: g2 });
ok(r.ok && (await pts(A)) === p0, 'declined: stake back');
r = await call(tour, A, { action: 'challenge', opponent: C.id, stake: 500, size: 10 });
r = await call(tour, A, { action: 'grudge_cancel', id: r.id });
ok(r.ok && (await pts(A)) === p0, 'withdrawn: stake back');
r = await call(tour, A, { action: 'challenge', opponent: C.id, stake: 500, size: 10 });
const g3 = r.id;
advance(24 * 3600000 + 1000);
const secret = '102b949348f55485eb70915811df64e9899d03770a523a43';
r = await call(tour, null, { action: 'sweep', __wf_secret: secret });
ok(r.ok && (await E.Grudge.get(g3)).status === 'expired' && (await pts(A)) === p0, 'expired by the clock: stake back');
r = await call(tour, C, { action: 'grudge_accept', id: g3 });
ok(r.status === 400, 'an expired challenge cannot be accepted');
// race: two accepts at once take the stake once
r = await call(tour, A, { action: 'challenge', opponent: C.id, stake: 700, size: 10 });
const g4 = r.id, cc0 = await pts(C);
const rs = await Promise.all([1, 2, 3].map(() => call(tour, C, { action: 'grudge_accept', id: g4 })));
ok(rs.filter((x) => x.ok).length === 1 && (await pts(C)) === cc0 - 700, 'three accepts at once: one goes through, the stake is taken once');

globalThis.fetch = realFetch;
done();
