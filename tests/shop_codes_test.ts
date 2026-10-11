// 6.9: GP codes in the guild shop, and the rankings hiding members who lost their Discord role.
// Codes from stock (shown to the buyer the moment they pay), codes typed by the leader, points safety,
// never the same code twice, nobody but the buyer sees a code in full.
import { member, settings, call, E, ok, done, pts } from './h.ts';
(globalThis as any).__secrets = { PRIZE_CODE_KEY: 'qa-test-key-0123456789abcdef' };
const F = async (n) => (await import(`../base44/functions/${n}/entry.ts`)).default;
const shop = await F('shopAction'), prize = await F('prizeAction'), board = await F('getLeaderboard');
await settings({ games_enabled: ['shop'], shop_seeded: true });
const START = 100000;
const L = await member('Leader', START, 'leader');
const A = await member('Buyer A', START), B = await member('Buyer B', START), C = await member('Buyer C', START);
const people = [L, A, B, C];
async function ledger(tag) {
  const bad = [];
  for (const m of people) {
    const p = await pts(m), s = (await E.PointLog.filter({ member_id: m.id }, {})).items.reduce((a, l) => a + l.amount, 0);
    if (p !== START + s || p < 0) bad.push(`${m.discord_name} ${p} vs ${START + s}`);
  }
  ok(!bad.length, `[${tag}] every member's points = start + their PointLog ${bad.join('; ')}`);
}
const codesOf = (n, tag) => Array.from({ length: n }, (_, i) => `QA${tag}${String(100000 + i)}XYZ`);

// ---------- a GP code item that takes codes from stock ----------
const si = await call(shop, L, { action: 'saveItem', item: { name: '500 GP Code', category: 'Currency', gp_code: true, gp_worth: 500, code_source: 'stock', active: true, sort: 1, add_codes: codesOf(3, 'S').join('\n') } });
ok(si.status === 200 && si.added === 3, `stock item saved with 3 codes pasted in (${si.status} ${si.error || ''} added ${si.added})`);
const dup = await call(shop, L, { action: 'saveItem', item: { ...(await call(shop, L, { action: 'adminOverview' })).items[0], add_codes: codesOf(1, 'S')[0] } });
ok(dup.status === 200 && dup.added === 0 && dup.skipped.length === 1, `the same code pasted again is skipped (added ${dup.added}, skipped ${JSON.stringify(dup.skipped)})`);
let cat = await call(shop, A, { action: 'catalog' });
let item = cat.items.find((x) => x.name === '500 GP Code');
ok(item && item.gp_code && item.gp_worth === 500 && item.stock === 3, `members see it with 3 in stock, worth 500 GP (${JSON.stringify(item && { s: item.stock, w: item.gp_worth })})`);
ok(item.price === 2000 && item.total === 2200, `price = 500 GP x 2 CP x 2 = 2,000 + 10% tax = 2,200 (${item.price} / ${item.total})`);
const adm = await call(shop, L, { action: 'adminOverview' });
ok(JSON.stringify(adm).indexOf('QAS100000') < 0, 'the leader\'s view never holds a code in full');

// no character name needed for a code; points and the code change hands together
const b0 = await pts(A);
const r1 = await call(shop, A, { action: 'buy', itemId: item.id, qty: 1, character: '', expectTotal: item.total });
ok(r1.status === 200 && r1.order && r1.order.status === 'completed', `buying a code completes at once (${r1.status} ${r1.error || ''})`);
ok(r1.order && r1.order.codes && r1.order.codes.length === 1 && /^QAS1000\d\dXYZ$/.test(r1.order.codes[0].code), `the buyer is shown the code right away (${r1.order && JSON.stringify(r1.order.codes)})`);
ok(b0 - (await pts(A)) === 2200, `charged exactly the price shown (${b0 - (await pts(A))})`);
const shown = r1.order.codes[0].code;
// it is in their orders and in My prizes, and nobody else can load it
cat = await call(shop, A, { action: 'catalog' });
ok(cat.orders[0].codes && cat.orders[0].codes[0].code === shown, 'the code is still there under My orders');
const mine = await call(prize, A, { action: 'mine' });
ok(mine.prizes.some((x) => x.code === shown), 'and under My prizes');
for (const who of [B, L]) {
  const o = await call(shop, who, { action: 'catalog' });
  const pr = await call(prize, who, { action: who === L ? 'adminList' : 'mine' });
  ok(JSON.stringify(o).indexOf(shown) < 0 && JSON.stringify(pr).indexOf(shown) < 0, `${who.discord_name} can't see the buyer's code`);
}
item = (await call(shop, A, { action: 'catalog' })).items.find((x) => x.id === item.id);
ok(item.stock === 2, `stock now 2 (${item.stock})`);

// six buyers at once for the last 2 codes: at most 2 sold, every code to one buyer only, losers not charged
const before = Object.fromEntries(await Promise.all([A, B, C].map(async (m) => [m.id, await pts(m)])));
const rs = await Promise.all([A, B, C, A, B, C].map((m) => call(shop, m, { action: 'buy', itemId: item.id, qty: 1, expectTotal: item.total })));
const won = rs.filter((x) => x.status === 200);
ok(won.length === 2, `2 codes left, 6 buys at once: 2 sold (${won.length}) ${JSON.stringify(rs.map((x) => x.status + (x.error ? ':' + x.error.slice(0, 20) : '')))}`);
const all = (await E.PrizeCode.filter({}, {})).items;
const assigned = all.filter((x) => x.status === 'assigned');
ok(assigned.length === 3 && new Set(assigned.map((x) => x.id)).size === 3 && all.filter((x) => x.status === 'stock').length === 0, `3 codes given, none twice, none left (${assigned.length} given)`);
for (const m of [A, B, C]) {
  const paid = before[m.id] - (await pts(m));
  const got = assigned.filter((x) => x.member_id === m.id && Date.parse(x.assigned_at) > 0).length - (m === A ? 1 : 0);
  ok(paid === got * 2200, `${m.discord_name} paid for exactly the codes they got (${paid} for ${got})`);
}
const sold = await call(shop, C, { action: 'buy', itemId: item.id, qty: 1, expectTotal: item.total });
ok(sold.status >= 400 && /Sold out/.test(sold.error || ''), `sold out is refused (${sold.error})`);
// codes added from the prize page under the same name restock the item
await call(prize, L, { action: 'addStock', label: '500 GP Code', codes: codesOf(2, 'P').join('\n') });
item = (await call(shop, A, { action: 'catalog' })).items.find((x) => x.id === item.id);
ok(item.stock === 2, `codes added on the prize page under "500 GP Code" restock the shop item (${item.stock})`);
const two = await call(shop, B, { action: 'buy', itemId: item.id, qty: 3, expectTotal: item.total * 3 });
ok(two.status >= 400 && /Only 2 left/.test(two.error || ''), `asking for 3 of 2 refused (${two.error})`);
const stale = await call(shop, B, { action: 'buy', itemId: item.id, qty: 1, expectTotal: 1 });
ok(stale.status === 409, `a stale price is refused (${stale.status})`);
await ledger('stock codes');

// ---------- a GP code item where the leader types the code ----------
const sm = await call(shop, L, { action: 'saveItem', item: { name: '1000 GP Code (typed)', category: 'Currency', gp_code: true, gp_worth: 1000, code_source: 'manual', stock: 5, active: true, sort: 2 } });
ok(sm.status === 200, `typed-code item saved (${sm.error || ''})`);
const man = (await call(shop, A, { action: 'catalog' })).items.find((x) => x.name === '1000 GP Code (typed)');
ok(man && man.stock === 5 && man.total === 4400 && man.code_source === 'manual', `members see it: 5 in stock, 4,400 with tax (${man && man.total})`);
const bm = await call(shop, B, { action: 'buy', itemId: man.id, qty: 2, expectTotal: man.total * 2 });
ok(bm.status === 200 && bm.order.status === 'pending' && !bm.order.codes, `the order waits for the leader (${bm.status} ${bm.error || ''})`);
const ov = await call(shop, L, { action: 'adminOverview' });
const po = ov.pending.find((x) => x.id === bm.order.id);
ok(po && po.gp_code && po.gp_worth === 1000 && po.qty === 2, 'the leader sees it is 2 codes worth 1,000 GP each');
const wrongCount = await call(shop, L, { action: 'complete', orderId: po.id, codes: 'QAM1111111' });
ok(wrongCount.status >= 400 && /Type 2 codes/.test(wrongCount.error || ''), `one code for 2 pieces refused (${wrongCount.error})`);
const reused = await call(shop, L, { action: 'complete', orderId: po.id, codes: `${shown}\nQAM2222222` });
ok(reused.status >= 400 && /already been used/.test(reused.error || ''), `a code already given refused (${reused.error})`);
const twice = await call(shop, L, { action: 'complete', orderId: po.id, codes: 'QAM3333333\nqam3333333' });
ok(twice.status >= 400 && /twice/.test(twice.error || ''), `the same code twice refused (${twice.error})`);
const bad = await call(shop, L, { action: 'complete', orderId: po.id, codes: 'ab$\nQAM4444444' });
ok(bad.status >= 400, `a malformed code refused (${bad.error})`);
const notMine = await call(shop, A, { action: 'complete', orderId: po.id, codes: 'QAM5555555\nQAM6666666' });
ok(notMine.status === 403, `only the leader can complete (${notMine.status})`);
const cm = await Promise.all([1, 2, 3].map(() => call(shop, L, { action: 'complete', orderId: po.id, codes: 'QAM7777777\nQAM8888888' })));
ok(cm.filter((x) => x.status === 200).length === 1, `completing x3 at once completes once (${cm.map((x) => x.status)})`);
const bc = (await call(shop, B, { action: 'catalog' })).orders.find((x) => x.id === po.id);
ok(bc.status === 'completed' && bc.codes && bc.codes.map((x) => x.code).sort().join() === 'QAM7777777,QAM8888888', `the buyer now sees both codes (${bc.codes && bc.codes.map((x) => x.code)})`);
ok(!bc.delivery_code, 'nothing kept in plain text on the order');
const raw = (await E.PrizeCode.filter({ member_id: B.id }, {})).items;
ok(raw.every((x) => String(x.code).startsWith('v1:')), 'stored encrypted');
const ov2 = await call(shop, L, { action: 'adminOverview' });
const done2 = ov2.recent.find((x) => x.id === po.id);
ok(done2 && done2.code_last4.join() === '7777,8888' && JSON.stringify(ov2).indexOf('QAM7777777') < 0, `the leader sees only the last 4 (${done2 && done2.code_last4})`);
// a waiting typed-code order can still be rejected with a full refund
const b1 = await pts(C);
const cmo = await call(shop, C, { action: 'buy', itemId: man.id, qty: 1, expectTotal: man.total });
const rj = await call(shop, L, { action: 'reject', orderId: cmo.order.id });
ok(rj.status === 200 && (await pts(C)) === b1, `rejecting a waiting code order refunds it (${(await pts(C)) - b1})`);
// a completed stock order can't be rejected (the code is already given)
const rj2 = await call(shop, L, { action: 'reject', orderId: r1.order.id });
ok(rj2.status >= 400, `a code already handed over can't be refunded by mistake (${rj2.error})`);
// the value follows the GP worth even if a value is sent
await call(shop, L, { action: 'saveItem', item: { ...(ov2.items.find((x) => x.id === man.id)), value_cp: 1, gp_worth: 250 } });
const man2 = (await call(shop, A, { action: 'catalog' })).items.find((x) => x.id === man.id);
ok(man2.price === 1000, `value follows the GP worth: 250 GP -> 1,000 points (${man2.price})`);
const badWorth = await call(shop, L, { action: 'saveItem', item: { name: 'x', gp_code: true, gp_worth: 0 } });
ok(badWorth.status >= 400, `a code item needs its GP worth (${badWorth.error})`);
// an ordinary item still needs a character name
const plain = await call(shop, L, { action: 'saveItem', item: { name: 'Tin', value_cp: 5, stock: 3, active: true } });
const tin = (await call(shop, A, { action: 'catalog' })).items.find((x) => x.name === 'Tin');
const noName = await call(shop, A, { action: 'buy', itemId: tin.id, qty: 1, character: '', expectTotal: tin.total });
ok(plain.status === 200 && noName.status >= 400 && /character/.test(noName.error || ''), `ordinary items still need a character name (${noName.error})`);
await ledger('typed codes');

// ---------- rankings hide members who lost their Discord role ----------
{
  const top = await member('Top Lost Role', 9e8);
  const rich = await member('Rich Member', 8e8);
  await E.Member.update(top.id, { no_access: true });
  const old = await E.Member.create({ discord_id: '1999', discord_name: 'Old Row', points: 7e8, role: 'member', banned: false }); // no no_access field at all
  const lb = await call(board, A, {});
  const names = lb.leaderboard.map((x) => x.discord_name);
  ok(!names.includes('Top Lost Role') && names[0] === 'Rich Member' && names.includes('Old Row'), `rankings hide the member who lost the role, keep older rows (${names.slice(0, 3)})`);
  ok(lb.leaderboard.every((x) => !('no_access' in x)), 'no extra fields sent');
  await E.Member.update(top.id, { no_access: false });
  ok((await call(board, A, {})).leaderboard[0].discord_name === 'Top Lost Role', 'back on the board when the role comes back');
  await E.Member.delete(old.id);
}
done();