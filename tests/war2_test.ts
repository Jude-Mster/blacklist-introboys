// 6.34: War Room chat, guilds and plan notifications. Run: deno run -A --import-map=import_map.json war2_test.ts
import { member, settings, call, advance, ok, done, E } from './h.ts';
import fn from '../base44/functions/warAction/entry.ts';
const g = globalThis as any;

const ip = (n) => `10.30.0.${n}`;
async function guest(body, token = '', from = ip(1)) {
  const req = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': from }, body: JSON.stringify({ ...body, ...(token ? { _w: token } : {}) }) });
  const res = await fn(req);
  return { status: res.status, ...(await res.json()) };
}
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function fakeSub(n: number) {
  const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  return { endpoint: `https://fcm.googleapis.com/fcm/send/dev${n}`, keys: { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
}
// Push services: record what was sent instead of calling Google.
const pushed: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url) => {
  const u = String(url);
  if (u.startsWith('https://fcm.googleapis.com/')) { pushed.push(u.split('/').pop()); return new Response('', { status: u.endsWith('dead') ? 410 : 201 }); }
  return realFetch(url);
}) as any;

await settings();
const L = await member('Juts', 1000, 'leader');
const O = await member('Vice', 1000, 'officer');
const M = await member('Plain', 1000, 'member');

// ---------- guilds ----------
const inv = await call(fn, L, { action: 'createInvite', code: 'TIGER-ALLY', label: 'GT leaders', guild: 'Golden Tiger Clan', color: '#f2c14e', maxUses: 0, accessDays: 30 });
ok(inv.ok && inv.invite.guild === 'Golden Tiger Clan' && inv.invite.color === '#f2c14e', 'a code carries the guild name and colour');
const odd = await call(fn, L, { action: 'createInvite', code: 'SNAKE-ALLY', guild: '', color: 'red; background:url(x)' });
ok(odd.invite.guild === 'Allies' && odd.invite.color === '#6cc6ff', 'a made-up colour is replaced by one of the guild colours');
const kaze = await guest({ action: 'redeem', code: 'TIGER-ALLY', name: 'Kaze' }, '', ip(2));
ok(kaze.ok && kaze.guild === 'Golden Tiger Clan', 'a guest joins under the code\'s guild');
const me = await guest({ action: 'me' }, kaze.token);
ok(me.guild === 'Golden Tiger Clan' && me.color === '#f2c14e' && /^g_/.test(me.id), 'and the War Room knows their guild');
const pm = await call(fn, M, { action: 'redeem', code: 'TIGER-ALLY' });
ok(pm.ok && pm.guild === 'BLACKLIST INTROBOYS', 'a guild member who uses an ally code stays in BLACKLIST INTROBOYS');
const r1 = await call(fn, L, { action: 'roster' });
const names = (gname) => (r1.guilds.find((x) => x.guild === gname) || { people: [] }).people.map((x) => x.name);
ok(r1.guilds[0].guild === 'BLACKLIST INTROBOYS' && r1.guilds[0].color === '#ff4d4f', 'the roster lists the home guild first, in red');
ok(['Juts', 'Vice', 'Plain'].every((n) => names('BLACKLIST INTROBOYS').includes(n)) && names('Golden Tiger Clan').join() === 'Kaze', 'names are grouped by guild');
ok(r1.guilds[0].people[0].online, 'people who have the War Room open show as online');
const up = await call(fn, L, { action: 'updateInvite', id: inv.invite.id, guild: 'Golden Tiger', color: '#ff9f43' });
ok(up.ok && up.invite.guild === 'Golden Tiger', 'the leader renames the guild on a code');
advance(6000);
const r2 = await call(fn, O, { action: 'roster' });
ok(r2.guilds.some((x) => x.guild === 'Golden Tiger' && x.color === '#ff9f43' && x.people[0].name === 'Kaze'), 'everyone who joined with it moves along');
ok((await guest({ action: 'me' }, kaze.token)).color === '#ff9f43', 'including their own colour');
ok((await call(fn, O, { action: 'updateInvite', id: inv.invite.id, guild: 'x' })).status === 403, 'only the leader changes codes');
ok((await guest({ action: 'roster' }, kaze.token)).ok, 'the council can see who is in the War Room');
ok((await call(fn, (await member('Nobody', 1, 'member')), { action: 'roster' })).status === 403, 'nobody else can');

// ---------- chat ----------
g.__llm = async (p) => {
  ok(/Turkish \(tr\)/.test(p.prompt) && /Filipino/.test(p.prompt) && !/Spanish/.test(p.prompt), 'the War Room chat is translated into its six languages');
  return { lang: 'en', en: 'Gate at 12:20', tl: 'Gate sa 12:20', tr: 'Kapı 12:20', th: 'ประตู 12:20', id: 'Gerbang 12:20', zh: '12:20 城門' };
};
const s1 = await call(fn, L, { action: 'chatSend', text: '  Gate at 12:20\n\n\n\nTeam A first  ' });
ok(s1.ok && s1.message.text === 'Gate at 12:20\n\nTeam A first' && s1.message.guild === 'BLACKLIST INTROBOYS', 'a message keeps its lines and its guild');
const s1t = await call(fn, L, { action: 'chatTranslate', id: s1.message.id });
ok(s1t.message.tr && s1t.message.tr.tr === 'Kapı 12:20' && s1t.message.lang === 'en', 'and is translated once');
const calls = g.__llmCalls;
await call(fn, L, { action: 'chatTranslate', id: s1.message.id });
ok(g.__llmCalls === calls, 'never twice');
ok((await guest({ action: 'chatTranslate', id: s1.message.id }, kaze.token)).status === 404, 'only the sender asks for the translation');
ok((await call(fn, L, { action: 'chatSend', text: 'again' })).status === 429, 'one message a second');
advance(1200);
const tiny = 'data:image/png;base64,' + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
const s2 = await guest({ action: 'chatSend', text: '', image: tiny }, kaze.token);
ok(s2.ok && /^https:\/\//.test(s2.message.image) && s2.message.guild === 'Golden Tiger' && s2.message.color === '#ff9f43', 'a guest sends a picture, under their guild colour');
advance(1200);
const fake = await guest({ action: 'chatSend', image: 'data:image/png;base64,PHNjcmlwdD4=' }, kaze.token);
ok(fake.status === 400, 'a file that is not a picture is refused');
advance(1200);
ok((await guest({ action: 'chatSend', text: 'x'.repeat(900) }, kaze.token)).message.text.length === 500, 'long messages are cut at 500');
const all = await call(fn, O, { action: 'chat' });
ok(all.messages.length === 3 && all.messages[0].tr && all.now, 'the council reads the chat, oldest first');
advance(1500);
const later = await call(fn, O, { action: 'chat', after: all.messages[2].id, trSince: all.now });
ok(later.messages.length === 0 && later.updates.length === 0, 'nothing new: nothing sent');
ok((await call(fn, M, { action: 'chatRemove', id: s1.message.id })).status === 403, 'a council member can not remove someone else\'s message');
ok((await guest({ action: 'chatRemove', id: s2.message.id }, kaze.token)).ok, 'but can remove their own');
ok((await call(fn, O, { action: 'chatRemove', id: s1.message.id })).ok, 'a commander can remove any message');
advance(1500);
const after = await call(fn, O, { action: 'chat', after: all.messages[2].id, trSince: all.now });
ok(after.updates.length === 2 && after.updates.every((m) => m.removed && !m.text && !m.image), 'removed messages disappear from every screen');
ok((await guest({ action: 'chat' }, '')).status === 403, 'strangers can not read the chat');

// ---------- plan notifications ----------
const subL = await fakeSub(1), subK = await fakeSub(2), subP = await fakeSub(3);
ok((await call(fn, L, { action: 'pushOn', sub: subL, device: 'Win' })).ok, 'the leader switches plan alerts on');
ok((await guest({ action: 'pushOn', sub: subK }, kaze.token)).ok, 'a guest does too');
ok((await call(fn, M, { action: 'pushOn', sub: subP })).ok, 'and a member of the council');
ok((await call(fn, L, { action: 'pushOn', sub: { endpoint: 'https://evil.example/x', keys: subL.keys } })).status === 400, 'only real push services');
ok((await guest({ action: 'pushStatus', endpoint: subK.endpoint }, kaze.token)).on === true, 'a device can ask whether it is on');
pushed.length = 0;
const plan = await call(fn, O, { action: 'createPlan', title: 'Sat HSB', map: 'z038' });
ok(plan.ok && pushed.sort().join() === 'dev1,dev2,dev3', 'a new plan tells everyone else (not the officer who made it)');
pushed.length = 0;
await call(fn, L, { action: 'edit', id: plan.pages[0].id, ops: [{ op: 'add', shape: { id: 'abc000001', t: 'stamp', k: 'attack', x: 0.2, y: 0.2 } }] });
ok(pushed.sort().join() === 'dev2,dev3', 'drawing tells the others');
pushed.length = 0;
await call(fn, L, { action: 'edit', id: plan.pages[0].id, ops: [{ op: 'add', shape: { id: 'abc000002', t: 'stamp', k: 'attack', x: 0.3, y: 0.2 } }] });
ok(pushed.length === 0, 'but only once every 10 minutes per plan');
await call(fn, L, { action: 'updatePlan', id: plan.plan.id, notes: 'Team A: gate' });
ok(pushed.sort().join() === 'dev2,dev3', 'new orders are sent at once');
pushed.length = 0;
await call(fn, L, { action: 'removeGuest', id: (await call(fn, L, { action: 'invites' })).council.find((c) => c.name === 'Kaze').id });
advance(11 * 60000);
await call(fn, L, { action: 'addPage', planId: plan.plan.id, map: 'z007' });
ok(pushed.join() === 'dev3', 'someone removed from the council is not told anymore');
ok((await call(fn, L, { action: 'pushOff', endpoint: subL.endpoint })).ok && !(await call(fn, L, { action: 'pushStatus', endpoint: subL.endpoint })).on, 'alerts switch off');
const dead = { ...(await fakeSub(4)), endpoint: 'https://fcm.googleapis.com/fcm/send/dead' };
await call(fn, O, { action: 'pushOn', sub: dead });
advance(11 * 60000);
await call(fn, L, { action: 'edit', id: plan.pages[0].id, ops: [{ op: 'add', shape: { id: 'abc000003', t: 'stamp', k: 'attack', x: 0.4, y: 0.2 } }] });
ok(!(await E.WarPush.filter({ endpoint: dead.endpoint }, { limit: 1 })).items.length, 'a phone that unsubscribed is forgotten');
const plans = await call(fn, M, { action: 'plans' });
ok(plans.plans[0].updated_by === 'Juts', 'plans say who changed them last (for the "new" marks)');
globalThis.fetch = realFetch;
done();
