// 6.33: the War Room. Run: deno run -A --import-map=import_map.json war_test.ts
import { member, settings, call, advance, ok, done, E } from './h.ts';
import fn from '../base44/functions/warAction/entry.ts';
import { applyOps, cleanShape } from '../base44/shared/warRoom.ts';

const ip = (n) => `10.20.0.${n}`;
async function guest(body, token = '', from = ip(1)) {
  const req = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': from }, body: JSON.stringify({ ...body, ...(token ? { _w: token } : {}) }) });
  const res = await fn(req);
  return { status: res.status, ...(await res.json()) };
}
const sid = (n) => 'abc' + String(n).padStart(6, '0');

await settings();
const L = await member('Juts', 1000, 'leader');
const O = await member('Vice', 1000, 'officer');
const M = await member('Plain', 1000, 'member');

ok((await call(fn, null, { action: 'ping' })).version, 'ping');
ok((await call(fn, M, { action: 'me' })).access === 'none', 'a plain member is not in the War Room');
ok((await call(fn, M, { action: 'plans' })).status === 403, 'and can not see the plans');
ok((await guest({ action: 'plans' })).status === 403, 'nor can a stranger');
ok((await call(fn, O, { action: 'me' })).access === 'command', 'officers command');

// plans and pages
const cp = await call(fn, O, { action: 'createPlan', title: 'Wed HSB: Lunar stone', map: 'z038' });
ok(cp.ok && cp.pages.length === 1 && cp.pages[0].map === 'z038', 'an officer opens a plan on Ghost Valley');
const planId = cp.plan.id, pageId = cp.pages[0].id;
ok((await call(fn, L, { action: 'addPage', planId, map: 'z007' })).ok, 'adds Evergreen Waterfall');
ok((await call(fn, L, { action: 'addPage', planId, map: 'z999' })).status === 400, 'an unknown map is refused');

// drawing
const add = (n, extra = {}) => ({ op: 'add', shape: { id: sid(n), t: 'path', c: '#ffd84d', w: 5, pts: [0.1, 0.1, 0.2, 0.25, 0.3, 0.3], ...extra } });
const e1 = await call(fn, O, { action: 'edit', id: pageId, ops: [add(1), { op: 'add', shape: { id: sid(2), t: 'stamp', k: 'attack', x: 0.4, y: 0.5 } }, { op: 'add', shape: { id: sid(3), t: 'text', s: 'Team A here', x: 0.5, y: 0.5, c: '#ff5a52' } }] });
ok(e1.ok && e1.page.shapes.length === 3 && e1.page.shapes[0].by === 'Vice', 'strokes, markers and words are saved with who drew them');
const v1 = e1.page.v;
ok((await call(fn, L, { action: 'page', id: pageId, v: v1 })).same === true, 'nothing new: the screen is told so (no redraw)');
const bad = await call(fn, O, { action: 'edit', id: pageId, ops: [{ op: 'add', shape: { id: sid(4), t: 'path', pts: [0.1, 'x'] } }, { op: 'add', shape: { id: 'BAD', t: 'stamp', k: 'attack', x: 0.1, y: 0.1 } }, { op: 'add', shape: { id: sid(5), t: 'stamp', k: 'nuke', x: 0.1, y: 0.1 } }, { op: 'add', shape: { id: sid(6), t: 'text', s: '<script>', x: 9, y: 0.1 } }] });
ok(bad.page.shapes.length === 3, 'broken or made-up shapes are dropped');
ok(cleanShape({ id: sid(7), t: 'text', s: '  <b>hi</b>  ', x: 0.2, y: 0.2 }, 'x').s === '<b>hi</b>', 'text is kept as plain text (the page never renders it as HTML)');
const mv = await call(fn, L, { action: 'edit', id: pageId, ops: [{ op: 'move', id: sid(2), dx: 0.1, dy: -0.1 }] });
const st = mv.page.shapes.find((s) => s.id === sid(2));
ok(Math.abs(st.x - 0.5) < 1e-9 && Math.abs(st.y - 0.4) < 1e-9, 'a marker is moved');

// two commanders drawing at the same moment: nothing is lost
const [a, b2] = await Promise.all([
  call(fn, L, { action: 'edit', id: pageId, ops: [add(10), add(11)] }),
  call(fn, O, { action: 'edit', id: pageId, ops: [add(12), add(13)] })
]);
const after = (await call(fn, L, { action: 'page', id: pageId, v: -1 })).page.shapes.map((s) => s.id);
ok(a.ok && b2.ok && [10, 11, 12, 13].every((n) => after.includes(sid(n))), 'two people drawing at once both keep their strokes');

// invites
ok((await call(fn, O, { action: 'createInvite', code: 'TIGER-ALLY' })).status === 403, 'only the Guild Leader makes codes');
ok((await call(fn, L, { action: 'createInvite', code: 'ab' })).status === 400, 'codes need 6 to 24 letters, numbers or dashes');
const inv = await call(fn, L, { action: 'createInvite', code: 'tiger-ally', label: 'Golden Tiger allies', maxUses: 2, accessDays: 7, validDays: 3 });
ok(inv.ok && inv.invite.code === 'TIGER-ALLY', 'the leader makes a custom code (any case)');
ok((await call(fn, L, { action: 'createInvite', code: 'TIGER-ALLY' })).status === 400, 'codes are unique');
const wrong = await guest({ action: 'redeem', code: 'TIGER-ALLX', name: 'Kaze' });
ok(wrong.status === 404, 'a wrong code is refused');
const noName = await guest({ action: 'redeem', code: 'tiger-ally', name: 'K' });
ok(noName.status === 400, 'a guest must give a name');
const g1 = await guest({ action: 'redeem', code: 'tiger-ally', name: 'Kaze (GT leader)' }, '', ip(2));
ok(g1.ok && /^[a-f0-9]{64}$/.test(g1.token) && g1.days === 7, 'a non-member joins with the code and gets a War Room pass');
const gme = await guest({ action: 'me' }, g1.token);
ok(gme.access === 'council' && gme.guest && gme.name === 'Kaze (GT leader)', 'the pass lets them in as council');
ok((await guest({ action: 'plans' }, g1.token)).plans.length === 1, 'they see the plans');
const ge = await guest({ action: 'edit', id: pageId, ops: [add(20), { op: 'clear' }] }, g1.token);
ok(ge.ok && ge.page.shapes.some((s) => s.id === sid(20)) && ge.page.shapes.length > 1, 'they can draw, but not wipe the board');
ok((await guest({ action: 'createPlan', title: 'x' }, g1.token)).status === 403, 'they can not open plans');
ok((await guest({ action: 'invites' }, g1.token)).status === 403, 'or see the codes');
const gm = await call(fn, M, { action: 'redeem', code: 'TIGER-ALLY' });
ok(gm.ok && gm.token === '' && gm.name === 'Plain', 'a member uses the code as themselves');
ok((await call(fn, M, { action: 'me' })).access === 'council', 'and is in the council now');
ok((await guest({ action: 'redeem', code: 'TIGER-ALLY', name: 'Third' }, '', ip(3))).status === 404, 'a code with 2 uses stops after 2');
// guessing
let refused = 0;
for (let i = 0; i < 10; i++) if ((await guest({ action: 'redeem', code: 'GUESS' + i + 'XX', name: 'Bot' }, '', ip(9))).status === 429) refused++;
ok(refused >= 2, `guessing codes is slowed down (${refused} refused)`);

// the leader manages the council
const list = await call(fn, L, { action: 'invites' });
ok(list.council.length === 2 && list.invites[0].uses === 2, 'the leader sees who joined and how many times a code was used');
const kaze = list.council.find((c) => !c.member);
ok((await call(fn, L, { action: 'removeGuest', id: kaze.id })).ok, 'removes a guest');
ok((await guest({ action: 'plans' }, g1.token)).status === 403, 'their pass stops working');
const inv2 = await call(fn, L, { action: 'createInvite', code: 'SNAKE-2026', maxUses: 0, accessDays: 1, validDays: 0 });
const g2 = await guest({ action: 'redeem', code: 'SNAKE-2026', name: 'Hebi' }, '', ip(4));
ok((await guest({ action: 'me' }, g2.token)).access === 'council', 'another ally joins');
await call(fn, L, { action: 'revokeInvite', id: inv2.invite.id });
advance(31000);
ok((await guest({ action: 'me' }, g2.token)).access === 'none', 'cancelling a code shuts out everyone who joined with it');
const inv3 = await call(fn, L, { action: 'createInvite', code: 'SHORT-TERM', accessDays: 1 });
const g3 = await guest({ action: 'redeem', code: 'SHORT-TERM', name: 'Day pass' }, '', ip(5));
advance(25 * 60 * 60 * 1000);
ok((await guest({ action: 'me' }, g3.token)).access === 'none', 'access runs out after its days');
ok(inv3.ok, 'codes can give a single day');

// clearing and deleting
ok((await call(fn, O, { action: 'edit', id: pageId, ops: [{ op: 'clear' }] })).page.shapes.length === 0, 'a commander wipes the board');
ok((await call(fn, M, { action: 'deletePlan', id: planId })).status === 403, 'council can not delete plans');
ok((await call(fn, O, { action: 'deletePlan', id: planId })).ok, 'a commander deletes the plan');
ok((await call(fn, L, { action: 'plans' })).plans.length === 0, 'it is gone from the list');

// limits
const big = applyOps([], Array.from({ length: 5 }, (_, i) => ({ op: 'add', shape: { id: sid(100 + i), t: 'path', pts: Array(900).fill(0.5) } })), 'x', true);
ok(big.shapes.length === 0, 'a stroke with too many points is refused');
ok((await E.Member.get(L.id)).points === 1000, 'nothing here touches points');
done();
