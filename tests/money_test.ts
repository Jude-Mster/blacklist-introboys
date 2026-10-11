// Phase 2: points, betting and payouts, run for real against the backend functions on the in-memory store.
// Every test ends with the ledger check: for every member, points = starting points + sum of their PointLog,
// and nobody is below 0. Double clicks are fired as 6 identical requests at the same moment.
import { member, settings, call, E, advance, ok, done } from './h.ts';
const F = async (n) => (await import(`../base44/functions/${n}/entry.ts`)).default;
const arena = await F('arenaAction'), tour = await F('tournamentAction'), roul = await F('rouletteAction'), sicbo = await F('sicboAction'),
  wheel = await F('wheelAction'), derby = await F('derbyAction'), play = await F('playGame'), daily = await F('claimDaily'),
  award = await F('awardPoints'), duel = await F('duelAction'), shop = await F('shopAction'), bj = await F('blackjackAction'), l9 = await F('lucky9Action');
const SECRET = { arena: 'b5accf91588c6e85eac6c78d13fd4d3acec3b0ed15fbc065', tour: '102b949348f55485eb70915811df64e9899d03770a523a43', derby: '0e8969e4c6d6eececae2d761309a066b437efb450f70350a' };
const ALL = ['lanternslots', 'arena', 'derby', 'roulette', 'dragondice', 'sicbo', 'wheel', 'blackjack', 'lucky9', 'coinflip', 'dice', 'fortune', 'skywheel', 'duel', 'poker', 'pusoy', 'shop'];
await settings({ games_enabled: ALL, daily_bet_cap: 1000000, award_cap_per_day: 1000 });
const START = 100000;
const A = await member('Alpha', START), B = await member('Bravo', START), C = await member('Charlie', START), D = await member('Delta', START);
const O = await member('Officer', START, 'officer'), L = await member('Leader', START, 'leader');
const people = [A, B, C, D, O, L];
const pts = async (m) => (await E.Member.get(m.id)).points;
const race = (n, f) => Promise.all(Array.from({ length: n }, () => f()));
const logs = async (m) => (await E.PointLog.filter({ member_id: m.id }, {})).items;
async function ledger(tag) {
  let bad = [];
  for (const m of people) {
    const p = await pts(m), sum = (await logs(m)).reduce((a, l) => a + l.amount, 0);
    if (p !== START + sum || p < 0) bad.push(`${m.discord_name}: points ${p}, start+log ${START + sum}`);
  }
  ok(!bad.length, `[${tag}] ledger: points = start + PointLog for everyone, none below 0 ${bad.join('; ')}`);
}
const statusCount = (rs) => rs.reduce((o, r) => { o[r.status] = (o[r.status] || 0) + 1; return o; }, {});
const BAD = [-100, 0, 0.5, 1.5, 1e20, 'abc', null, NaN, '100abc', [], {}];

// ---------- daily wheel ----------
{
  const before = await pts(A);
  const rs = await race(6, () => call(daily, A, {}));
  const okN = rs.filter((r) => r.status === 200).length;
  ok(okN === 1, `daily wheel x6 at once: exactly one prize (got ${okN}) ${JSON.stringify(statusCount(rs))}`);
  ok((await pts(A)) - before === (rs.find((r) => r.status === 200) || {}).prize, 'daily wheel: balance went up by the prize shown');
  advance(23 * 3600e3); ok((await call(daily, A, {})).status === 400, 'daily wheel: not again within 24 h');
  advance(3600e3 + 1000); ok((await call(daily, A, {})).status === 200, 'daily wheel: again after 24 h');
  await ledger('daily');
}

// ---------- officer awards ----------
{
  ok((await call(award, A, { discordId: B.discord_id, amount: 100, reason: 'x' })).status === 403, 'award: a member cannot award');
  const self = await call(award, O, { discordId: O.discord_id, amount: 100, reason: 'x' });
  console.log(`NOTE - award: an officer awarding themselves gets ${self.status} (waiting on the Guild Leader's decision)`);
  for (const v of BAD) { const r = await call(award, O, { discordId: B.discord_id, amount: v, reason: 'x' }); ok(r.status >= 400, `award: amount ${JSON.stringify(v)} refused (got ${r.status} ${r.error || ''})`); }
  const before = await pts(B);
  const rs = await race(6, () => call(award, O, { discordId: B.discord_id, amount: 400, reason: 'race' }));
  const got = (await pts(B)) - before;
  ok(got <= 1000, `award: 6 x 400 at once stays within the 1,000 daily cap (B got ${got}) ${JSON.stringify(statusCount(rs))}`);
  await ledger('award');
}

// ---------- instant games ----------
{
  for (const v of BAD) { const b0 = await pts(C); const r = await call(play, C, { game: 'coinflip', wager: v, choice: 'heads' }); ok(r.status >= 400 && (await pts(C)) === b0, `coin flip: wager ${JSON.stringify(v)} refused, no points moved (got ${r.status})`); }
  const rs = await race(10, () => call(play, C, { game: 'coinflip', wager: 100, choice: 'heads' }));
  ok(rs.every((r) => r.status === 200), `coin flip x10 at once: all played ${JSON.stringify(statusCount(rs))}`);
  await ledger('coin flip');
  await E.Settings.update((await E.Settings.filter({}, {})).items[0].id, { daily_bet_cap: 1000 });
  (globalThis as any).__settingsCacheMs = 0;
  const D0 = await pts(D);
  const rs2 = await race(20, () => call(play, D, { game: 'coinflip', wager: 100, choice: 'tails' }));
  const played = rs2.filter((r) => r.status === 200).length;
  ok(played <= 10, `daily cap 1,000: 20 x 100 at once, at most 10 played (got ${played})`);
  await E.Settings.update((await E.Settings.filter({}, {})).items[0].id, { daily_bet_cap: 1000000 });
  await ledger('daily cap');
  for (const g of [{ game: 'lanternslots' }, { game: 'fortune' }, { game: 'skywheel', choice: (await import('../base44/shared/points.ts')).WHEEL_SEGMENTS[0] }]) {
    const r = await call(play, C, { ...g, wager: 100 });
    ok(r.status === 200, `${g.game}: plays (${r.status} ${r.error || ''})`);
  }
  await ledger('instant games');
}

// ---------- roulette ----------
{
  await call(roul, A, { action: 'state' });
  for (const v of BAD) { const b0 = await pts(A); const r = await call(roul, A, { action: 'bet', bets: [{ type: 'red', amount: v }] }); ok(r.status >= 400 && (await pts(A)) === b0, `roulette: chip ${JSON.stringify(v)} refused (got ${r.status})`); }
  ok((await call(roul, A, { action: 'bet', bets: [{ type: 'purple', amount: 100 }] })).status === 400, 'roulette: unknown spot refused');
  const a0 = await pts(A);
  const rs = await race(6, () => call(roul, A, { action: 'bet', bets: [{ type: 'red', amount: 1000 }] }));
  const placed = rs.filter((r) => r.status === 200).length;
  const row = (await E.RouletteBet.filter({ member_id: A.id }, {})).items[0];
  ok(row && row.amount === placed * 1000 && a0 - (await pts(A)) === placed * 1000, `roulette x6 at once: charged once per accepted bet (accepted ${placed}, on table ${row && row.amount}, charged ${a0 - (await pts(A))})`);
  ok(row.amount <= 5000, 'roulette: within the 5,000 per spin limit');
  await call(roul, B, { action: 'bet', bets: [{ type: 'green', amount: 100 }, { type: 'black', amount: 50 }] });
  advance(120e3);
  await race(6, () => call(roul, C, { action: 'state' }));
  await Promise.all([call(roul, A, { action: 'state' }), call(roul, B, { action: 'state' }), call(roul, D, { action: 'state' })]);
  advance(60e3); await race(3, () => call(roul, D, { action: 'state' }));
  const settled = (await E.RouletteBet.filter({}, {})).items;
  ok(settled.every((x) => x.settled), 'roulette: every bet settled');
  for (const m of [A, B]) {
    const wins = (await logs(m)).filter((l) => /Roulette.*win|round .* win/i.test(l.reason) && /oulette|Dragon/i.test(l.reason));
    ok(wins.length <= 1, `roulette: ${m.discord_name} paid at most once (${wins.length})`);
  }
  await ledger('roulette');
}

// ---------- sic bo ----------
{
  await call(sicbo, A, { action: 'state' });
  for (const v of BAD) { const b0 = await pts(B); const r = await call(sicbo, B, { action: 'bet', bets: [{ type: 'big', amount: v }] }); ok(r.status >= 400 && (await pts(B)) === b0, `sic bo: chip ${JSON.stringify(v)} refused (got ${r.status})`); }
  const b0 = await pts(B);
  const rs = await race(6, () => call(sicbo, B, { action: 'bet', bets: [{ type: 'big', amount: 1000 }] }));
  const placed = rs.filter((r) => r.status === 200).length;
  ok(b0 - (await pts(B)) === placed * 1000, `sic bo x6 at once: charged once per accepted bet (accepted ${placed}) ${JSON.stringify(statusCount(rs))}`);
  const tb = await call(sicbo, B, { action: 'remove', all: true });
  ok(tb.status === 200 && (await pts(B)) === b0, `sic bo: taking every chip back returns everything (${tb.status} ${tb.error || ''})`);
  await call(sicbo, B, { action: 'bet', bets: [{ type: 't10', amount: 100 }, { type: 'n3', amount: 100 }] });
  advance(120e3); await race(6, () => call(sicbo, C, { action: 'settle' })); await race(3, () => call(sicbo, B, { action: 'state' }));
  advance(60e3); await race(3, () => call(sicbo, B, { action: 'settle' }));
  const rows = (await E.SicBoBet.filter({ member_id: B.id }, {})).items;
  ok(rows.length && rows.every((x) => x.settled), 'sic bo: bet settled');
  await ledger('sic bo');
}

// ---------- sky wheel ----------
{
  await call(wheel, C, { action: 'state' });
  for (const v of BAD) { const b0 = await pts(C); const r = await call(wheel, C, { action: 'bet', faction: 'dragon', amount: v }); ok(r.status >= 400 && (await pts(C)) === b0, `wheel: amount ${JSON.stringify(v)} refused (got ${r.status})`); }
  const c0 = await pts(C);
  const rs = await race(6, () => call(wheel, C, { action: 'bet', faction: 'dragon', amount: 1000 }));
  const placed = rs.filter((r) => r.status === 200).length;
  ok(c0 - (await pts(C)) === placed * 1000, `wheel x6 at once: charged once per accepted bet (accepted ${placed})`);
  advance(120e3); await race(6, () => call(wheel, D, { action: 'state' })); advance(60e3); await race(3, () => call(wheel, C, { action: 'state' }));
  await ledger('wheel');
}

// ---------- derby ----------
{
  const s = await call(derby, A, { action: 'state' });
  const round = s.table && s.table.round_no;
  for (const v of BAD) { const b0 = await pts(A); const r = await call(derby, A, { action: 'bet', round, lines: [{ type: 'win', a: 0, amount: v }] }); ok(r.status >= 400 && (await pts(A)) === b0, `derby: amount ${JSON.stringify(v)} refused (got ${r.status})`); }
  const a0 = await pts(A);
  const rs = await race(6, () => call(derby, A, { action: 'bet', round, lines: [{ type: 'win', a: 1, amount: 300 }] }));
  const placed = rs.filter((r) => r.status === 200).length;
  ok(placed >= 1 && a0 - (await pts(A)) === placed * 300, `derby x6 at once: charged once per accepted bet (accepted ${placed}) ${JSON.stringify(statusCount(rs))} ${rs.find((r) => r.status !== 200)?.error || ''}`);
  for (let k = 0; k < 8; k++) { advance(60e3); await Promise.all([call(derby, A, { action: 'settle' }), call(derby, B, { action: 'settle' }), call(derby, C, { action: 'state' }), call(derby, null, { action: 'sweep', __wf_secret: SECRET.derby })]); }
  const rows = (await E.DerbyBet.filter({ member_id: A.id }, {})).items;
  ok(rows.length === 1 && rows[0].settled, `derby: bet settled (${rows.length} rows)`);
  const winsA = (await logs(A)).filter((l) => /race \d+ (win|bet returned) \[/i.test(l.reason));
  ok(winsA.length <= 1, `derby: paid at most once (${winsA.length})`);
  await ledger('derby');
}

// ---------- live arena ----------
{
  let s = await call(arena, A, { action: 'state' });
  const round = s.table.round_no, odds = s.table.odds;
  const fk = odds.a > 1 ? 'a' : 'b';
  for (const v of BAD) { const b0 = await pts(B); const r = await call(arena, B, { action: 'bet', round, lines: [{ k: fk, amount: v }] }); ok(r.status >= 400 && (await pts(B)) === b0, `arena: amount ${JSON.stringify(v)} refused (got ${r.status})`); if (r.status === 200) await call(arena, B, { action: 'remove', round, all: true }); }
  const b0 = await pts(B);
  const rs = await race(6, () => call(arena, B, { action: 'bet', round, lines: [{ k: fk, amount: 700 }] }));
  const placed = rs.filter((r) => r.status === 200).length;
  const row = (await E.ArenaBet.filter({ member_id: B.id }, {})).items[0];
  ok(row.amount === placed * 700 && b0 - (await pts(B)) === placed * 700, `arena x6 at once: charged once per accepted bet (accepted ${placed}, on the slip ${row.amount})`);
  ok(row.amount <= 5000, 'arena: within the 5,000 per fight limit');
  // take back twice at once
  const tb = await race(4, () => call(arena, B, { action: 'remove', round, all: true }));
  ok((await pts(B)) === b0, `arena: take everything back x4 at once returns exactly the stake once (${JSON.stringify(statusCount(tb))})`);
  await call(arena, B, { action: 'bet', round, lines: [{ k: fk, amount: 1000 }] });
  await call(arena, C, { action: 'bet', round, lines: [{ k: 'draw', amount: 100 }] });
  advance(31e3); s = await call(arena, A, { action: 'state' });
  ok((await call(arena, D, { action: 'bet', round, lines: [{ k: fk, amount: 100 }] })).status === 400, 'arena: no bets after betting closes');
  advance(400e3);
  await Promise.all([...Array.from({ length: 4 }, () => call(arena, B, { action: 'settle' })), call(arena, C, { action: 'settle' }), call(arena, A, { action: 'state' }), call(arena, null, { action: 'sweep', __wf_secret: SECRET.arena }), call(arena, null, { action: 'sweep', __wf_secret: SECRET.arena })]);
  const rowB = (await E.ArenaBet.filter({ member_id: B.id }, {})).items[0];
  const paidB = (await logs(B)).filter((l) => /Blacklist Arena fight/i.test(l.reason) && l.amount > 0 && !/returned|taken back/i.test(l.reason)).reduce((a, l) => a + l.amount, 0);
  ok(rowB.settled && paidB === rowB.payout, `arena: settled once at the shown payout (payout ${rowB.payout}, paid ${paidB})`);
  await ledger('arena');
}

// ---------- tournament ----------
{
  ok((await call(tour, A, { action: 'create', title: 'x' })).status === 403, 'tournament: a member cannot open one');
  const cr = await call(tour, L, { action: 'create', title: 'QA Cup', prizes: [{ kind: 'points', points: 2000 }, { kind: 'points', points: 500, from_bank: true }], costs: { entry: 300 } });
  ok(cr.ok, 'tournament: leader opens one');
  const before = Object.fromEntries(await Promise.all(people.map(async (m) => [m.id, await pts(m)])));
  for (const v of [-1, 0, 1.5, 51, 'x', null]) { const b0 = await pts(A); const r = await call(tour, A, { action: 'buy', item: 'entry', count: v, price: 300 }); ok((v === null ? r.ok === true : r.status >= 400), `tournament: entry count ${JSON.stringify(v)} handled (got ${r.status} ${r.error || ''})`); if (v === null && r.ok) await call(tour, A, { action: 'state' }); }
  for (const m of [A, B, C, D]) { const rs = await race(6, () => call(tour, m, { action: 'buy', item: 'entry', count: 1, price: 300 })); ok(rs.filter((r) => r.status === 200).length >= 1, `tournament: ${m.discord_name} bought entries at once ${JSON.stringify(statusCount(rs))}`); }
  const ents = (await E.TourEntrant.filter({}, {})).items;
  for (const m of [A, B, C, D]) { const x = ents.filter((e) => e.member_id === m.id); ok(x.length === 1 && before[m.id] - (await pts(m)) === x[0].spent && x[0].spent === x[0].entries * 300, `tournament: ${m.discord_name} one fighter, charged = spent = entries x price (${x.length} rows, entries ${x[0] && x[0].entries}, spent ${x[0] && x[0].spent}, charged ${before[m.id] - (await pts(m))})`); }
  const rr = await race(5, () => call(tour, A, { action: 'reroll' }));
  ok(rr.filter((r) => r.status === 200).length === 1, `tournament: one free re-roll even when clicked 5 times at once ${JSON.stringify(statusCount(rr))}`);
  const st = await call(tour, L, { action: 'start' });
  ok(st.ok === true, `tournament: starts (${st.status} ${st.error || ''})`);
  const bank0 = (await E.ArenaBank.filter({}, {})).items[0];
  const paidIn = ents.reduce((a, x) => a + (x.spent || 0), 0);
  ok(bank0 && bank0.balance === paidIn, `tournament: the bank received what the fighters paid (${bank0 && bank0.balance} vs ${paidIn})`);
  // run every match: bet on each, let it play, settle from several places at once
  for (let k = 0; k < 40; k++) {
    advance(15e3);
    const s = await call(tour, B, { action: 'state' });
    const t = s.tournament; if (!t) break;
    if (t.status !== 'running') { await Promise.all([call(tour, C, { action: 'state' }), call(tour, null, { action: 'sweep', __wf_secret: SECRET.tour })]); continue; }
    const m = t.matches.find((x) => x.status === 'betting');
    if (m && m.odds) { const k2 = m.odds.a > 1 ? 'a' : 'b'; await race(3, () => call(tour, D, { action: 'bet', match: m.no, lines: [{ k: k2, amount: 100 }] })); }
    await Promise.all([call(tour, D, { action: 'settle' }), call(tour, D, { action: 'settle' }), call(tour, null, { action: 'sweep', __wf_secret: SECRET.tour })]);
  }
  for (let k = 0; k < 6; k++) { advance(20e3); await Promise.all([call(tour, A, { action: 'state' }), call(tour, L, { action: 'state' }), call(tour, null, { action: 'sweep', __wf_secret: SECRET.tour }), call(tour, D, { action: 'settle' })]); }
  const last = (await E.Tournament.filter({}, { sort: '-created_date' })).items[0];
  ok(last.status === 'done', `tournament: finished (${last.status})`);
  const prizeLogs = (await E.PointLog.filter({ source: 'tournament' }, {})).items.filter((l) => l.amount > 0 && /prize|place|1st|2nd/i.test(l.reason));
  ok(prizeLogs.length === 2 && prizeLogs.reduce((a, l) => a + l.amount, 0) === 2500, `tournament: prizes paid exactly once (${prizeLogs.length} payments, ${prizeLogs.reduce((a, l) => a + l.amount, 0)} points: ${prizeLogs.map((l) => l.reason).join(' | ')})`);
  const bank1 = (await E.ArenaBank.filter({}, {})).items[0];
  ok(bank1.balance === paidIn - 500, `tournament: the bank paid the 500 prize marked "from the bank" (bank ${bank1.balance}, expected ${paidIn - 500})`);
  const tb = (await E.ArenaBet.filter({ scope: 'tour' }, {})).items;
  ok(tb.every((x) => x.settled), `tournament: every match bet settled (${tb.filter((x) => !x.settled).length} open of ${tb.length})`);
  await ledger('tournament');
}

// ---------- coin duels ----------
{
  for (const v of BAD) { const b0 = await pts(A); const r = await call(duel, A, { action: 'create', wager: v, side: 'heads' }); ok(r.status >= 400 && (await pts(A)) === b0, `duel: wager ${JSON.stringify(v)} refused (got ${r.status})`); }
  const cr = await call(duel, A, { action: 'create', wager: 500, side: 'heads' });
  ok(cr.status === 200, `duel: created (${cr.status} ${cr.error || ''})`);
  const id = cr.duel ? cr.duel.id : (cr.id || ((await E.CoinDuel.filter({}, {})).items[0] || {}).id);
  ok((await call(duel, A, { action: 'accept', id })).status >= 400, 'duel: cannot accept your own');
  const rs = await Promise.all([call(duel, B, { action: 'accept', id }), call(duel, C, { action: 'accept', id }), call(duel, D, { action: 'accept', id }), call(duel, A, { action: 'cancel', id })]);
  ok(rs.filter((r) => r.status === 200).length === 1, `duel: accept x3 + cancel at the same moment, only one goes through ${JSON.stringify(rs.map((r) => r.status))}`);
  const cr2 = await call(duel, B, { action: 'create', wager: 300, side: 'tails' });
  const id2 = cr2.duel ? cr2.duel.id : (await E.CoinDuel.filter({ creator_id: B.id }, {})).items.find((x) => x.status === 'open')?.id;
  const cc = await race(4, () => call(duel, B, { action: 'cancel', id: id2 }));
  ok(cc.filter((r) => r.status === 200).length === 1, `duel: cancel x4 at once refunds once ${JSON.stringify(cc.map((r) => r.status))}`);
  await ledger('duel');
}

// ---------- shop ----------
{
  const si = await call(shop, L, { action: 'saveItem', item: { name: 'QA Gem', value_cp: 100, stock: 2, active: true, sort: 1, kind: 'item' } });
  ok(si.status === 200, `shop: leader adds an item (${si.status} ${si.error || ''})`);
  const cat = await call(shop, A, { action: 'catalog' });
  const item = (cat.items || []).find((x) => x.name === 'QA Gem');
  ok(!!item, 'shop: item in the catalog');
  if (item) {
    for (const v of [0, -1, 1.5, 1e9, 'x']) { const b0 = await pts(A); const r = await call(shop, A, { action: 'buy', itemId: item.id, qty: v, character: 'Juts', expectTotal: item.total }); ok(r.status >= 400 && (await pts(A)) === b0, `shop: qty ${JSON.stringify(v)} refused (got ${r.status})`); }
    const rs = await Promise.all([A, A, A, B, B, C].map((m) => call(shop, m, { action: 'buy', itemId: item.id, qty: 1, character: 'Juts', expectTotal: item.total })));
    const sold = rs.filter((r) => r.status === 200).length;
    ok(sold <= 2, `shop: stock 2, six buys at once, at most 2 sold (sold ${sold}) ${JSON.stringify(rs.map((r) => r.status))}`);
    const orders = (await E.ShopOrder.filter({}, {})).items;
    const o = orders.find((x) => x.status === 'pending');
    if (o) {
      const owner = people.find((m) => m.id === o.member_id);
      const b0 = await pts(owner);
      const cs = await race(4, () => call(shop, L, { action: 'reject', orderId: o.id, adminNote: 'qa' }));
      ok((await pts(owner)) - b0 === o.total, `shop: leader rejects x4 at once, refunded once (${(await pts(owner)) - b0} back of ${o.total}) ${JSON.stringify(cs.map((r) => r.status))}`);
      const it2 = (await E.ShopItem.get(item.id));
      ok(it2.stock === 2 - sold + 1, `shop: stock goes back once (${it2.stock})`);
    }
  }
  await ledger('shop');
}

// ---------- blackjack ----------
{
  await call(bj, A, { action: 'state' });
  const sit = await race(4, () => call(bj, C, { action: 'sit' }));
  ok(sit.filter((r) => r.status === 200).length >= 1, `blackjack: sit (${JSON.stringify(statusCount(sit))} ${sit.find((r) => r.status !== 200)?.error || ''})`);
  const seated = ((await E.CardTable.filter({ game: 'blackjack' }, {})).items[0].seats || []).filter((x) => x && x.member_id === C.id).length;
  ok(seated === 1, `blackjack: sitting 4 times at once takes one chair (${seated})`);
  for (const v of BAD) { const b0 = await pts(C); const r = await call(bj, C, { action: 'bet', wager: v }); ok((r.status >= 400 || r.status === 200) && (await pts(C)) === b0, `blackjack: bet ${JSON.stringify(v)} takes no points (got ${r.status}; 0 means "take my bet off" by design)`); }
  const c0 = await pts(C);
  const rs = await race(6, () => call(bj, C, { action: 'bet', wager: 500 }));
  ok(rs.filter((r) => r.status === 200).length >= 1, `blackjack: bet x6 at once ${JSON.stringify(statusCount(rs))} ${rs.find((r) => r.status !== 200)?.error || ''}`);
  for (let k = 0; k < 20; k++) { advance(10e3); await Promise.all([call(bj, C, { action: 'stand' }), call(bj, A, { action: 'state' }), call(bj, C, { action: 'state' })]); }
  await ledger('blackjack');
}

await ledger('end');
done();