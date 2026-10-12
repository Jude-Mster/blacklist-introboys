// Phase 2, part 2: poker and pusoy (points held at the table), tournament start/cancel races,
// banned members with real bets, expired sessions. Conservation check: no points created or lost.
import { member, settings, call, E, advance, ok, done } from './h.ts';
const offeredKey = (o) => (o.a > 1 ? 'a' : o.b > 1 ? 'b' : ((o.side || []).find((x) => x.price > 1) || { id: 'lenover' }).id);   // a fighter if one is offered, else a side bet
const F = async (n) => (await import(`../base44/functions/${n}/entry.ts`)).default;
const poker = await F('pokerAction'), pusoy = await F('pusoyAction'), tour = await F('tournamentAction'), roul = await F('rouletteAction'),
  arena = await F('arenaAction'), derby = await F('derbyAction'), wheel = await F('wheelAction'), duel = await F('duelAction'), daily = await F('claimDaily'), play = await F('playGame');
await settings({ games_enabled: ['arena', 'derby', 'roulette', 'dragondice', 'skywheel', 'coinflip', 'duel', 'poker', 'pusoy', 'shop', 'blackjack', 'lucky9'], daily_bet_cap: 1000000 });
const START = 50000;
const P = [];
for (const n of ['P1', 'P2', 'P3', 'P4']) P.push(await member(n, START));
const L = await member('Leader', START, 'leader');
const people = [...P, L];
const pts = async (m) => (await E.Member.get(m.id)).points;
const total = async () => (await Promise.all(people.map(pts))).reduce((a, b) => a + b, 0);
const race = (n, f) => Promise.all(Array.from({ length: n }, () => f()));
async function ledger(tag) {
  const bad = [];
  for (const m of people) { const p = await pts(m), s = (await E.PointLog.filter({ member_id: m.id }, {})).items.reduce((a, l) => a + l.amount, 0); if (p !== START + s || p < 0) bad.push(`${m.discord_name} ${p} vs ${START + s}`); }
  ok(!bad.length, `[${tag}] ledger holds ${bad.join('; ')}`);
}
const rnd = (n) => Math.floor(Math.random() * n);

// ---------- poker ----------
{
  const t0 = await total();
  const cr = await call(poker, L, { action: 'createTable', name: 'QA', small_blind: 10, big_blind: 20, min_buyin: 200, max_buyin: 2000 });
  ok(cr.ok, `poker: table created ${cr.error || ''}`);
  const tableId = cr.table.id;
  const j = await race(4, () => call(poker, P[0], { action: 'join', tableId, buyin: 1000 }));
  ok(j.filter((r) => r.status === 200).length === 1 && START - (await pts(P[0])) === 1000, `poker: join x4 at once seats once and charges once ${JSON.stringify(j.map((r) => r.status))}`);
  for (const p of P.slice(1)) await call(poker, p, { action: 'join', tableId, buyin: 800 + rnd(1000) });
  for (let k = 0; k < 300; k++) {
    const p = P[rnd(P.length)], mv = ['fold', 'check', 'call', 'raise', 'raise', 'allin'][rnd(6)];
    await call(poker, p, { action: 'act', tableId, move: mv, amount: 20 + rnd(400) });
    if (k % 7 === 0) advance(31e3);
    if (k % 40 === 0) await Promise.all(P.map((q) => call(poker, q, { action: 'state', tableId })));
  }
  const lv = await race(3, () => call(poker, P[1], { action: 'leave', tableId }));
  ok(lv.every((r) => r.status === 200 || r.status === 400), `poker: leave x3 at once (${lv.map((r) => r.status)})`);
  for (let k = 0; k < 30; k++) { advance(31e3); for (const q of P) await call(poker, q, { action: 'leave', tableId }); await call(poker, P[0], { action: 'state', tableId }); }
  const tb = (await E.PokerTable.get(tableId));
  const onTable = (tb.seats || []).reduce((a, s) => a + ((s && s.stack) || 0), 0) + (tb.pot || 0);
  const t1 = await total();
  ok(onTable === 0 && t1 === t0, `poker: after everyone leaves, no points created or lost (before ${t0}, after ${t1}, still on table ${onTable})`);
  await ledger('poker');
}

// ---------- pusoy ----------
{
  const t0 = await total();
  const cr = await call(pusoy, L, { action: 'create', name: 'QA', ante: 100, stake: 10 });
  ok(cr.status === 200, `pusoy: table created (${cr.status} ${cr.error || ''})`);
  const tableId = (cr.table && cr.table.id) || cr.id || ((await E.PusoyTable.filter({}, {})).items[0] || {}).id;
  const s1 = await race(3, () => call(pusoy, P[0], { action: 'sit', tableId }));
  ok(s1.filter((r) => r.status === 200).length === 1, `pusoy: sit x3 at once takes one seat ${JSON.stringify(s1.map((r) => r.status))}`);
  for (const p of P.slice(1, 3)) await call(pusoy, p, { action: 'sit', tableId });
  for (let k = 0; k < 400; k++) {
    advance(rnd(3) === 0 ? 40e3 : 3e3);
    const p = P[rnd(3)];
    const st = await call(pusoy, p, { action: 'state', tableId });
    const hand = st.my_hand || st.hand || (st.me && st.me.hand) || [];
    if (rnd(2) && hand.length) await call(pusoy, p, { action: 'play', tableId, cards: [hand[0]] });
    else await call(pusoy, p, { action: 'pass', tableId });
  }
  for (let k = 0; k < 40; k++) { advance(60e3); for (const q of P) await call(pusoy, q, { action: 'leave', tableId }); await call(pusoy, P[3], { action: 'list' }); }
  const t1 = await total();
  const held = (await E.PusoyTable.filter({}, {})).items.reduce((a, t) => a + (t.seats || []).reduce((x, s) => x + ((s && s.escrow) || 0), 0), 0);
  // Pusoy keeps a 2% house cut of each pot (HOUSE_CUT_PCT), so the players' total may only go down by that.
  const lost = (await E.PointLog.filter({}, {})).items.filter((l) => /Pusoy/i.test(l.reason) && l.amount < 0).reduce((a, l) => a - l.amount, 0);
  const won = (await E.PointLog.filter({}, {})).items.filter((l) => /Pusoy.*win at/i.test(l.reason)).length;
  ok(held === 0 && t1 <= t0 && t0 - t1 <= Math.ceil(lost * 0.02) + won, `pusoy: after everyone leaves, nothing created; only the 2% house cut kept (before ${t0}, after ${t1}, kept ${t0 - t1}, still held ${held})`);
  await ledger('pusoy');
}

// ---------- tournament: start while members are still buying; cancel with refunds while buying ----------
{
  const cr = await call(tour, L, { action: 'create', title: 'Race Cup', prizes: [{ kind: 'points', points: 100 }] });
  ok(cr.ok, 'tournament: opened');
  for (const p of P) await call(tour, p, { action: 'buy', item: 'entry', count: 2 });
  const rs = await Promise.all([...P.flatMap((p) => [call(tour, p, { action: 'buy', item: 'entry', count: 3 }), call(tour, p, { action: 'buy', item: 'weapon' }), call(tour, p, { action: 'buy', item: 'pet' })]), call(tour, L, { action: 'start' })]);
  const t = (await E.Tournament.filter({ title: 'Race Cup' }, {})).items[0];
  const field = t.field || [];
  const spentFrozen = field.length;
  ok(t.status === 'running', `tournament: started (${t.status})`);
  const ents = (await E.TourEntrant.filter({ tour_id: t.id }, {})).items;
  for (const p of P) {
    const x = ents.find((e) => e.member_id === p.id);
    const paid = -(await E.PointLog.filter({ member_id: p.id, source: 'tournament' }, {})).items.reduce((a, l) => a + l.amount, 0);
    ok(x && x.spent === paid, `tournament: ${p.discord_name} paid exactly what their fighter records (fighter ${x && x.spent}, net paid ${paid})`);
    const f = field.find((y) => y.member_id === p.id);
    ok(f && f.build.entries === x.entries, `tournament: ${p.discord_name}'s fighter in the bracket matches what they bought (${f && f.build.entries} vs ${x && x.entries})`);
  }
  const bank = (await E.ArenaBank.filter({}, {})).items[0];
  ok(bank.balance === ents.reduce((a, x) => a + x.spent, 0), `tournament: bank = everything paid (${bank.balance})`);
  await ledger('tournament start race');
  // finish it and clean up
  for (let k = 0; k < 40; k++) { advance(20e3); await call(tour, P[0], { action: 'state' }); }
  const cr2 = await call(tour, L, { action: 'create', title: 'Cancel Cup', prizes: [{ kind: 'points', points: 100 }] });
  ok(cr2.ok, `tournament: second one opened ${cr2.error || ''}`);
  const bank0 = (await E.ArenaBank.filter({}, {})).items[0].balance;
  const before = Object.fromEntries(await Promise.all(P.map(async (p) => [p.id, await pts(p)])));
  await Promise.all([...P.map((p) => call(tour, p, { action: 'buy', item: 'entry', count: 2 })), ...P.map((p) => call(tour, p, { action: 'buy', item: 'entry', count: 1 })), call(tour, L, { action: 'cancel', refund: true })]);
  advance(1000); for (const p of P) await call(tour, p, { action: 'state' });
  for (const p of P) ok((await pts(p)) === before[p.id], `tournament: cancelled with refunds while buying: ${p.discord_name} back to where they started (${(await pts(p)) - before[p.id]})`);
  ok((await E.ArenaBank.filter({}, {})).items[0].balance === bank0, 'tournament: cancel with refunds leaves the bank unchanged');
  ok((await E.TourEntrant.filter({}, {})).items.filter((x) => x.tour_id === cr2.id).length === 0, 'tournament: fighters removed after cancel');
  await ledger('tournament cancel race');
}

// ---------- banned member with real bets ----------
{
  const X = await member('BannedX', 10000); people.push(X);
  await call(roul, X, { action: 'state' });
  await E.Member.update(X.id, { banned: true });
  const s = await call(arena, X, { action: 'state' });
  const r = await Promise.all([
    call(roul, X, { action: 'bet', bets: [{ type: 'red', amount: 100 }] }),
    call(wheel, X, { action: 'bet', faction: 'dragon', amount: 100 }),
    call(arena, X, { action: 'bet', round: s.table.round_no, lines: [{ k: offeredKey(s.table.odds), amount: 100 }] }),
    call(duel, X, { action: 'create', wager: 100, side: 'heads' }),
    call(daily, X, {}),
    call(play, X, { game: 'coinflip', wager: 100, choice: 'heads' }),
  ]);
  ok(r.every((x) => x.status >= 400) && (await pts(X)) === 10000, `banned: every bet refused, no points moved (${r.map((x) => x.status + ':' + (x.error || '').slice(0, 30)).join(' | ')})`);
}

// ---------- expired session ----------
{
  const Y = await member('Expired', 1000);
  const rows = (await E.Session.filter({ member_id: Y.id }, {})).items;
  await E.Session.update(rows[0].id, { expires_at: new Date(Date.now() - 1000).toISOString() });
  advance(40e3);   // past the 30 s session cache
  const r = await call(arena, Y, { action: 'state' });
  ok(r.status === 401, `expired session refused (${r.status})`);
}

done();