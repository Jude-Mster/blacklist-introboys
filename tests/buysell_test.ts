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
  return { lang: /benta/i.test(t) ? 'tl' : 'en', en: `EN:${t}`, tl: `TL:${t}`, th: `TH:${t}`, es: `ES:${t}`, pt: `PT:${t}`, id: `ID:${t}`, zh: `ZH:${t}` };
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
ok(!s1.message.tr && g.__llmCalls === undefined, '6.26: sending does not wait for the translator');
const p0 = await call(B, { action: 'poll' });
const t1 = await call(A, { action: 'translate', id: s1.message.id });
ok(t1.message.lang === 'tl' && t1.message.tr.en.startsWith('EN:') && t1.message.tr.th.startsWith('TH:') && t1.message.tr.zh.startsWith('ZH:'), 'then translated into every language, Taiwan Chinese included, and saved');
ok((await call(B, { action: 'translate', id: s1.message.id })).status === 404, 'only the author can ask for the translation');
const calls = g.__llmCalls;
await call(A, { action: 'translate', id: s1.message.id });
ok(g.__llmCalls === calls, 'a message is translated only once');
const p0b = await call(B, { action: 'poll', since: p0.items[p0.items.length - 1].at, trSince: p0.now });
ok(p0b.items.length === 1 && p0b.items[0].tr && p0b.items[0].tr.zh, 'others get the translation on their next poll (trSince)');

const fast = await call(A, { action: 'send', text: 'again' });
ok(fast.status === 429, 'a second message too soon is refused');
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
const c2 = g.__llmCalls;
const t2 = await call(C, { action: 'translate', id: s2.message.id });
ok(s2.ok && !t2.message.tr && g.__llmCalls === c2, 'numbers only: not sent to the translator');
const keep = g.__llm; g.__llm = async () => { throw new Error('down'); };
step();
const s3 = await call(D, { action: 'send', text: 'still selling the armor' });
const t3 = await call(D, { action: 'translate', id: s3.message.id });
ok(s3.ok && t3.ok && !t3.message.tr, 'translator down: message still goes out (original only)');
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
ok((await call(B, { action: 'send', image: big })).status !== 500, 'a large picture never crashes the function');

// ---------- private messages ----------
step();
const dm1 = await call(A, { action: 'send', to: helloA.me.vid, text: 'me' });
ok(dm1.status === 400, "can't message yourself");
const helloB = await call(B, { action: 'hello' });
const dm = await call(A, { action: 'send', to: helloB.me.vid, text: 'pm: 1.5m for the glaive?' });
const tdm = await call(A, { action: 'translate', id: dm.dm.id, where: 'private' });
ok(dm.ok && dm.dm.to === helloB.me.vid && tdm.message.tr && dm.dm.tag === helloA.me.tag, 'private message sent, then translated');
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
ok(back2.ok && back2.me.kind === 'discord' && back2.me.name === '', 'clearing the name keeps the Discord badge (hiding is the way to be Anonymous)');
ok(tagOf('ffffffff0000') === tagOf('ffffffff1111'), 'the tag comes from the visitor id');

// ---------- 6.27: hide my name, share my Discord ----------
{
  advance(5000);
  const V = anon(), W = anon();
  const hv = await call(V, { action: 'hello' });
  ok((await call(V, { action: 'setHidden', hide: true })).status === 403, 'hiding needs Discord linked');
  const lsx = await call(V, { action: 'linkStart' });
  const stx = new URL(lsx.url).searchParams.get('state');
  const rf = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    const u = String(url);
    if (u.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    if (u.endsWith('/users/@me')) return new Response(JSON.stringify({ id: '123456789012345678', username: 'seller_v', global_name: 'Seller V' }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as any;
  await call(V, { action: 'linkFinish', code: 'c', state: stx });
  globalThis.fetch = rf;
  await call(V, { action: 'rename', name: 'SellerV' });
  advance(3500);
  const named = await call(V, { action: 'send', text: 'named post' });
  ok(named.message.name === 'SellerV' && named.message.vid === hv.me.vid, 'shown: posts with the name');
  const hid = await call(V, { action: 'setHidden', hide: true });
  ok(hid.ok && hid.me.hidden && hid.me.kind === 'anon' && hid.me.vid !== hv.me.vid && hid.me.shownAs.name === 'SellerV', 'hidden: shows as Anonymous under a different id');
  advance(3500);
  const anonPost = await call(V, { action: 'send', text: 'hidden post' });
  ok(anonPost.message.kind === 'anon' && anonPost.message.name === '' && anonPost.message.vid === hid.me.vid && anonPost.message.tag !== named.message.tag, "hidden posts can't be matched to the named ones (other id, other tag)");
  ok(!JSON.stringify(anonPost).includes(hv.me.vid), 'the real id is nowhere in what others receive');
  advance(3500);
  const toHidden = await call(W, { action: 'send', to: hid.me.vid, text: 'is it still for sale?' });
  advance(3000);
  const pv = await call(V, { action: 'poll', lite: true });
  ok(pv.dms.some((d) => d.id === toHidden.dm.id), 'private messages to the hidden id still arrive');
  ok((await call(V, { action: 'translate', id: anonPost.message.id })).ok, 'the hidden author can still ask for the translation');
  ok((await call(V, { action: 'report', id: toHidden.dm.id, where: 'private' })).ok, 'and report a message sent to the hidden id');
  // reply in that conversation keeps the same (hidden) id
  advance(3500);
  const reply = await call(V, { action: 'send', to: (await call(W, { action: 'hello' })).me.vid, from: hid.me.vid, text: 'yes, 2m' });
  ok(reply.dm.from === hid.me.vid, 'a reply keeps the id the conversation uses');
  // share Discord
  advance(3500);
  const sh = await call(V, { action: 'shareDiscord', to: reply.dm.to, from: hid.me.vid });
  ok(sh.ok && sh.dm.card && sh.dm.card.url === 'https://discord.com/users/123456789012345678' && sh.dm.card.username === 'seller_v' && sh.dm.from === hid.me.vid, 'Share my Discord sends a card with the real linked profile link');
  advance(3500);
  ok((await call(W, { action: 'shareDiscord', to: hid.me.vid })).status === 403, "a visitor without Discord can't send a Discord card");
  ok((await call(V, { action: 'send', to: reply.dm.to, text: 'add me discord.com/users/1' })).status === 400, 'typed Discord links are still blocked');
  advance(3500);
  const pw = await call(W, { action: 'poll', lite: true });
  ok(pw.dms.some((d) => d.card && d.card.id === '123456789012345678'), 'the other person receives the card');
  // a moderator can still ban someone posting hidden
  const banH = await call(leader, { action: 'ban', id: anonPost.message.id });
  ok(banH.ok && banH.hidden >= 2, 'banning a hidden post bans its real owner and hides their named posts too');
  advance(3500);
  ok((await call(V, { action: 'send', text: 'back?' })).status === 403, 'the banned owner cannot post, hidden or not');
  // show again
  const V2 = anon();
  // members can hide too
  advance(3500);
  const mh = await call(plain, { action: 'setHidden', hide: true });
  ok(mh.ok && mh.me.hidden && mh.me.kind === 'anon' && /^[a-f0-9]{24}$/.test(mh.me.vid), 'members can hide their name (random hidden id)');
  advance(3500);
  const mpost = await call(plain, { action: 'send', text: 'member hidden post' });
  ok(mpost.message.kind === 'anon' && mpost.message.vid === mh.me.vid && !mpost.message.name, 'a hidden member posts as Anonymous, no badge');
  ok((await call(leader, { action: 'ban', id: mpost.message.id })).status === 400, "a hidden member can't be banned from here");
  const ms2 = await call(plain, { action: 'setHidden', hide: false });
  advance(3500);
  const mshown = await call(plain, { action: 'send', text: 'member shown again' });
  ok(!ms2.me.hidden && mshown.message.kind === 'member' && mshown.message.name === 'zKushina', 'and show it again');
  advance(3500);
  const toMemberAlias = await call(V2, { action: 'send', to: mh.me.vid, text: 'hi hidden member' });
  advance(3000);
  ok((await call(plain, { action: 'poll', lite: true })).dms.some((d) => d.id === toMemberAlias.dm.id), "a member gets messages sent to their hidden id after showing their name again");
  ok((await call(plain, { action: 'shareDiscord', to: toMemberAlias.dm.from })).ok, 'members can share their Discord');
}

// ---------- 6.28: Discord name + picture on linking, live pulses, 10 MB, 1.5 s ----------
{
  advance(10000);
  const X = anon(), Y = anon();
  const lsx = await call(X, { action: 'linkStart' });
  const stx = new URL(lsx.url).searchParams.get('state');
  ok((await call(Y, { action: 'linkFinish', code: 'c', state: stx })).error.includes('same browser'), 'finishing in another browser says so clearly');
  const rf = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    const u = String(url);
    if (u.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    if (u.endsWith('/users/@me')) return new Response(JSON.stringify({ id: '222333444555666777', username: 'night.fox', global_name: 'Night Fox 🦊', avatar: 'abc123' }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as any;
  const lf = await call(X, { action: 'linkFinish', code: 'c', state: stx });
  globalThis.fetch = rf;
  ok(lf.ok && lf.me.kind === 'discord' && lf.me.name === 'NightFox' && lf.me.avatar === 'https://cdn.discordapp.com/avatars/222333444555666777/abc123.png?size=128', 'linked: shows the Discord name and picture straight away');
  advance(2000);
  const sx = await call(X, { action: 'send', text: 'linked post' });
  ok(sx.message.kind === 'discord' && sx.message.name === 'NightFox' && sx.message.avatar.includes('cdn.discordapp.com'), 'messages carry the Discord name and picture');
  const pulseOpen = (await E.BuySellPulse.filter({ key: 'open' }, {})).items[0];
  ok(pulseOpen && pulseOpen.msg && pulseOpen.msg.id === sx.message.id, 'the open-chat pulse carries the new message (screens add it without asking)');
  advance(1600);
  const dmx = await call(X, { action: 'send', to: (await call(Y, { action: 'hello' })).me.vid, text: 'secret price 5m' });
  const dmPulses = (await E.BuySellPulse.filter({}, {})).items.filter((r) => String(r.key).startsWith('dm:'));
  ok(dmPulses.length >= 1 && !JSON.stringify(dmPulses).includes('secret price') && !JSON.stringify(dmPulses).includes(dmx.dm.to), 'private-message pulses say neither who nor what');
  advance(1600);
  ok((await call(X, { action: 'send', text: 'second' })).ok, 'one message every 1.5 s is allowed (was 3 s)');
  ok((await call(X, { action: 'send', text: 'third' })).status === 429, 'but not faster');
  // a fresh read is forced for a screen told about a change
  const p1 = await call(Y, { action: 'poll' });
  advance(1600);
  const s4 = await call(X, { action: 'send', text: 'fourth' });
  const pulseAt = (await E.BuySellPulse.filter({ key: 'open' }, {})).items[0].at;
  // another running copy still holding the old read: simulated by asking with `after`
  const p2 = await call(Y, { action: 'poll', since: p1.items[p1.items.length - 1].at, after: pulseAt });
  ok(p2.items.some((m) => m.id === s4.message.id), 'a poll after a pulse always sees the new message');
  const img = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(0xff, 0xd8, 0xff, ...new Array(64).fill(1)));
  const big9 = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(0xff, 0xd8, 0xff) + 'x'.repeat(9 * 1024 * 1024));
  advance(1600);
  ok((await call(X, { action: 'send', image: big9 })).ok, 'a 9 MB picture is accepted (limit 10 MB)');
  advance(1600);
  const big11 = 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil((10 * 1024 * 1024 + 10) / 3) * 4);
  ok((await call(X, { action: 'send', image: big11 })).status === 400, 'over 10 MB is refused');
  const ul = await call(X, { action: 'unlink' });
  ok(ul.ok && ul.me.kind === 'anon' && !ul.me.avatar && !ul.me.discord, 'unlink: back to Anonymous, picture gone');
}

done();
