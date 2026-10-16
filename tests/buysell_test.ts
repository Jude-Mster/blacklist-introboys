// 6.25: Wuxen2 Buy and Sell (the open chat). Run: deno run -A --import-map=import_map.json buysell_test.ts
import { E, member, settings, advance, ok, done } from './h.ts';
import fn from '../base44/functions/buysellAction/entry.ts';
import cb from '../base44/functions/discordCallback/entry.ts';
import { blockedReason, nameProblem, tagOf } from '../base44/shared/buysell.ts';

const g = globalThis as any;
g.__secrets = { DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'csecret', DISCORD_REDIRECT_URI: 'https://site.example/functions/discordCallback', APP_URL: 'https://site.example' };
// The translator: answers with every language (marks the text so the test can tell).
g.__llm = async (p) => {
  const m = /Message: """([\s\S]*)"""/.exec(p.prompt);
  const t = m ? m[1] : '';
  return { lang: /benta/i.test(t) ? 'tl' : 'en', en: `EN:${t}`, tl: `TL:${t}`, th: `TH:${t}`, es: `ES:${t}`, pt: `PT:${t}`, id: `ID:${t}` };
};

const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map((x) => x.toString(16).padStart(2, '0')).join('');
const anon = () => ({ a: hex() });
async function call(who, body, ip = '10.0.0.1') {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  if (who && who.token) headers['x-guild-session'] = who.token;
  const req = new Request('http://x/', { method: 'POST', headers, body: JSON.stringify({ ...(who && who.a ? { _a: who.a } : {}), ...body }) });
  const res = await fn(req);
  return { status: res.status, ...(await res.json()) };
}
const step = () => advance(3500);

await settings();
const r0 = await call(null, { action: 'ping' });
ok(r0.ok && r0.version, 'ping answers with the version');

// ---------- filters ----------
ok(blockedReason('visit www.scam.com') !== '', 'www links are blocked');
ok(blockedReason('go to scam . com now') !== '', 'spaced-out links are blocked');
ok(blockedReason('join discord.gg/abc') !== '', 'discord invites are blocked');
ok(blockedReason('text me 0917 123 4567') !== '', 'PH mobile numbers are blocked');
ok(blockedReason('+66812345678 line me') !== '', 'numbers with + are blocked');
ok(blockedReason('WTS +7 glaive 1500000 gold') === '', 'prices are not phone numbers');
ok(blockedReason('selling 1,000,000,000 silver') === '', 'big prices with commas are fine');
ok(nameProblem('Lucky_Ox') === '' && nameProblem('ab') !== '' && nameProblem('JutsFan') !== '' && nameProblem('x-y-z') !== '', 'name rules: 3-16 letters/numbers/_ and reserved words');

// ---------- open chat ----------
const A = anon(), B = anon(), C = anon(), D = anon();
const helloA = await call(A, { action: 'hello' });
ok(helloA.ok && helloA.me.kind === 'anon' && /^\d{4}$/.test(helloA.me.tag), 'a visitor is Anonymous #NNNN with no sign-in');
ok((await E.BuySellUser.filter({}, {})).items.length === 0, 'just looking creates no rows');
const noTok = await call(null, { action: 'poll' });
ok(noTok.status === 401, 'a call without any identity is refused');

const s1 = await call(A, { action: 'send', text: 'WTS +7 glaive, benta ko na' });
ok(s1.ok && s1.message.kind === 'anon' && s1.message.tag === helloA.me.tag, 'anonymous message posted');
ok(s1.message.lang === 'tl' && s1.message.tr.en.startsWith('EN:') && s1.message.tr.th.startsWith('TH:'), 'translated once into every language and saved with the message');
const fast = await call(A, { action: 'send', text: 'again' });
ok(fast.status === 429, 'a second message within 3 s is refused');
ok((await call(B, { action: 'send', text: 'see www.free-gold.net' })).status === 400, 'links refused by the server');
ok((await call(B, { action: 'send', text: 'x'.repeat(301) })).status === 400, 'over 300 characters refused');
ok((await call(B, { action: 'send', text: '   ' })).status === 400, 'empty message refused');
step();
const p1 = await call(B, { action: 'poll' });
ok(p1.ok && p1.items.length === 1 && p1.items[0].text.includes('glaive'), 'another visitor sees it');
const since = p1.items[0].at;
step();
await call(B, { action: 'send', text: 'how much?' });
step();
const p2 = await call(A, { action: 'poll', since });
ok(p2.items.length === 1 && p2.items[0].text === 'how much?', 'poll with since returns only newer messages');

// no translation for numbers only, and untranslated when the translator fails
step();
const s2 = await call(C, { action: 'send', text: '500k' });
ok(s2.ok && !s2.message.tr, 'numbers only: not sent to the translator');
const keep = g.__llm; g.__llm = async () => { throw new Error('down'); };
step();
const s3 = await call(D, { action: 'send', text: 'still selling the armor' });
ok(s3.ok && !s3.message.tr, 'translator down: message still goes out (original only)');
g.__llm = keep;

// ---------- images ----------
const png = 'data:image/png;base64,' + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)));
step();
const si = await call(A, { action: 'send', image: png });
ok(si.ok && /^https:\/\/files\.example\/wuxen2-\d+\.png$/.test(si.message.image), 'a picture is uploaded and posted');
step();
const fake = 'data:image/png;base64,' + btoa('<script>alert(1)</script>');
ok((await call(A, { action: 'send', image: fake })).status === 400, 'a file that is not really a picture is refused');
const big = 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil((3 * 1024 * 1024 + 10) / 3) * 4);
ok((await call(B, { action: 'send', image: big })).status === 400, 'pictures over 3 MB are refused');

// ---------- private messages ----------
step();
const dm1 = await call(A, { action: 'send', to: helloA.me.vid, text: 'me' });
ok(dm1.status === 400, "can't message yourself");
const helloB = await call(B, { action: 'hello' });
const dm = await call(A, { action: 'send', to: helloB.me.vid, text: 'pm: 1.5m for the glaive?' });
ok(dm.ok && dm.dm.to === helloB.me.vid && dm.dm.tr && dm.dm.tag === helloA.me.tag, 'private message sent, translated');
step();
const pb = await call(B, { action: 'poll', lite: true });
ok(pb.dms.length === 1 && pb.dms[0].text.includes('1.5m') && pb.items.length === 0, 'the receiver gets it in a light poll (the bubble)');
const pc = await call(C, { action: 'poll' });
ok(pc.dms.length === 0, 'nobody else can see a private message');
const ib = await call(B, { action: 'inbox' });
ok(ib.dms.length === 1, 'inbox has the conversation');
ok((await call(C, { action: 'report', id: dm.dm.id, where: 'private' })).status === 404, "an outsider can't even report someone else's private message");
ok((await call(B, { action: 'send', to: 'not-a-vid', text: 'hi' })).status === 400, 'a bad recipient is refused');

// ---------- reports ----------
const target = s1.message.id;
await call(B, { action: 'report', id: target });
await call(B, { action: 'report', id: target });
await call(C, { action: 'report', id: target });
step();
let open = (await call(D, { action: 'poll' })).items;
ok(open.some((m) => m.id === target), 'two different reporters (one reported twice) do not hide a message');
await call(D, { action: 'report', id: target });
step();
open = (await call(D, { action: 'poll' })).items;
ok(!open.some((m) => m.id === target), 'three different reporters hide it');
ok((await call(A, { action: 'report', id: si.message.id })).status === 400, "can't report your own message");

// ---------- members ----------
const leader = await member('Juts', 1000, 'leader');
const plain = await member('zKushina', 1000, 'member');
const before = (await E.Member.get(leader.id)).points;
step();
const ms = await call(plain, { action: 'send', text: 'guild selling pots' });
ok(ms.ok && ms.message.kind === 'member' && ms.message.name === 'zKushina' && ms.message.role === 'member', 'members post under their name with the INTROBOYS badge');
ok((await call(plain, { action: 'remove', id: ms.message.id })).status === 403, 'plain members cannot remove messages');
ok((await call(A, { action: 'ban', vid: helloB.me.vid })).status === 403, 'visitors cannot ban');
step();
const toMember = await call(C, { action: 'send', to: ms.message.vid, text: 'how much pots' });
ok(toMember.ok, 'a visitor can message a member');
step();
ok((await call(plain, { action: 'poll' })).dms.some((d) => d.id === toMember.dm.id), 'the member receives it');
step();
const bad = await call(C, { action: 'send', text: 'bad stuff' });
ok((await call(leader, { action: 'remove', id: bad.message.id })).ok, 'the leader removes a message');
step();
ok(!(await call(D, { action: 'poll' })).items.some((m) => m.id === bad.message.id), 'removed message is gone for everyone');
ok((await call(leader, { action: 'ban', vid: (await call(C, { action: 'hello' })).me.vid })).ok, 'the leader bans a visitor');
step();
ok((await call(C, { action: 'send', text: 'hello?' })).status === 403, 'a banned visitor cannot post');
ok((await E.Member.get(leader.id)).points === before, 'nothing here touches points');
ok((await call(leader, { action: 'hello' })).me.moderator === true, 'officers and the leader see moderation tools');

// The site sends a member's session token inside the body (`_s`), not only as a header.
{
  const res = await fn(new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'hello', _s: leader.token, _a: hex() }) }));
  const j = await res.json();
  ok(j.me && j.me.kind === 'member' && j.me.name === 'Juts', 'a member is recognised from the session token in the body');
}

// ---------- a name by linking Discord ----------
ok((await call(D, { action: 'rename', name: 'Lucky_Ox' })).status === 403, 'renaming needs Discord linked first');
const ls = await call(D, { action: 'linkStart' });
ok(ls.ok && /scope=identify&/.test(ls.url) && !/guilds/.test(ls.url), 'link asks Discord only for identify (no guild access)');
const state = new URL(ls.url).searchParams.get('state');
// Discord comes back to the callback, which sends the visitor to the chat (not the sign-in page)
const back = await cb(new Request(`https://fn.example/?code=abc&state=${state}`));
ok(back.status === 302 && (back.headers.get('location') || '').startsWith('https://site.example/buysell?code=abc'), 'callback returns a Buy and Sell link to /buysell');
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url) => {
  const u = String(url);
  if (u.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
  if (u.endsWith('/users/@me')) return new Response(JSON.stringify({ id: '555', username: 'lucky_ox', global_name: 'Lucky Ox' }), { status: 200 });
  return new Response('{}', { status: 404 });
}) as any;
ok((await call(A, { action: 'linkFinish', code: 'abc', state })).status === 400, 'another browser cannot finish someone else\'s link');
const lf = await call(D, { action: 'linkFinish', code: 'abc', state });
ok(lf.ok && lf.me.discord === 'Lucky Ox' && lf.suggest === 'lucky_ox', 'linked: Discord name known, name suggested');
ok((await call(D, { action: 'linkFinish', code: 'abc', state })).status === 400, 'a link is finished only once');
const sessions = (await E.Session.filter({}, {})).items.length;
ok(sessions === 2, 'linking created no members-portal session (only the two test members have one)');
ok((await call(D, { action: 'rename', name: 'Juts_Seller' })).status === 400, 'reserved words are refused');
ok((await call(D, { action: 'rename', name: 'zKushina' })).status === 400, "a guild member's name is refused");
const rn = await call(D, { action: 'rename', name: 'Lucky_Ox' });
ok(rn.ok && rn.me.name === 'Lucky_Ox' && rn.me.kind === 'discord', 'name picked: shows with the Discord badge');
step();
const named = await call(D, { action: 'send', text: 'WTB wings' });
ok(named.message.name === 'Lucky_Ox' && named.message.kind === 'discord', 'messages show the chosen name');
// someone else can't take it
const ls2 = await call(A, { action: 'linkStart' });
const st2 = new URL(ls2.url).searchParams.get('state');
globalThis.fetch = (async (url) => {
  const u = String(url);
  if (u.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok2' }), { status: 200 });
  if (u.endsWith('/users/@me')) return new Response(JSON.stringify({ id: '777', username: 'other' }), { status: 200 });
  return new Response('{}', { status: 404 });
}) as any;
await call(A, { action: 'linkFinish', code: 'xyz', state: st2 });
ok((await call(A, { action: 'rename', name: 'lucky_OX' })).status === 400, 'names are unique (any upper/lower case)');
globalThis.fetch = realFetch;
const back2 = await call(D, { action: 'rename', name: '' });
ok(back2.ok && back2.me.kind === 'anon' && back2.me.name === '', 'can go back to Anonymous');
ok(tagOf('ffffffff0000') === tagOf('ffffffff1111'), 'the tag comes from the visitor id');

done();
