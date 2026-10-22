// 6.39: the War Room under load. Run: deno run -A --import-map=import_map.json war3_test.ts
import { member, settings, call, advance, ok, done, E } from './h.ts';
import fn from '../base44/functions/warAction/entry.ts';
const g = globalThis as any;

await settings();
const L = await member('Juts', 1000, 'leader');
const officers = [];
for (let i = 0; i < 9; i++) officers.push(await member('Vice' + i, 1000, 'officer'));
const sid = (n) => 'zz' + String(n).padStart(7, '0');
const stroke = (n) => ({ op: 'add', shape: { id: sid(n), t: 'path', c: '#ffd84d', w: 5, pts: [0.1, 0.1, 0.2, 0.2, 0.3, 0.25] } });

const plan = await call(fn, L, { action: 'createPlan', title: 'Load test', map: 'z038' });
const pageId = plan.pages[0].id;

// one stroke: how many database calls, and no lock
await call(fn, L, { action: 'page', id: pageId, v: '' });
advance(70_000);
g.__byOp = {};
const one = await call(fn, L, { action: 'edit', id: pageId, ops: [stroke(1)] });
const ops = g.__byOp; g.__byOp = null;
const total = Object.values(ops).reduce((a: number, b: any) => a + b, 0);
ok(one.ok && one.page.shapes.length === 1, 'a stroke is saved');
ok(!Object.keys(ops).some((k) => k.startsWith('Lock.')), `no lock is taken (${JSON.stringify(ops)})`);
ok(total <= 12, `the first stroke after a quiet minute, with the once-a-minute housekeeping: ${total} database calls`);
g.__byOp = {};
await call(fn, L, { action: 'edit', id: pageId, ops: [stroke(2)] });
const ops2 = g.__byOp; g.__byOp = null;
const t2 = Object.values(ops2).reduce((a: number, b: any) => a + b, 0);
ok(t2 <= 2, `while drawing, a stroke costs ${t2} database calls (${JSON.stringify(ops2)})`);

// ten people drawing at the same moment, several strokes each
const before = g.__calls;
const all = await Promise.all([L, ...officers].map((m, k) => call(fn, m, { action: 'edit', id: pageId, ops: [stroke(100 + k * 3), stroke(101 + k * 3), stroke(102 + k * 3)] })));
const calls = g.__calls - before;
ok(all.every((r) => r.ok), `10 people drawing at once: nobody is told "busy" (${all.filter((r) => !r.ok).map((r) => r.error).join(', ')})`);
advance(1500);
const st = await call(fn, L, { action: 'page', id: pageId, v: '' });
ok(st.page.shapes.length === 32, `every stroke is kept (${st.page.shapes.length} of 32)`);
ok(calls < 31 * 6, `30 strokes from 10 people: ${calls} database calls (was ~10 a stroke plus waiting in line)`);

// moving, erasing and wiping still work
await call(fn, officers[0], { action: 'edit', id: pageId, ops: [{ op: 'move', id: sid(1), dx: 0.1, dy: 0 }, { op: 'remove', ids: [sid(100)] }] });
advance(1500);
const st2 = await call(fn, L, { action: 'page', id: pageId, v: st.page.v });
ok(!st2.same && st2.page.shapes.length === 31 && Math.abs(st2.page.shapes.find((s) => s.id === sid(1)).pts[0] - 0.2) < 1e-9, 'a move and an erase show for everyone');
ok((await call(fn, L, { action: 'page', id: pageId, v: st2.page.v })).same === true, 'nothing new: "same", without the drawings');
ok(st2.page.edited_by === 'Vice0', `the last person to change it is shown (${st2.page.edited_by})`);
await call(fn, L, { action: 'edit', id: pageId, ops: [{ op: 'clear' }] });
advance(1500);
ok((await call(fn, L, { action: 'page', id: pageId, v: '' })).page.shapes.length === 0, 'a commander wipes the board');

// a board drawn before 6.39 (drawings inside the page) is carried over
const old = await call(fn, L, { action: 'addPage', planId: plan.plan.id, map: 'z007' });
await E.WarPage.update(old.page.id, { shapes: [{ id: sid(900), t: 'stamp', k: 'attack', c: '#ffd84d', x: 0.5, y: 0.5, by: 'Juts' }, { id: sid(901), t: 'text', s: 'Gate', c: '#f4f1ea', x: 0.2, y: 0.2, size: 20, by: 'Vice0' }] });
advance(31_000);
const mig = await call(fn, L, { action: 'page', id: old.page.id, v: '' });
ok(mig.page.shapes.length === 2 && mig.page.shapes.some((s) => s.s === 'Gate' && s.by === 'Vice0'), 'old drawings are still there');
ok((await E.WarPage.get(old.page.id)).shapes.length === 0 && (await E.WarShape.filter({ page_id: old.page.id }, {})).items.length === 2, 'and were moved into their own rows once');
await call(fn, L, { action: 'edit', id: old.page.id, ops: [{ op: 'remove', ids: [sid(900)] }] });
advance(1500);
ok((await call(fn, L, { action: 'page', id: old.page.id, v: '' })).page.shapes.length === 1, 'an old drawing can be erased');

// one call keeps a screen fresh: the open map and the chat
await call(fn, L, { action: 'chatSend', text: 'Gate at 12:20' });
advance(1500);
const s1 = await call(fn, officers[1], { action: 'sync', page: old.page.id, v: '', chat: true });
ok(s1.page.shapes.length === 1 && s1.chat.messages.length === 1 && s1.chat.now, 'sync returns the map and the chat');
const s2 = await call(fn, officers[1], { action: 'sync', page: old.page.id, v: s1.page.v, chat: true, chatAfter: s1.chat.messages[0].id, trSince: s1.chat.now });
ok(s2.page.same && s2.chat.messages.length === 0, 'and nothing when nothing changed');

// many screens watching: they share reads
advance(5000);
const b0 = g.__calls;
await Promise.all(officers.map((m) => call(fn, m, { action: 'sync', page: old.page.id, v: '', chat: true })));
const per = (g.__calls - b0) / officers.length;
ok(per <= 2, `9 screens refreshing at once: ${per.toFixed(1)} database calls each`);
done();
