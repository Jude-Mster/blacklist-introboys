// IntroBoys Assistant licenses: buying days in the shop, signing the app in with a code, the one-computer
// lock, the signed tickets, and everything that must NOT work (stolen tokens, other computers, expired,
// banned or role-less members, replays, guessing codes, forged calls).
import { member, settings, call, E, ok, done, pts, advance } from './h.ts';
const g = globalThis as any;

// A real key pair, like the one the leader puts in the site's secrets.
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))));
g.__secrets = { BOT_LICENSE_PRIVATE_KEY: pkcs8, SITE_URL: 'https://site.test' };
const F = async (n) => (await import(`../base44/functions/${n}/entry.ts`)).default;
const shop = await F('shopAction'), bot = await F('botAuth');

const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((x) => x.toString(16).padStart(2, '0')).join('');
const PC1 = hex(32), PC2 = hex(32);
// What the app does: asks with its token in X-Bot-Token.
async function app(body, token = '') {
  const req = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-bot-token': token } : {}) }, body: JSON.stringify(body) });
  const res = await bot(req);
  return { status: res.status, ...(await res.json()) };
}
// What the app does with a ticket.
async function verifyTicket(t, hwid, nonce) {
  if (!t) return null;
  const sig = Uint8Array.from(atob(t.sig), (c) => c.charCodeAt(0));
  const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, sig, new TextEncoder().encode(t.payload));
  if (!good) return null;
  const d = JSON.parse(t.payload);
  return d.hw === hwid && d.n === nonce ? d : null;
}
async function signIn(who, hwid) {            // the whole device flow
  const s = await app({ action: 'start', hwid, app_version: '4.0.0' });
  if (s.status !== 200) return { fail: s };
  const pending = await app({ action: 'poll', device_secret: s.device_secret });
  ok(pending.state === 'pending', 'poll before approval is just waiting');
  const ap = await call(bot, who, { action: 'approve', code: s.user_code, deviceTag: s.device_tag });
  if (ap.status !== 200) return { fail: ap, start: s };
  const t = await app({ action: 'poll', device_secret: s.device_secret });
  return { start: s, token: t.token, poll: t };
}
const check = (token, hwid, nonce = hex(16)) => app({ action: 'check', hwid, nonce }, token).then((r) => ({ ...r, nonce }));

await settings({ games_enabled: ['shop'], shop_seeded: true });
const START = 100000;
const L = await member('Leader', START, 'leader');
const A = await member('Alice', START), B = await member('Bob', START), C = await member('Cara', START);
const people = [L, A, B, C];
async function ledger(tag) {
  const bad = [];
  for (const m of people) {
    const p = await pts(m), s = (await E.PointLog.filter({ member_id: m.id }, {})).items.reduce((a, l) => a + l.amount, 0);
    if (p !== START + s || p < 0) bad.push(`${m.discord_name} ${p} vs ${START + s}`);
  }
  ok(!bad.length, `[${tag}] every member's points = start + their PointLog ${bad.join('; ')}`);
}

// ---------- the shop item ----------
const bad1 = await call(shop, L, { action: 'saveItem', item: { name: 'x', gp_code: true, gp_worth: 5, bot_days: 30, value_cp: 10 } });
ok(bad1.status === 400, `an item can't be both a GP code and an Assistant license (${bad1.status})`);
const bad2 = await call(shop, A, { action: 'saveItem', item: { name: 'Assistant', bot_days: 30, value_cp: 100, stock: 0 } });
ok(bad2.status === 403, `a member can't create shop items (${bad2.status})`);
const si = await call(shop, L, { action: 'saveItem', item: { name: 'IntroBoys Assistant, 30 days', category: 'Assistant', bot_days: 30, value_cp: 500, stock: 0, active: true, sort: 1 } });
ok(si.status === 200, `leader saves the license item (${si.status} ${si.error || ''})`);
let cat = await call(shop, A, { action: 'catalog' });
let item = cat.items.find((x) => x.bot_days === 30);
ok(item && item.total === 1100 && item.stock > 0, `members see it: 30 days, 500 CP x2 = 1,000 + 10% tax = 1,100 (${item && item.total})`);

// ---------- buying ----------
const a0 = await pts(A);
const stale = await call(shop, A, { action: 'buy', itemId: item.id, qty: 1, expectTotal: 5 });
ok(stale.status === 409 && (await pts(A)) === a0, `a stale price is refused and nothing is charged (${stale.status})`);
const nochar = await call(shop, A, { action: 'buy', itemId: item.id, qty: 2, expectTotal: item.total * 2 });
ok(nochar.status === 200 && nochar.order.status === 'completed', `buying needs no character name and completes at once (${nochar.status} ${nochar.error || ''})`);
ok(a0 - (await pts(A)) === 2200, `charged exactly 2 x 1,100 (${a0 - (await pts(A))})`);
ok(nochar.license && nochar.license.days_left === 60 && nochar.license.active, `60 days switched on (${JSON.stringify(nochar.license)})`);
const more = await call(shop, A, { action: 'buy', itemId: item.id, qty: 1, expectTotal: item.total });
ok(more.license.days_left === 90, `another 30 days adds on top of the time left (${more.license.days_left})`);
const huge = await call(shop, A, { action: 'buy', itemId: item.id, qty: 12, expectTotal: item.total * 12 });
const huge2 = await call(shop, A, { action: 'buy', itemId: item.id, qty: 8, expectTotal: item.total * 8 });
const before = await pts(A);
const huge3 = await call(shop, A, { action: 'buy', itemId: item.id, qty: 12, expectTotal: item.total * 12 });
ok(huge.status === 200 && huge2.status === 200 && huge3.status >= 400 && (await pts(A)) === before, `over 730 days at once is refused and not charged (${huge3.status} ${huge3.error || ''})`);
const q13 = await call(shop, B, { action: 'buy', itemId: item.id, qty: 13, expectTotal: item.total * 13 });
ok(q13.status >= 400, `more than 12 at a time is refused (${q13.status})`);
const q0 = await call(shop, B, { action: 'buy', itemId: item.id, qty: 0, expectTotal: 0 });
const qf = await call(shop, B, { action: 'buy', itemId: item.id, qty: 1.5, expectTotal: 1650 });
const qn = await call(shop, B, { action: 'buy', itemId: item.id, qty: -3, expectTotal: -3300 });
ok(q0.status >= 400 && qf.status >= 400 && qn.status >= 400 && (await pts(B)) === START, `0, 1.5 and negative quantities refused, nothing charged`);
// two clicks at once charge once each and add each: 2 x 30 days for 2 x 1,100
const b0 = await pts(B);
const two = await Promise.all([1, 2].map(() => call(shop, B, { action: 'buy', itemId: item.id, qty: 1, expectTotal: item.total })));
const st = await call(bot, B, { action: 'status' });
ok(two.every((x) => x.status === 200) && b0 - (await pts(B)) === 2200 && st.license.days_left === 60, `two buys at once: charged 2,200, 60 days (${st.license.days_left})`);
// poor members
const poor = await member('Poor', 10);
const p0 = await call(shop, poor, { action: 'buy', itemId: item.id, qty: 1, expectTotal: item.total });
const ps = await call(bot, poor, { action: 'status' });
ok(p0.status >= 400 && !ps.license.active && ps.license.total_days === 0, `not enough points: no license, nothing taken (${p0.error})`);
await ledger('after buying');

// ---------- the app: signing in ----------
const nokey = await app({ action: 'start', hwid: 'nope' });
ok(nokey.status === 400, 'a malformed device ID is refused');
const s1 = await app({ action: 'start', hwid: PC1, app_version: '4.0.0' });
ok(s1.status === 200 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(s1.user_code) && s1.verify_url === `https://site.test/link-app?link=${s1.user_code}`, `start gives a code and a link (${s1.user_code} ${s1.verify_url})`);
const p1 = await app({ action: 'poll', device_secret: s1.device_secret });
ok(p1.state === 'pending' && p1.token === undefined, 'no token before it is approved');
const wrongSecret = await app({ action: 'poll', device_secret: hex(32) });
ok(wrongSecret.state === 'expired' && wrongSecret.token === undefined, 'a guessed device secret gets nothing');
const noSite = await app({ action: 'approve', code: s1.user_code });
ok(noSite.status === 401, `approving without a site sign-in is refused (${noSite.status})`);
const d1 = await call(bot, A, { action: 'describe', code: s1.user_code.toLowerCase().replace('-', ' ') });
ok(d1.status === 200 && d1.device_tag === s1.device_tag, `the site shows the device ID the app shows (${d1.device_tag})`);
const wrongTag = await call(bot, A, { action: 'approve', code: s1.user_code, deviceTag: 'ZZZZZZ' });
ok(wrongTag.status === 409, `a device ID that doesn't match is refused (${wrongTag.status})`);
const ok1 = await call(bot, A, { action: 'approve', code: s1.user_code, deviceTag: s1.device_tag });
ok(ok1.status === 200, `Alice approves (${ok1.status} ${ok1.error || ''})`);
const again = await call(bot, B, { action: 'approve', code: s1.user_code });
ok(again.status === 404, `the code can't be approved a second time by someone else (${again.status})`);
const got = await app({ action: 'poll', device_secret: s1.device_secret });
ok(got.state === 'ok' && /^[a-f0-9]{64}$/.test(got.token), 'the app collects its sign-in');
const got2 = await app({ action: 'poll', device_secret: s1.device_secret });
ok(got2.token === undefined && got2.state === 'expired', 'the sign-in can be collected only once');
const TOK1 = got.token;
ok(JSON.stringify((await E.BotSession.filter({}, {})).items).indexOf(TOK1) < 0, 'the token itself is never stored, only its hash');

// ---------- the app: tickets ----------
const c1 = await check(TOK1, PC1);
const tk = await verifyTicket(c1.ticket, PC1, c1.nonce);
ok(c1.licensed && tk && tk.did === A.discord_id && tk.ttl <= 600 && tk.ttl >= 30, `a signed ticket for Alice, this PC and this nonce (${c1.status} ${c1.error || ''})`);
ok(tk && tk.exp === Math.floor(Date.parse(c1.expires_at) / 1000), 'the ticket carries the real expiry');
ok((await verifyTicket(c1.ticket, PC2, c1.nonce)) === null, 'the same ticket is useless on another PC');
ok((await verifyTicket(c1.ticket, PC1, hex(16))) === null, 'and useless as an answer to a different question (replay)');
const forged = { payload: c1.ticket.payload.replace(/"ttl":\d+/, '"ttl":99999999'), sig: c1.ticket.sig };
ok((await verifyTicket(forged, PC1, c1.nonce)) === null, 'a ticket with a changed field fails the signature');
const lic1 = (await E.BotLicense.filter({ member_id: A.id }, {})).items[0];
ok(lic1 && lic1.hwid_hash && lic1.hwid_hash.length === 64 && lic1.hwid_hash !== PC1, 'first use locks the license to this PC (stored as a hash)');

// a proxy that drops custom headers: the token in the body works the same
const viaBody = await app({ action: 'check', hwid: PC1, nonce: hex(16), _bt: TOK1 });
ok(viaBody.status === 200 && viaBody.licensed, `the token also works from the body (${viaBody.status})`);
const noTok = await app({ action: 'check', hwid: PC1, nonce: hex(16) });
ok(noTok.status === 401, 'no token, no ticket');
const badTok = await app({ action: 'check', hwid: PC1, nonce: hex(16) }, hex(32));
ok(badTok.status === 401, 'a made-up token, no ticket');
const noNonce = await app({ action: 'check', hwid: PC1 }, TOK1);
ok(noNonce.status === 400, 'a question without a nonce is refused');

// the token stolen to another PC: refused and cancelled for good
const stolen = await check(TOK1, PC2);
ok(stolen.status === 403 && stolen.code === 'device_mismatch' && !stolen.ticket, `the same token on another PC is refused (${stolen.code})`);
const afterSteal = await check(TOK1, PC1);
ok(afterSteal.status === 401, 'and it is cancelled: even the real PC must sign in again');

// a second sign-in replaces the first
const r2 = await signIn(A, PC1);
const r3 = await signIn(A, PC1);
const old = await check(r2.token, PC1);
const cur = await check(r3.token, PC1);
ok(old.status === 401 && cur.licensed, 'only the newest sign-in works (one app running per license)');

// another computer signs in as Alice: no ticket, because the license is locked to PC1
const r4 = await signIn(A, PC2);
const oth = await check(r4.token, PC2);
ok(oth.status === 200 && oth.licensed === false && oth.reason === 'other_device' && !oth.ticket, `Alice's license on another PC: no ticket (${oth.reason})`);
// moving the license
const reset = await call(bot, A, { action: 'resetDevice' });
ok(reset.status === 200, `Alice moves her license (${reset.status} ${reset.error || ''})`);
// 6.41: moving signs out only the PC that loses the device; the waiting PC takes the freed device at its next check
const deadOld = await check(r3.token, PC1);
ok(deadOld.status === 401, 'moving it signs the old PC out');
const now2 = await check(r4.token, PC2);
ok(now2.licensed && now2.device === 1, 'the other PC takes the freed device and works');
// 6.46: moving a device is not held back by a waiting period - she can move it again straight away
const reset2 = await call(bot, A, { action: 'resetDevice' });
ok(reset2.status === 200, `she can move it again straight away (${reset2.status} ${reset2.error || ''})`);
const r6 = await signIn(A, PC1);
const back = await check(r6.token, PC1);
ok(back.licensed && back.device === 1, 'and the old PC takes the device back');

// ---------- Bob, no license at first ----------
const cLic = await member('NoLicense', START);
const rn = await signIn(cLic, PC1);
const cn = await check(rn.token, PC1);
ok(cn.status === 200 && cn.licensed === false && cn.reason === 'no_license' && !cn.ticket, 'signed in but nothing bought: no ticket');

// ---------- losing access ----------
const rb = await signIn(B, hex(32).slice(0, 64));
const hwB = (await E.BotSession.filter({ member_id: B.id }, {})).items.length;
ok(hwB === 1, 'Bob has one sign-in');
// find Bob's PC: he used the random one passed above; sign in again with a known one
const PCB = hex(32);
const rb2 = await signIn(B, PCB);
ok((await check(rb2.token, PCB)).licensed, 'Bob runs');
await E.Member.update(B.id, { no_access: true });
const lost = await check(rb2.token, PCB);
ok(lost.status === 403 && lost.code === 'not_member' && !lost.ticket, `losing the Discord role stops the next check (${lost.code})`);
ok((await check(rb2.token, PCB)).status === 401, 'and signs the app out');
const lostLogin = await signIn(B, PCB);
ok(lostLogin.fail && lostLogin.fail.status === 401, `a member without the role can't approve a code (${lostLogin.fail && lostLogin.fail.status})`);
await E.Member.update(B.id, { no_access: false, banned: true });
const rb3 = await app({ action: 'start', hwid: PCB });
const ban = await call(bot, B, { action: 'approve', code: rb3.user_code });
ok(ban.status === 403, `a banned member can't sign the app in (${ban.status})`);
await E.Member.update(B.id, { banned: false });
// role lost between approve and collect
const r7s = await app({ action: 'start', hwid: PCB });
await call(bot, B, { action: 'approve', code: r7s.user_code });
await E.Member.update(B.id, { no_access: true });
const r7 = await app({ action: 'poll', device_secret: r7s.device_secret });
ok(r7.state === 'denied' && r7.token === undefined, 'role lost between approving and collecting: no sign-in handed over');
await E.Member.update(B.id, { no_access: false });

// ---------- guessing codes ----------
let blocked = false;
const tries = [];
for (let i = 0; i < 12; i++) {
  const r = await call(bot, C, { action: 'approve', code: `AAAA-${String(2222 + i)}` });
  tries.push(r.status);
  if (r.status === 429) blocked = true;
}
ok(blocked, 'guessing codes gets a member locked out for a while');
const s9 = await app({ action: 'start', hwid: PC1 });
const lockedGood = await call(bot, C, { action: 'approve', code: s9.user_code });
ok(lockedGood.status === 429, 'even a right code is refused during the lock');
advance(11 * 60000);
const s10 = await app({ action: 'start', hwid: PC1 });
const unlocked = await call(bot, C, { action: 'approve', code: s10.user_code });
ok(unlocked.status === 200, 'and works again after ten minutes');
// expired codes
const s11 = await app({ action: 'start', hwid: PC2 });
advance(11 * 60000);
const exp = await call(bot, A, { action: 'approve', code: s11.user_code });
const expPoll = await app({ action: 'poll', device_secret: s11.device_secret });
ok(exp.status === 404 && expPoll.state === 'expired' && expPoll.token === undefined, 'a code older than ten minutes is dead');

// ---------- time runs out ----------
const PCD = hex(32);
const rd = await signIn(L, PCD);
await call(bot, L, { action: 'adminGrant', discordId: L.discord_id, days: 3 });
const okL = await check(rd.token, PCD);
ok(okL.licensed && okL.days_left === 3, 'the leader gave themselves 3 days');
advance(2 * 86400000);
ok((await check(rd.token, PCD)).licensed, 'still good on day 2');
advance(1.5 * 86400000);
const gone = await check(rd.token, PCD);
ok(gone.status === 200 && gone.licensed === false && gone.reason === 'expired' && !gone.ticket, 'time is up: no more tickets');
const lastTk = await verifyTicket(okL.ticket, PCD, okL.nonce);
ok(lastTk && lastTk.iat + lastTk.ttl <= lastTk.exp + 1, 'a ticket never outlives the license');
// buying more after it ran out starts from now
const rebuy = await call(shop, L, { action: 'buy', itemId: item.id, qty: 1, expectTotal: item.total });
ok(rebuy.status === 200 && rebuy.license.days_left === 30, `buying after it ran out starts from today (${rebuy.license && rebuy.license.days_left})`);
ok((await check(rd.token, PCD)).licensed, 'and the app is back on without signing in again');

// ---------- the leader's tools ----------
const no = await call(bot, A, { action: 'adminGrant', discordId: C.discord_id, days: 100 });
const no2 = await call(bot, A, { action: 'adminList' });
ok(no.status === 403 && no2.status === 403, 'members can not grant days or list licenses');
const gr = await call(bot, L, { action: 'adminGrant', discordId: C.discord_id, days: 7, note: 'prize' });
ok(gr.status === 200 && gr.license.days_left === 7, `leader grants Cara 7 days (${gr.status})`);
const badDays = [0, 1.5, -99999, 99999, 'x'];
const results = [];
for (const d of badDays) results.push((await call(bot, L, { action: 'adminGrant', discordId: C.discord_id, days: d })).status);
ok(results.every((x) => x >= 400), `bad day counts refused (${results})`);
const PCC = hex(32);
const rc = await signIn(C, PCC);
ok((await check(rc.token, PCC)).licensed, 'Cara runs');
const rev = await call(bot, L, { action: 'adminRevoke', discordId: C.discord_id, reason: 'sharing the account' });
ok(rev.status === 200, 'leader revokes it');
ok((await check(rc.token, PCC)).status === 401, 'the app is signed out at once');
const rc2 = await signIn(C, PCC);
const revoked = await check(rc2.token, PCC);
ok(revoked.licensed === false && revoked.reason === 'revoked' && !revoked.ticket, 'a revoked license gets no ticket');
const cBefore = await pts(C);
const buyRev = await call(shop, C, { action: 'buy', itemId: item.id, qty: 1, expectTotal: item.total });
ok(buyRev.status === 403 && (await pts(C)) === cBefore, `a revoked member can't buy more days, and isn't charged (${buyRev.status})`);
await call(bot, L, { action: 'adminRestore', discordId: C.discord_id });
ok((await check(rc2.token, PCC)).licensed, 'restoring brings it back');
const rs = await call(bot, L, { action: 'adminReset', discordId: C.discord_id });
const ls = await call(bot, L, { action: 'adminList' });
ok(rs.status === 200 && ls.licenses.length >= 3 && ls.events.length > 0 && JSON.stringify(ls).indexOf('hwid_hash') < 0, 'leader can reset a device and sees the list and the log, without any hashes');
const dec = await call(bot, L, { action: 'adminGrant', discordId: C.discord_id, days: -3 });
ok(dec.status === 200 && dec.license.days_left === 4, `leader can take days away (${dec.license && dec.license.days_left})`);

// ---------- updates (the patcher) ----------
const SHA = hex(32), URL = 'https://files.test/IntroBoysAssistant-4.2.0-update.zip';
const rel = { action: 'adminRelease', version: '4.2.0', notes: 'Auto loot', url: URL, sha256: SHA, size: 123456, mandatory: false };
ok((await call(bot, C, rel)).status === 403, 'a member cannot publish an update');
ok((await call(bot, L, { ...rel, version: '4.2' })).status === 400, 'a bad version is refused');
ok((await call(bot, L, { ...rel, url: 'http://files.test/a.zip' })).status === 400, 'a plain http link is refused');
ok((await call(bot, L, { ...rel, sha256: 'abc' })).status === 400, 'a bad checksum is refused');
ok((await call(bot, L, { ...rel, size: 0 })).status === 400, 'an empty size is refused');
ok((await call(bot, L, rel)).status === 200, 'the leader publishes 4.2.0');
ok((await call(bot, L, rel)).status === 400, 'the same version cannot be published twice');
ok((await app({ action: 'update', version: '4.1.0' })).status === 401, 'asking for updates needs the app sign-in');
const rc3 = await signIn(C, PCC);
const up = await app({ action: 'update', version: '4.1.0' }, rc3.token);
ok(up.update_available && up.version === '4.2.0' && up.url === URL && up.sha256 === SHA && up.size === 123456 && up.mandatory === false, 'the app is offered 4.2.0');
const upKey = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, Uint8Array.from(atob(up.sig), (c) => c.charCodeAt(0)), new TextEncoder().encode(`IBU1|4.2.0|${SHA}|123456`));
ok(upKey, 'the update is signed with the license key (the app checks this)');
ok(!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, Uint8Array.from(atob(up.sig), (c) => c.charCodeAt(0)), new TextEncoder().encode(`IBU1|4.2.0|${hex(32)}|123456`))), 'a different file does not match the signature');
ok(!(await app({ action: 'update', version: '4.2.0' }, rc3.token)).update_available, 'an up-to-date app is offered nothing');
ok(!(await app({ action: 'update', version: '4.10.0' }, rc3.token)).update_available, 'versions compare as numbers (4.10.0 is newer than 4.2.0)');
await call(bot, L, { ...rel, version: '4.3.0', mandatory: true, sha256: hex(32) });
const up2 = await app({ action: 'update', version: '4.1.0' }, rc3.token);
ok(up2.version === '4.3.0' && up2.mandatory === true, 'the newest release wins and a required one in between makes it required');
const rl = await call(bot, L, { action: 'adminReleases' });
ok(rl.releases.length === 2 && rl.releases[0].version === '4.3.0', 'the leader sees the releases');
await call(bot, L, { action: 'adminReleaseToggle', id: rl.releases[0].id, active: false });
ok((await app({ action: 'update', version: '4.1.0' }, rc3.token)).version === '4.2.0', 'a withdrawn release is no longer offered');
ok((await call(bot, C, { action: 'adminReleases' })).status === 403, 'members cannot list releases');
g.__secrets.BOT_LICENSE_PRIVATE_KEY = '';
ok((await call(bot, L, { ...rel, version: '4.4.0' })).status === 503, 'without the signing key nothing can be published');
g.__secrets.BOT_LICENSE_PRIVATE_KEY = pkcs8;

// ---------- remote control ----------
const bindC = await check(rc3.token, PCC);
ok(bindC.licensed, 'C runs licensed on PCC');
const off = await call(bot, C, { action: 'remoteCommand', cmd: 'stop' });
ok(off.status === 409, `no commands while the app has not reported (${off.status})`);
const v0 = await call(bot, C, { action: 'remoteView' });
ok(v0.status === 200 && v0.online === false && v0.licensed === true, 'the remote page opens and says the app is offline');
const push1 = await app({ action: 'remotePush', state: { running: false, state: 'IDLE' }, log: ['hello', 'line\u0007two'], picture: '/9j/' + 'A'.repeat(100) }, rc3.token);
ok(push1.status === 200 && push1.allowed && push1.watching === true && push1.commands.length === 0, 'the app reports and is told the page is watching');
const v1 = await call(bot, C, { action: 'remoteView' });
ok(v1.online && v1.state.state === 'IDLE' && v1.log.split('\n').length === 2 && v1.log.indexOf('\u0007') < 0, 'the page shows the state and the log (control characters removed)');
ok(v1.picture === '/9j/' + 'A'.repeat(100), 'the page (watching) shows the picture');
await app({ action: 'remotePush', state: { running: false }, picture: '/9j/' + 'B'.repeat(100) }, rc3.token);
ok((await call(bot, C, { action: 'remoteView' })).picture === '/9j/' + 'B'.repeat(100), 'while watching, the picture is shown');
ok((await app({ action: 'remotePush', picture: '<script>' }, rc3.token)).status === 200 && (await call(bot, C, { action: 'remoteView' })).picture === '/9j/' + 'B'.repeat(100), 'a picture that is not a JPEG is ignored');
ok((await call(bot, C, { action: 'remoteCommand', cmd: 'format_c' })).status === 400, 'an unknown command is refused');
// 6.37: pictures in other shapes, and the reason when there is none
const png = 'iVBORw0KGgo' + 'A'.repeat(60);
await app({ action: 'remotePush', state: {}, picture: 'data:image/png;base64,' + png.slice(0, 30) + '\r\n' + png.slice(30) }, rc3.token);
const vp = await call(bot, C, { action: 'remoteView' });
ok(vp.picture === png && vp.picture_type === 'png', 'a PNG sent as a data: address with a line break is shown');
ok((await call(bot, C, { action: 'remoteCommand', cmd: 'enhance' })).status === 400 && (await call(bot, C, { action: 'remoteCommand', cmd: 'upgrade' })).status === 400, 'upgrade and enhance are no longer sent from the site');
advance(16_000);
await app({ action: 'remotePush', state: {}, picture: '/9j/' + 'A'.repeat(500_000) }, rc3.token);
advance(46_000);
await app({ action: 'remotePush', state: {} }, rc3.token);
await call(bot, C, { action: 'remoteView' });
await app({ action: 'remotePush', state: {}, picture: '/9j/' + 'A'.repeat(500_000) }, rc3.token);
const vbig = await call(bot, C, { action: 'remoteView' });
ok(!vbig.picture && /too big/.test(vbig.picture_note), `the page says why no picture shows (${vbig.picture_note})`);
await app({ action: 'remotePush', state: {} }, rc3.token);
ok(/no picture in the report/.test((await call(bot, C, { action: 'remoteView' })).picture_note), 'and says so when the app sends none');
await app({ action: 'remotePush', state: {}, picture_error: 'GDI+ failed' }, rc3.token);
ok(/the app could not take the picture: GDI\+ failed/.test((await call(bot, C, { action: 'remoteView' })).picture_note), 'and shows the reason the app gives');
{
  // 6.40: the database's field limit, as seen live ("Field 'picture' exceeds the maximum allowed size" at 26 KB)
  const gg = globalThis as any;
  const big = '/9j/' + 'Q'.repeat(35_000);                         // a 26 KB JPEG as base64
  gg.__beforeUpdate = (name, x) => { if (name === 'BotRemote') for (const [k, v] of Object.entries(x)) if (typeof v === 'string' && v.length > 5000) throw new Error(`Field '${k}' exceeds the maximum allowed size. Please upload large content using the UploadPublicFile integration`); };
  const r = await app({ action: 'remotePush', state: { state: 'STORE' }, picture: big }, rc3.token);
  const vv = await call(bot, C, { action: 'remoteView' });
  ok(r.status === 200 && vv.state.state === 'STORE' && vv.picture === big, 'a picture too big for one field is stored in pieces and shown whole');
  const row = (await E.BotRemote.filter({ member_id: C.id }, {})).items[0];
  ok(row.parts === 12 && !row.picture, `pieces of 3000 were learned (${row.parts} pieces)`);
  // every piece refused: uploaded as a file instead
  const ups = gg.__uploads || 0;
  gg.__beforeUpdate = (name, x) => { if (name === 'BotRemote' && Object.keys(x).some((k) => /^pic_/.test(k) && x[k])) throw new Error('Field exceeds the maximum allowed size'); };
  await app({ action: 'remotePush', state: {}, picture: big }, rc3.token);
  const vu = await call(bot, C, { action: 'remoteView' });
  ok(gg.__uploads === ups + 1 && /^https:\/\//.test(vu.picture_url) && !vu.picture, 'if even small pieces are refused, the picture is uploaded and its address shown');
  // and if the upload fails too, the page says why
  const keep = gg.__upload; gg.__upload = async () => { throw new Error('upload down'); };
  advance(70_000);
  await call(bot, C, { action: 'remoteView' });
  await app({ action: 'remotePush', state: {}, picture: big }, rc3.token);
  const vn = await call(bot, C, { action: 'remoteView' });
  gg.__upload = keep; gg.__beforeUpdate = null;
  ok(!vn.picture && !vn.picture_url && /could not store the picture \(26 KB\)/.test(vn.picture_note), `the reason is shown (${vn.picture_note})`);
  // nobody watching: the pieces are cleared
  advance(25_000);
  await app({ action: 'remotePush', state: {} }, rc3.token);
  const cleared = (await E.BotRemote.filter({ member_id: C.id }, {})).items[0];
  ok(!cleared.parts && !cleared.pic_0 && !cleared.picture_url, 'with the page closed nothing of the picture is kept');
}
const st1 = await call(bot, C, { action: 'remoteCommand', cmd: 'start', args: { dungeon: 'den', runs: 5000, start_boss: 9, evil: 1 } });
ok(st1.status === 200, 'the owner queues start');
await call(bot, C, { action: 'remoteCommand', cmd: 'return_town' });
ok((await call(bot, A, { action: 'remoteCommand', cmd: 'stop' })).status !== 200, 'another member cannot send commands (A has no running app of their own)');
const pull = await app({ action: 'remotePush', state: {} }, rc3.token);
ok(pull.commands.length === 2 && pull.commands[0].cmd === 'start' && pull.commands[1].cmd === 'return_town', 'the app gets the commands in order');
ok(JSON.stringify(pull.commands[0].args) === JSON.stringify({ dungeon: 'den', runs: 999, start_boss: 5 }), `arguments are clamped and unknown ones dropped (${JSON.stringify(pull.commands[0].args)})`);
ok((await app({ action: 'remotePush', state: {} }, rc3.token)).commands.length === 0, 'each command is handed out only once');
await app({ action: 'remotePush', results: [{ id: pull.commands[0].id, ok: true, message: 'started' }, { id: pull.commands[1].id, ok: false, message: 'busy' }] }, rc3.token);
const v2 = await call(bot, C, { action: 'remoteView' });
ok(v2.commands.some((c) => c.cmd === 'start' && c.status === 'done') && v2.commands.some((c) => c.cmd === 'return_town' && c.status === 'failed' && c.result === 'busy'), 'results show on the page');
for (let i = 0; i < 3; i++) await call(bot, C, { action: 'remoteCommand', cmd: 'stop' });
ok((await call(bot, C, { action: 'remoteCommand', cmd: 'stop' })).status === 429, 'no more than 3 waiting commands');
advance(61_000);
await app({ action: 'remotePush', state: {} }, rc3.token);
const late = await app({ action: 'remotePush', state: {} }, rc3.token);
ok(late.commands.length === 0 && (await call(bot, C, { action: 'remoteView' })).commands.filter((c) => c.status === 'expired').length >= 3, 'commands older than a minute are never run');
advance(21_000);
const unwatched = await app({ action: 'remotePush', state: {}, picture: '/9j/' + 'C'.repeat(50) }, rc3.token);
ok(unwatched.watching === false, 'with the page closed the app is told nobody watches');
const pcB = await signIn(C, PC2);
ok((await app({ action: 'remotePush', state: { x: 1 } }, pcB.token)).allowed === false, 'an app on another PC (not the locked one) cannot be controlled');
ok((await app({ action: 'remotePush', state: {} })).status === 401, 'reporting needs the app sign-in');

// ---------- no signing key ----------
g.__secrets = { ...g.__secrets, BOT_LICENSE_PRIVATE_KEY: '' };
const pingNoKey = await app({ action: 'ping' });
const nk = await check(rd.token, PCD);
ok(pingNoKey.signing === false && nk.status === 503 && !nk.ticket, `without the signing key no ticket is ever made (${nk.status})`);
g.__secrets.BOT_LICENSE_PRIVATE_KEY = 'AAAA';
ok((await check(rd.token, PCD)).status >= 400, 'a broken signing key makes no ticket either');

// ---------- logout ----------
g.__secrets.BOT_LICENSE_PRIVATE_KEY = pkcs8;
const lo = await app({ action: 'logout' }, rd.token);
ok(lo.status === 200 && (await check(rd.token, PCD)).status === 401, 'signing out in the app ends the sign-in');
// the members' data stays private
const st2 = JSON.stringify(await call(bot, A, { action: 'status' }));
ok(st2.indexOf(lic1.hwid_hash) < 0, 'the site never sends the stored device hash back');
await ledger('end');
// ---------- 6.31: spam guard on the app's sign-in ----------
{
  async function appFrom(ip, body) {
    const req = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
    const res = await bot(req);
    return { status: res.status, ...(await res.json()) };
  }
  advance(20 * 60 * 1000);
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push(await appFrom('203.0.113.9', { action: 'start', hwid: hex(32), app_version: '4.0.0' }));
  ok(codes.every((r) => r.status === 200), 'one connection gets 5 sign-in codes');
  const sixth = await appFrom('203.0.113.9', { action: 'start', hwid: hex(32), app_version: '4.0.0' });
  ok(sixth.status === 429 && sixth.code === 'busy', `the 6th from the same connection within 10 minutes is refused (${sixth.status})`);
  const other = await appFrom('198.51.100.4', { action: 'start', hwid: hex(32), app_version: '4.0.0' });
  ok(other.status === 200, 'someone else can still sign in while that connection is stopped');
  // the same computer asking again and again: its old codes stop working but still count
  const pc = hex(32);
  const r1 = await appFrom('192.0.2.77', { action: 'start', hwid: pc, app_version: '4.0.0' });
  const r2 = await appFrom('192.0.2.77', { action: 'start', hwid: pc, app_version: '4.0.0' });
  ok((await appFrom('192.0.2.77', { action: 'poll', device_secret: r1.device_secret })).state === 'expired', "a computer's earlier code stops working when it asks for a new one");
  ok((await call(bot, A, { action: 'approve', code: r1.user_code, deviceTag: r1.device_tag })).status === 404, 'a replaced code can not be approved');
  ok((await appFrom('192.0.2.77', { action: 'poll', device_secret: r2.device_secret })).state === 'pending', 'the newest code is the one that works');
  for (let i = 0; i < 3; i++) await appFrom('192.0.2.77', { action: 'start', hwid: pc, app_version: '4.0.0' });
  ok((await appFrom('192.0.2.77', { action: 'start', hwid: pc, app_version: '4.0.0' })).status === 429, 'asking again from the same computer still counts toward the limit');
  advance(11 * 60 * 1000);
  ok((await appFrom('203.0.113.9', { action: 'start', hwid: hex(32), app_version: '4.0.0' })).status === 200, 'after 10 minutes that connection can sign in again');
  // polling flood
  let polls = 0, refused = 0;
  for (let i = 0; i < 70; i++) { const r = await appFrom('203.0.113.50', { action: 'poll', device_secret: hex(32) }); if (r.status === 429) refused++; else polls++; }
  ok(polls === 60 && refused === 10, `polling is limited to 60 a minute per connection (${polls} answered, ${refused} refused)`);
  // no address at all: never one shared bucket
  let noIp = 0;
  for (let i = 0; i < 7; i++) if ((await app({ action: 'start', hwid: hex(32), app_version: '4.0.0' })).status === 200) noIp++;
  ok(noIp === 7, 'requests without an address are not lumped into one shared limit');
}

// ---------- 6.31: the leader gives days to several members, or to everyone ----------
{
  const D = await member('Dora', START), Ev = await member('Evan', START);
  people.push(D, Ev);
  const many = await call(bot, L, { action: 'adminGrantMany', discordIds: [D.discord_id, Ev.discord_id], days: 5, note: 'event prize' });
  ok(many.ok && many.given === 2 && many.skipped.length === 0, `leader gives 5 days to two members at once (${many.given})`);
  const sd = await call(bot, D, { action: 'status' });
  ok(sd.license.active && sd.license.days_left === 5, 'Dora has 5 days');
  ok((await call(bot, A, { action: 'adminGrantMany', discordIds: [A.discord_id], days: 30 })).status === 403, 'a member can not give days');
  ok((await call(bot, L, { action: 'adminGrantMany', discordIds: [], days: 5 })).status === 400, 'nobody picked: refused');
  ok((await call(bot, L, { action: 'adminGrantMany', discordIds: [D.discord_id], days: 1.5 })).status === 400, 'half days refused');
  const cnt = await call(bot, L, { action: 'adminCountAll' });
  const before = (await call(bot, Ev, { action: 'status' })).license.days_left;
  const all = await call(bot, L, { action: 'adminGrantMany', everyone: true, days: 2, note: 'guild giveaway' });
  ok(all.ok && all.given + all.skipped.length === cnt.count && all.given >= 4, `Everyone: ${all.given} members got 2 days (${all.skipped.length} skipped)`);
  ok((await call(bot, Ev, { action: 'status' })).license.days_left === before + 2, 'their days add on to what they had');
  const pointsAfter = await pts(Ev);
  ok(pointsAfter === START, 'giving days never touches points');
  // someone switched off is skipped and reported, the rest still get theirs
  await call(bot, L, { action: 'adminRevoke', discordId: D.discord_id, reason: 'test' });
  const mixed = await call(bot, L, { action: 'adminGrantMany', discordIds: [D.discord_id, Ev.discord_id], days: 1 });
  ok(mixed.given === 1 && mixed.skipped.length === 1 && /switched off/i.test(mixed.skipped[0].why), 'a switched-off member is skipped with the reason; the others still get days');
  await ledger('after giving days');
}


// ---------- 6.41: several devices ----------
{
  const Mx = await member('Multi', START);
  const P1 = hex(32), P2 = hex(32), P3 = hex(32);
  await call(bot, L, { action: 'adminGrant', discordId: Mx.discord_id, days: 30 });
  const m1 = await signIn(Mx, P1);
  ok((await check(m1.token, P1)).licensed, 'Multi runs on PC 1 (device 1)');
  const m2 = await signIn(Mx, P2);
  ok((await check(m1.token, P1)).licensed, 'signing in on a second PC no longer signs the first one out');
  const w2 = await check(m2.token, P2);
  ok(w2.licensed === false && w2.reason === 'other_device', 'without a second device the second PC does not run');
  const d = await call(bot, Mx, { action: 'describe', code: (await (async () => { const st = await app({ action: 'start', hwid: hex(32), app_version: '4.7.0' }); return st.user_code; })()) });
  ok(d.status === 200 && d.other_device === true, 'the sign-in page warns that every device with days is in use');
  // divide the days: 10 of device 1's 30 go to a new device
  const mv = await call(bot, Mx, { action: 'moveDays', from: 1, to: 'new', days: 10 });
  ok(mv.ok && mv.to.seat === 2 && mv.to.days_left === 10 && mv.from.days_left === 20, `10 days moved to a new device 2 (${mv.from && mv.from.days_left} / ${mv.to && mv.to.days_left})`);
  const ok2 = await check(m2.token, P2);
  ok(ok2.licensed && ok2.device === 2, 'the second PC takes device 2 and runs');
  ok((await check(m1.token, P1)).licensed, 'and the first PC still runs');
  ok((await call(bot, Mx, { action: 'moveDays', from: 2, to: 1, days: 11 })).status === 400, 'you can not move more days than the device has');
  ok((await call(bot, Mx, { action: 'moveDays', from: 1, to: 1, days: 1 })).status === 400, 'or move days to the same device');
  // buy days for a third PC in the shop
  const item = await E.ShopItem.create({ name: 'Assistant 7 days', category: 'Assistant', price: 100, value_cp: 0, stock: 0, active: true, sort: 1, bot_days: 7 });
  const st0 = await call(bot, Mx, { action: 'status' });
  const buy = await call(shop, Mx, { action: 'buy', itemId: item.id, qty: 1, botSeat: 'new' });
  ok(buy.ok && /Device 3/.test(buy.order.delivery_code || ''), `a purchase can be for a new device (${buy.error || buy.order && buy.order.delivery_code})`);
  const m3 = await signIn(Mx, P3);
  ok((await check(m3.token, P3)).licensed, 'the third PC runs on the device just bought');
  const buy2 = await call(shop, Mx, { action: 'buy', itemId: item.id, qty: 1, botSeat: 2 });
  const st = await call(bot, Mx, { action: 'status' });
  ok(buy2.ok && st.devices.length === 3 && st.devices.find((x) => x.seat === 2).days_left === 17, 'or for one of your devices (device 2 now has 17)');
  ok(st.license.active && st.license.devices === 3 && st.max_devices === 5, 'the page lists every device');
  // names, moving one device to another PC, removing an empty device
  ok((await call(bot, Mx, { action: 'renameDevice', seat: 2, label: 'Laptop <b>' })).label === 'Laptop b', 'a device can be named');
  ok((await call(bot, Mx, { action: 'removeDevice', seat: 2 })).status === 400, 'a device with days can not be removed');
  await call(bot, Mx, { action: 'moveDays', from: 3, to: 1, days: 6 });
  const rm = await call(bot, Mx, { action: 'removeDevice', seat: 3 });
  ok(rm.ok && (await check(m3.token, P3)).status === 401, 'an empty device can be removed (its PC is signed out)');
  for (let i = 0; i < 3; i++) await call(bot, Mx, { action: 'moveDays', from: 1, to: 'new', days: 1 });
  ok((await call(bot, Mx, { action: 'moveDays', from: 1, to: 'new', days: 1 })).status === 400, 'at most 5 devices');
  // remote control is per device
  await app({ action: 'remotePush', state: { state: 'ON PC2' } }, m2.token);
  await app({ action: 'remotePush', state: { state: 'ON PC1' } }, m1.token);
  const rv2 = await call(bot, Mx, { action: 'remoteView', seat: 2 });
  ok(rv2.seat === 2 && rv2.state && rv2.state.state === 'ON PC2' && rv2.devices.length === 5, 'the remote page shows the device you pick');
  await call(bot, Mx, { action: 'remoteCommand', cmd: 'stop', seat: 2 });
  const pull1 = await app({ action: 'remotePush', state: {} }, m1.token);
  const pull2 = await app({ action: 'remotePush', state: {} }, m2.token);
  ok(pull1.commands.length === 0 && pull2.commands.length === 1, 'a command goes only to the device it was sent to');
  // switching off is for the member: every device stops
  await call(bot, L, { action: 'adminRevoke', discordId: Mx.discord_id, reason: 'test' });
  const c1 = await check(m1.token, P1), c2 = await check(m2.token, P2);
  ok(!c1.licensed && !c2.licensed && !c1.ticket && !c2.ticket, `switching off stops every device (${c1.status}/${c2.status})`);
  const adm = await call(bot, L, { action: 'adminList' });
  ok(adm.licenses.filter((l) => l.member_id === Mx.id).length === 5, 'the leader sees one line per device');
}

// ---------- 6.47: the phone Assistant ----------
{
  const Ph = await member('Phoebe', START);
  const PC = hex(32), PHONE = hex(32);
  const phoneCheck = (token, hwid, nonce = hex(16)) => app({ action: 'check', hwid, nonce, platform: 'android' }, token).then((r) => ({ ...r, nonce }));
  await call(bot, L, { action: 'adminGrant', discordId: Ph.discord_id, days: 20 });
  await call(bot, Ph, { action: 'moveDays', from: 1, to: 'new', days: 10 });
  // the phone signs in like a PC; the sign-in page says it is a phone and that it is not switched on yet
  const st = await app({ action: 'start', hwid: PHONE, app_version: '1.0.0', platform: 'android' });
  const desc = await call(bot, Ph, { action: 'describe', code: st.user_code });
  ok(desc.platform === 'android' && desc.mobile_off === true, `the sign-in page knows it is a phone that is not allowed yet (${desc.platform}/${desc.mobile_off})`);
  await call(bot, Ph, { action: 'approve', code: st.user_code, deviceTag: st.device_tag });
  const tok = (await app({ action: 'poll', device_secret: st.device_secret })).token;
  const off = await phoneCheck(tok, PHONE);
  ok(off.status === 200 && off.licensed === false && off.reason === 'mobile_off' && !off.ticket, `without the leader's switch the phone does not run (${off.reason})`);
  const st0 = await call(bot, Ph, { action: 'status' });
  ok(st0.mobile_allowed === false && st0.devices.every((d) => !d.device_bound), 'and it locks no device while it is off');
  ok((await call(bot, Ph, { action: 'adminMobile', discordId: Ph.discord_id, on: true })).status === 403, 'only the Guild Leader can switch it on');
  const on = await call(bot, L, { action: 'adminMobile', discordId: Ph.discord_id, on: true });
  ok(on.ok && on.mobile === true, 'the Guild Leader switches it on');
  const run = await phoneCheck(tok, PHONE);
  ok(run.licensed && !!(await verifyTicket(run.ticket, PHONE, run.nonce)), 'now the phone runs with a signed ticket');
  const pcIn = await signIn(Ph, PC);
  ok((await check(pcIn.token, PC)).licensed, 'and the PC runs on the other device');
  const st1 = await call(bot, Ph, { action: 'status' });
  const ph = st1.devices.find((d) => d.platform === 'android'), pc = st1.devices.find((d) => d.platform === 'pc');
  ok(st1.mobile_allowed && ph && pc && ph.seat !== pc.seat, `the page shows one phone and one PC (${st1.devices.map((d) => d.platform).join(',')})`);
  const adm = await call(bot, L, { action: 'adminList' });
  ok(adm.licenses.filter((l) => l.member_id === Ph.id).every((l) => l.mobile), 'the leader sees the switch on every device');
  // a device made later carries the switch
  await call(bot, Ph, { action: 'moveDays', from: 1, to: 'new', days: 1 });
  ok((await call(bot, L, { action: 'adminList' })).licenses.filter((l) => l.member_id === Ph.id).length === 3 &&
     (await call(bot, L, { action: 'adminList' })).licenses.filter((l) => l.member_id === Ph.id).every((l) => l.mobile), 'a new device keeps the phone switch');
  // off again: the phone is signed out, the PC keeps running
  await call(bot, L, { action: 'adminMobile', discordId: Ph.discord_id, on: false });
  ok((await phoneCheck(tok, PHONE)).status === 401, 'switching it off signs the phone out');
  ok((await check(pcIn.token, PC)).licensed, 'the PC keeps running');
  // the PC app (no platform) is never asked about the switch
  ok((await check(pcIn.token, PC)).reason !== 'mobile_off', 'the PC app is not affected');
}

done();
