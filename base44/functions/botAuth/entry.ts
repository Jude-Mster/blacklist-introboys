import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser, sha256Hex, randomHex, POLL_REUSE_MS } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, getMemberByDiscordId, withMemberLock, withRecordLock, UserError, errorResponse, resilient
} from '../../shared/points.ts';
import { refreshAccess } from '../../shared/access.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { memo, bust } from '../../shared/memo.ts';
import {
  TICKET_TTL_S, CHECK_EVERY_S, BOT_SESSION_DAYS, CODE_TTL_MS, DAY_MS,
  cleanHwid, cleanNonce, hwHash, deviceTag, newUserCode, normCode, text, siteUrl,
  getLicense, getLicenses, licenseState, licenseSummary, mobileOn, memberSummary, grantDays, moveDays, seatOf, seatName, MAX_SEATS,
  logEvent, botSession, killBotSessions, signTicket, signText, signingConfigured,
  START_PER_IP, START_WINDOW_MS, POLL_PER_IP_PER_MIN, clientIp, ipHash, memLimit
} from '../../shared/botLicense.ts';
import { rankedMembers } from '../../shared/points.ts';
import { readApkFromUrl } from '../../shared/apkInfo.ts';

// The IntroBoys Assistant license service. One function, three kinds of caller:
//
//   the app, not signed in   start  poll              (device sign-in: the app shows a code, the member approves it on the site)
//   the app, signed in       check  logout  update  remotePush  lootPush            (header X-Bot-Token; `check` returns the signed ticket the app needs to run)
//   the site (Discord login) status describe approve resetDevice  remoteView remoteCommand
//   the Guild Leader         adminList adminGrant adminRevoke adminRestore adminReset adminMobile adminRelease adminReleases adminReleaseToggle
//
// The app can only ever be told "yes" in a ticket signed by this function. See shared/botLicense.ts.

const fail = (code: string, message: string, status = 400) => Response.json({ error: message, code }, { status });
const nowIso = () => new Date(Date.now()).toISOString();
const minutesAgo = (iso, m) => Date.now() - Date.parse(iso || '') < m * 60000;
const MAX_PENDING_CODES = 3000;

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    let p: any = {};
    try { p = (await req.clone().json()) || {}; } catch { p = {}; }
    const action = String(p.action || '');

    if (action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION, signing: await signingConfigured() });

    // ---------- the app, before it is signed in ----------
    if (action === 'appUpdate') return await appUpdate(b);
    if (action === 'start') return await start(b, p, req);
    if (action === 'poll') {
      const pip = clientIp(req);   // no address known: no per-connection limit (never one shared bucket for everyone)
      if (pip && !memLimit('poll:' + pip, POLL_PER_IP_PER_MIN, 60000)) return fail('busy', 'Slow down: try again in a minute.', 429);
      return await poll(b, p);
    }

    // ---------- the app, signed in ----------
    if (action === 'check' || action === 'logout' || action === 'update' || action === 'remotePush' || action === 'lootPush') {
      const s = await botSession(b, req);
      if (!s) return fail('session', 'Sign in again.', 401);
      if (action === 'logout') { await b.asServiceRole.entities.BotSession.delete(s.id).catch(() => {}); return Response.json({ ok: true }); }
      if (action === 'update') return await update(b, p);
      if (action === 'remotePush') return await remotePush(b, s, p);
      if (action === 'lootPush') return await lootPush(b, s, p);
      bust('blic:' + s.member_id);              // 6.43: a check may lock a license to this PC
      return await check(b, s, p);
    }

    // ---------- the site ----------
    // 6.44: the live view and the device list are asked for every few seconds and each look used to read
    // the member row again. A look reuses the row this copy read a moment ago (the same rule the table
    // games and chat use); anything that changes a license still reads fresh.
    const LOOK = action === 'status' || action === 'describe' || action === 'remoteView' || action === 'lootView';
    const user = await sessionUser(b, req, LOOK ? POLL_REUSE_MS : 0);
    if (!user) throw new UserError('Link your Discord first.', 401);
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.', 401);
    const leader = me.role === 'leader';
    const leaderOnly = () => { if (!leader) throw new UserError('Only the Guild Leader can do that.', 403); };

    // 6.43: anything but a look may change a license: the shared copy of the licenses is dropped first
    if (!['status', 'remoteView', 'lootView', 'describe', 'remoteCommand'].includes(action)) bust('blic:');
    if (action === 'status') return await status(b, me);
    if (action === 'describe') return await describe(b, me, p);
    if (action === 'approve') return await approve(b, me, p);
    if (action === 'resetDevice') return await resetDevice(b, me, p);
    if (action === 'moveDays') return await moveDaysAction(b, me, p);
    if (action === 'renameDevice') return await renameDevice(b, me, p);
    if (action === 'removeDevice') return await removeDevice(b, me, p);
    if (action === 'remoteView') return await remoteView(b, me, p);
    if (action === 'lootView') return await lootView(b, me, p);
    if (action === 'remoteCommand') return await remoteCommand(b, me, p);

    if (action.startsWith('admin')) {
      leaderOnly();
      return await admin(b, me, action, p);
    }
    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}

// ======================================================================= the app

async function start(b, p, req) {
  const hwid = cleanHwid(p.hwid);
  if (!hwid) return fail('bad_request', 'This version of the app is too old or damaged. Download the latest one.');
  const E = b.asServiceRole.entities.BotDevice;
  const hh = await hwHash(hwid);
  // 6.31 spam guard: one connection can't fill the sign-in codes for everyone (see START_PER_IP).
  const ip = clientIp(req), ih = await ipHash(ip);
  if (ih && !memLimit('start:' + ih, START_PER_IP, START_WINDOW_MS)) return fail('busy', 'Too many sign-in tries from your connection. Wait ten minutes and try again.', 429);
  if (ih) {
    // a code expires CODE_TTL_MS after it was made, so 'made in the last START_WINDOW_MS' = expires after this:
    const since = new Date(Date.now() + CODE_TTL_MS - START_WINDOW_MS).toISOString();
    const { items: recent } = await E.filter({ ip_hash: ih, expires_at: { $gt: since } }, { limit: START_PER_IP + 1 });
    if (recent.length >= START_PER_IP) return fail('busy', 'Too many sign-in tries from your connection. Wait ten minutes and try again.', 429);
  }
  // Tidy up: expired codes, and any earlier code this computer asked for.
  try {
    const { items: old } = await E.filter({ expires_at: { $lt: nowIso() } }, { limit: 50 });
    await Promise.all(old.map((x) => E.delete(x.id).catch(() => {})));
    // An earlier code from this computer stops working. 6.31: it is marked replaced rather than deleted, so it
    // still counts toward the connection's limit until it runs out.
    const { items: mine } = await E.filter({ hwid_hash: hh, status: 'pending' }, { limit: 20 });
    await Promise.all(mine.map((x) => E.update(x.id, { status: 'replaced' }).catch(() => {})));
  } catch { /* best effort */ }
  const { items: all } = await E.filter({}, { limit: MAX_PENDING_CODES });
  if (all.length >= MAX_PENDING_CODES) return fail('busy', 'Too many people are signing in right now. Try again in a minute.', 429);

  let code = '';
  for (let i = 0; i < 6 && !code; i++) {
    const c = newUserCode();
    const { items } = await E.filter({ user_code: c }, { limit: 1 });
    if (items.length === 0) code = c;
  }
  if (!code) return fail('busy', 'Try again in a moment.', 429);
  const secretRaw = randomHex(32);
  await E.create({
    device_hash: await sha256Hex(secretRaw), user_code: code, hwid_hash: hh, ip_hash: ih, app_version: text(p.app_version, 24), platform: p.platform === 'android' ? 'android' : 'pc',
    status: 'pending', member_id: '', expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString()
  });
  return Response.json({
    device_secret: secretRaw, user_code: code, device_tag: deviceTag(hh),
    verify_url: `${siteUrl()}/link-app?link=${code}`, expires_in: Math.round(CODE_TTL_MS / 1000), interval: 3
  });
}

async function poll(b, p) {
  const secretRaw = typeof p.device_secret === 'string' && /^[a-f0-9]{64}$/.test(p.device_secret) ? p.device_secret : '';
  if (!secretRaw) return Response.json({ state: 'expired' });
  const E = b.asServiceRole.entities.BotDevice;
  const { items } = await E.filter({ device_hash: await sha256Hex(secretRaw) }, { limit: 1 });
  let row = items[0];
  if (!row) return Response.json({ state: 'expired' });
  if (!(Date.parse(row.expires_at || '') > Date.now())) { await E.delete(row.id).catch(() => {}); return Response.json({ state: 'expired' }); }
  if (row.status === 'replaced') return Response.json({ state: 'expired' });
  if (row.status !== 'approved') return Response.json({ state: 'pending' });

  // Approved: hand over the sign-in once. The lock stops two polls at once from each taking one.
  return await withRecordLock(b, 'BotDevice', row.id, async () => {
    row = await E.get(row.id).catch(() => null);
    if (!row) return Response.json({ state: 'expired' });
    const member = await b.asServiceRole.entities.Member.get(row.member_id).catch(() => null);
    if (!member || member.no_access || member.banned) { await E.delete(row.id).catch(() => {}); return Response.json({ state: 'denied' }); }
    await killBotSessions(b, member.id, row.hwid_hash);    // only the newest sign-in of THIS computer works (6.41: other PCs stay signed in)
    const token = randomHex(32);
    const exp = new Date(Date.now() + BOT_SESSION_DAYS * DAY_MS).toISOString();
    await b.asServiceRole.entities.BotSession.create({ token_hash: await sha256Hex(token), member_id: member.id, hwid_hash: row.hwid_hash, expires_at: exp, last_seen_at: nowIso() });
    await E.delete(row.id);
    await logEvent(b, member, 'login', `device ${deviceTag(row.hwid_hash)} · app ${row.app_version || '?'}`);
    return Response.json({ state: 'ok', token, session_expires_at: exp, name: member.discord_name || '', avatar_url: member.avatar_url || '' });
  });
}

async function check(b, s, p) {
  const hwid = cleanHwid(p.hwid), nonce = cleanNonce(p.nonce);
  if (!hwid || !nonce) return fail('bad_request', 'Update the app.');
  if ((await hwHash(hwid)) !== s.hwid_hash) {
    // A sign-in token that turns up on another computer: it is cancelled for good.
    await b.asServiceRole.entities.BotSession.delete(s.id).catch(() => {});
    return fail('device_mismatch', 'This sign-in belongs to another computer. Sign in again.', 403);
  }
  let member = await b.asServiceRole.entities.Member.get(s.member_id).catch(() => null);
  if (!member) return fail('session', 'Sign in again.', 401);
  const settings = await getSettings(b);
  // Ask Discord again whether they still hold the member role (at most every 10 minutes per member).
  member = await refreshAccess(b, settings, member, !minutesAgo(member.access_checked_at, 10));
  if (!member || member.no_access) { await killBotSessions(b, s.member_id); return fail('not_member', 'You no longer have the guild member role on Discord.', 403); }
  if (member.banned) { await killBotSessions(b, s.member_id); return fail('banned', 'You are banned.', 403); }

  const E = b.asServiceRole.entities;
  if (!minutesAgo(s.last_seen_at, 1)) await E.BotSession.update(s.id, { last_seen_at: nowIso(), expires_at: new Date(Date.now() + BOT_SESSION_DAYS * DAY_MS).toISOString() }).catch(() => {});

  // 6.41: each of the member's devices has its own license. This computer uses the one locked to it, or takes a free
  // one (with days, not locked yet). When every device with days is locked to another PC, it can't run here.
  const who = { name: member.discord_name || '', avatar_url: member.avatar_url || '' };
  let all = await getLicenses(b, member.id);
  if (all.some((l) => l.revoked)) return Response.json({ licensed: false, reason: 'revoked', days_left: 0, expires_at: null, ...who, check_every: CHECK_EVERY_S });
  // 6.47: the phone app says so. The Guild Leader switches the phone Assistant on per member (Admin Hall); the member still needs days.
  const phone = p.platform === 'android';
  const platform = phone ? 'android' : 'pc';
  if (phone && all.length && !mobileOn(member, all)) {
    return Response.json({ licensed: false, reason: 'mobile_off', error: 'The phone Assistant is not switched on for you yet. Ask the Guild Leader to turn it on in the Admin Hall.', days_left: 0, expires_at: null, ...who, check_every: CHECK_EVERY_S });
  }
  let lic = all.find((l) => l.hwid_hash === s.hwid_hash) || null;
  if (!lic && all.some((l) => !l.hwid_hash && licenseState(l).active)) {
    await withMemberLock(b, member.id, async () => {
      all = await getLicenses(b, member.id);
      lic = all.find((l) => l.hwid_hash === s.hwid_hash) || null;
      const free = lic ? null : all.find((l) => !l.hwid_hash && licenseState(l).active);
      if (free) {
        await E.BotLicense.update(free.id, { hwid_hash: s.hwid_hash, hwid_bound_at: nowIso(), platform });
        await logEvent(b, member, 'bind', `device ${seatOf(free)} · ${phone ? 'phone' : 'PC'} ${deviceTag(s.hwid_hash)}`);
        lic = { ...free, hwid_hash: s.hwid_hash, platform };
      }
    });
  }
  if (!lic) {
    const live = all.filter((l) => licenseState(l).active);
    if (!live.length) {
      const best = memberSummary(all);
      return Response.json({ licensed: false, reason: best.reason || 'no_license', days_left: 0, expires_at: best.expires_at, ...who, check_every: CHECK_EVERY_S });
    }
    return Response.json({ licensed: false, reason: 'other_device', days_left: live[0] ? licenseState(live[0]).days_left : 0, expires_at: live[0].expires_at, device_tag: live.map((l) => deviceTag(l.hwid_hash)).join(', '), devices: all.length, max_devices: MAX_SEATS, ...who, check_every: CHECK_EVERY_S });
  }
  const st = licenseState(lic);
  if (!st.active) return Response.json({ licensed: false, reason: st.reason, days_left: 0, expires_at: lic.expires_at || null, device: seatOf(lic), ...who, check_every: CHECK_EVERY_S });
  if (!minutesAgo(lic.last_seen_at, 5) || (lic.platform || 'pc') !== platform) await E.BotLicense.update(lic.id, { last_seen_at: nowIso(), platform }).catch(() => {});

  const now = Math.floor(Date.now() / 1000);
  const exp = Math.floor(Date.parse(lic.expires_at) / 1000);
  const ticket = await signTicket({
    v: 1, mid: member.id, did: String(member.discord_id || ''), hw: hwid, n: nonce, sid: s.id,
    iat: now, ttl: Math.max(30, Math.min(TICKET_TTL_S, exp - now)), exp
  });
  return Response.json({ licensed: true, reason: '', days_left: st.days_left, expires_at: lic.expires_at, device: seatOf(lic), device_name: seatName(lic), ...who, ticket, check_every: CHECK_EVERY_S });
}

// The newest active release that is newer than the app's own version. The app verifies the
// signature itself, so a changed link or hash here would only make the update fail, never run.
const VER = /^\d+\.\d+\.\d+$/;
const verKey = (v: string) => String(v).split('.').map((n) => Number(n) || 0);
export const verCmp = (a: string, b: string) => {
  const x = verKey(a), y = verKey(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
async function update(b, p) {
  const cur = String(p.version || '');
  if (!VER.test(cur)) return fail('bad_request', 'Bad version.');
  const { items } = await b.asServiceRole.entities.BotRelease.filter({ active: true }, { limit: 200 });
  const newer = items.filter((r) => VER.test(r.version) && verCmp(r.version, cur) > 0).sort((a, c) => verCmp(c.version, a.version));
  if (!newer.length) return Response.json({ update_available: false });
  const r = newer[0];
  // Mandatory if any release between here and the newest one is mandatory.
  const mandatory = newer.some((x) => !!x.mandatory);
  return Response.json({
    update_available: true, version: r.version, notes: r.notes || '', url: r.file_url, sha256: r.sha256,
    size: r.size, sig: r.sig, mandatory
  });
}

// ======================================================================= remote control
// The member's own app reports what it is doing (and, while the member watches, a small picture of the game); the member's
// remote page shows it and queues commands from a fixed list. The app only ever acts on commands from that list, for its own
// member, on the PC the license is locked to, and only within a minute of the click. The site can never move the mouse or type.

// 6.37: upgrade and enhance taken off the site (the app may still know them; the site never sends them).
const REMOTE_CMDS = ['start', 'stop', 'return_town'];
const CMD_TTL_MS = 60_000, WATCH_MS = 20_000, ONLINE_MS = 25_000, PIC_MAX = 400_000;

// 6.43: the database allows the whole site ~210 list reads a minute (every function shares the service account). The live view and the
// app's reports ask every few seconds, so their read-only lookups are shared for a few seconds: the member's licenses (10 s, dropped at
// once when this copy changes them) and the command history shown on the page (5 s). Commands handed to the app are always read fresh.
const LIC_MS = 10_000, CMD_VIEW_MS = 5_000;
const licensesSoon = (b, memberId: string) => memo('blic:' + memberId, LIC_MS, () => getLicenses(b, memberId));
// 6.37: the picture is taken as JPEG, PNG or WebP, plain base64 or a data: address, line breaks allowed, up to
// ~300 KB. What happened to the last one is kept in picture_note, so the page can say why none shows.
function readPicture(v): { b64?: string; type?: string; note: string } {
  if (v === undefined || v === null || v === '') return { note: 'no picture in the report' };
  if (typeof v !== 'string') return { note: `picture was a ${Array.isArray(v) ? 'list' : typeof v}, not text` };
  let t = v.trim();
  const m = /^data:image\/[a-z]+;base64,/i.exec(t);
  if (m) t = t.slice(m[0].length);
  t = t.replace(/\s+/g, '');
  if (t.length > PIC_MAX) return { note: `picture too big (${Math.round(t.length * 3 / 4 / 1024)} KB, the limit is ${Math.round(PIC_MAX * 3 / 4 / 1024)} KB)` };
  if (!/^[A-Za-z0-9+/]+=*$/.test(t)) return { note: `picture is not base64 (starts with "${text(v, 16)}")` };
  const type = t.startsWith('/9j/') ? 'jpeg' : t.startsWith('iVBOR') ? 'png' : t.startsWith('UklGR') ? 'webp' : '';
  if (!type) return { note: `picture is not a JPEG, PNG or WebP (starts with "${t.slice(0, 8)}")` };
  return { b64: t, type, note: '' };
}
const cleanLine = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);

// 6.41: one remote row per device of the member (rows from before have no seat: device 1)
async function remoteRow(b, memberId: string, seat = 1) {
  const { items } = await b.asServiceRole.entities.BotRemote.filter({ member_id: memberId }, { limit: 20 });
  return items.find((r) => seatOf(r) === seat) || null;
}

function cleanArgs(cmd: string, a) {
  a = a && typeof a === 'object' ? a : {};
  if (cmd === 'start') {
    const dungeon = a.dungeon === 'den' ? 'den' : a.dungeon === 'attack' ? 'attack' : 'labyrinth';     // 6.47: attack = auto attack (phone)
    const runs = Number.isInteger(Number(a.runs)) ? Math.max(0, Math.min(999, Number(a.runs))) : 1;
    const startBoss = Number.isInteger(Number(a.start_boss)) ? Math.max(1, Math.min(5, Number(a.start_boss))) : 1;
    return { dungeon, runs, start_boss: startBoss };
  }
  return {};
}

// 6.40: the database refuses one field as big as a game picture ("Field 'picture' exceeds the maximum allowed size",
// seen live at 26 KB). So the picture is kept in pieces (pic_0 .. pic_15), each small enough; the piece size that
// works is learned and remembered. If even small pieces are refused, the picture is uploaded as a file instead (what
// the platform suggests) and only its address is kept. Each new picture replaces the last one.
const PIC_PARTS = 16;
const PART_KEYS = Array.from({ length: PIC_PARTS }, (_, i) => `pic_${i}`);
const PART_SIZES = [12_000, 6_000, 3_000];
let partSize = PART_SIZES[0];
const NO_PICTURE: Record<string, any> = { picture: '', picture_url: '', parts: 0, ...Object.fromEntries(PART_KEYS.map((k) => [k, ''])) };
const hasPicture = (r) => !!(r && (r.picture || r.picture_url || r.parts));
const sizeRefused = (e) => /maximum allowed size|too large|exceeds|payload/i.test(String((e && (e as any).message) || e));
async function storePicture(b, row, b64: string, type: string, iso: string) {
  const E = b.asServiceRole.entities;
  let lastErr = '';
  for (const size of PART_SIZES.filter((x) => x <= partSize)) {
    const n = Math.ceil(b64.length / size);
    if (n > PIC_PARTS) break;                              // smaller pieces would only need more of them
    const fields: Record<string, any> = { ...NO_PICTURE, parts: n, picture_type: type, picture_at: iso, picture_note: '' };
    for (let i = 0; i < n; i++) fields[PART_KEYS[i]] = b64.slice(i * size, (i + 1) * size);
    try { await E.BotRemote.update(row.id, fields); partSize = size; return; }
    catch (e) {
      lastErr = text(String((e && (e as any).message) || e), 140);
      if (!sizeRefused(e)) break;
      console.log('remotePush: pieces of', size, 'refused:', lastErr);
    }
  }
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const res: any = await b.asServiceRole.integrations.Core.UploadFile({ file: new File([bytes], `remote-${row.member_id}-${Date.now()}.${type === 'jpeg' ? 'jpg' : type}`, { type: 'image/' + type }) });
    const url = String((res && (res.file_url || (res.data && res.data.file_url))) || '');
    if (!/^https:\/\//.test(url)) throw new Error('the upload gave no address');
    await E.BotRemote.update(row.id, { ...NO_PICTURE, picture_url: url, picture_type: type, picture_at: iso, picture_note: '' });
  } catch (e) {
    const why = text(String((e && (e as any).message) || e), 120);
    console.log('remotePush: picture not stored', b64.length, lastErr, why);
    await E.BotRemote.update(row.id, { picture_note: `the site could not store the picture (${Math.round(b64.length * 3 / 4 / 1024)} KB): ${lastErr || why}` }).catch(() => {});
  }
}

async function remotePush(b, s, p) {
  const E = b.asServiceRole.entities;
  const lic = (await licensesSoon(b, s.member_id)).find((l) => l.hwid_hash === s.hwid_hash) || null;
  const st = licenseState(lic);
  // only a PC a license is locked to, with days left, can be controlled
  if (!st.active || !lic || lic.revoked) return Response.json({ ok: true, allowed: false, watching: false, commands: [] });
  const seat = seatOf(lic);

  const now = Date.now(), iso = new Date(now).toISOString();
  let row = await remoteRow(b, s.member_id, seat);
  const patch: any = { updated_at: iso };
  if (p.state && typeof p.state === 'object') { const js = JSON.stringify(p.state); if (js.length <= 4000) patch.state = js; }
  if (Array.isArray(p.log)) patch.log = p.log.slice(-20).map(cleanLine).join('\n');
  const watching = !!(row && Date.parse(row.watch_until || '') > now);
  let pic: { b64?: string; type?: string; note: string } = { note: '' };
  if (watching) {
    pic = readPicture(p.picture ?? p.image ?? p.screenshot);
    // 6.38: an app that could not make its picture says why (picture_error); that reason is shown instead
    const appWhy = typeof p.picture_error === 'string' && p.picture_error ? 'the app could not take the picture: ' + text(p.picture_error, 160) : '';
    if (!pic.b64 && !(row && Date.parse(row.picture_at || '') > now - 15_000)) patch.picture_note = appWhy || pic.note;   // only while no fresh picture
  }
  if (!watching && row && hasPicture(row)) Object.assign(patch, NO_PICTURE);   // nobody watches: the picture is not kept
  // the report itself (state, log) is saved first, on its own, so a picture problem can never lose it
  if (row) await E.BotRemote.update(row.id, patch); else row = await E.BotRemote.create({ member_id: s.member_id, seat, ...patch });
  if (pic.b64) await storePicture(b, row, pic.b64, pic.type || 'jpeg', iso);

  // what the app did with earlier commands
  if (Array.isArray(p.results)) {
    for (const r of p.results.slice(0, 10)) {
      const c = r && r.id ? await E.BotCommand.get(String(r.id)).catch(() => null) : null;
      if (c && c.member_id === s.member_id && c.status === 'taken') await E.BotCommand.update(c.id, { status: r.ok ? 'done' : 'failed', result: text(r.message, 200) });
    }
  }
  // new commands: each one is handed out once, and only while it is fresh
  const { items: pend } = await E.BotCommand.filter({ member_id: s.member_id, status: 'pending' }, { limit: 40 });
  const items = pend.filter((c) => seatOf(c) === seat);         // only this device's commands
  const out = [];
  for (const c of items.sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at))) {
    if (!(Date.parse(c.expires_at || '') > now)) { await E.BotCommand.update(c.id, { status: 'expired' }).catch(() => {}); continue; }
    await E.BotCommand.update(c.id, { status: 'taken' });
    let args = {}; try { args = JSON.parse(c.args || '{}'); } catch { args = {}; }
    out.push({ id: c.id, cmd: c.cmd, args: cleanArgs(c.cmd, args), age_s: Math.max(0, Math.round((now - Date.parse(c.created_at)) / 1000)) });
  }
  return Response.json({ ok: true, allowed: true, watching: watching || out.length > 0, commands: out });
}

// ---------- 6.42: what the app looted ----------
const LOOT_PER_PUSH = 40, LOOT_PUSH_PER_MIN = 20, LOOT_KEEP = 5000;
const cleanItem = (v) => text(String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ''), 60) || 'Unknown item';

// The app reports the items it picked up (after each boss). `batch` is the app's id for the report: sent again (a retry
// after a lost answer), it is not counted twice.
async function lootPush(b, s, p) {
  const E = b.asServiceRole.entities;
  if (!memLimit('loot:' + s.member_id, LOOT_PUSH_PER_MIN, 60000)) return fail('busy', 'Slow down: try again in a minute.', 429);
  const lic = (await licensesSoon(b, s.member_id)).find((l) => l.hwid_hash === s.hwid_hash) || null;
  if (!lic || !licenseState(lic).active) return Response.json({ ok: true, saved: 0 });
  const seat = seatOf(lic);
  const batch = text(p.batch, 40);
  if (batch) {
    const { items: seen } = await E.BotLoot.filter({ member_id: s.member_id, batch }, { limit: 1 });
    if (seen.length) return Response.json({ ok: true, saved: 0, duplicate: true });
  }
  const now = Date.now();
  const list = Array.isArray(p.items) ? p.items.slice(0, LOOT_PER_PUSH) : [];
  let saved = 0;
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const at = Date.parse(x.at || '');
    await E.BotLoot.create({
      member_id: s.member_id, seat, name: cleanItem(x.name),
      qty: Math.max(1, Math.min(999, Math.round(Number(x.qty) || 1))),
      dungeon: x.dungeon === 'den' ? 'den' : 'labyrinth',
      boss: Math.max(0, Math.min(6, Math.round(Number(x.boss) || 0))),
      at: new Date(at > now - 3 * 86400_000 && at <= now + 60_000 ? at : now).toISOString(),
      batch
    });
    saved++;
  }
  return Response.json({ ok: true, saved });
}

// The member's loot: totals per item, today / 7 days / ever, and the latest pick-ups (all devices, or one).
async function lootView(b, me, p) {
  const E = b.asServiceRole.entities;
  const { items: all } = await E.BotLoot.filter({ member_id: me.id }, { sort: '-at', limit: LOOT_KEEP });
  const seat = Math.round(Number(p && p.seat) || 0);
  const rows = seat ? all.filter((r) => seatOf(r) === seat) : all;
  const now = Date.now(), dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const sum = (l) => l.reduce((a, r) => a + (Number(r.qty) || 1), 0);
  const t = (r) => Date.parse(r.at || '') || 0;
  const by = new Map();
  for (const r of rows) {
    const k = r.name || 'Unknown item';
    const e = by.get(k) || { name: k, qty: 0, last_at: '' };
    e.qty += Number(r.qty) || 1;
    if (!e.last_at || t(r) > Date.parse(e.last_at)) e.last_at = r.at;
    by.set(k, e);
  }
  return Response.json({
    ok: true,
    total: sum(rows),
    today: sum(rows.filter((r) => t(r) >= dayStart.getTime())),
    week: sum(rows.filter((r) => t(r) >= now - 7 * 86400_000)),
    kinds: by.size,
    items: [...by.values()].sort((a, c) => c.qty - a.qty || a.name.localeCompare(c.name)).slice(0, 50),
    recent: rows.slice(0, 25).map((r) => ({ name: r.name, qty: Number(r.qty) || 1, at: r.at, dungeon: r.dungeon, boss: Number(r.boss) || 0, seat: seatOf(r) })),
    seats: [...new Set(all.map(seatOf))].sort((a, c) => a - c)
  });
}

async function remoteView(b, me, p) {
  const E = b.asServiceRole.entities;
  const now = Date.now();
  // 6.41: which device to watch: the one asked for, else the first one that is online, else device 1
  const all = await licensesSoon(b, me.id);
  const { items: rows } = await E.BotRemote.filter({ member_id: me.id }, { limit: 20 });
  const onlineSeat = (n) => rows.some((r) => seatOf(r) === n && Date.parse(r.updated_at || '') > now - ONLINE_MS);
  const asked = Math.round(Number(p && p.seat) || 0);
  const seat = all.some((l) => seatOf(l) === asked) ? asked : (all.map(seatOf).find(onlineSeat) || (all[0] ? seatOf(all[0]) : 1));
  let row = rows.find((r) => seatOf(r) === seat) || null;
  const watch = new Date(now + WATCH_MS).toISOString();
  // 6.43: written only when less than 12 s of the watch is left (not on every look)
  if (!row) row = await E.BotRemote.create({ member_id: me.id, seat, watch_until: watch });
  else if (!(Date.parse(row.watch_until || '') > now + WATCH_MS - 8_000)) await E.BotRemote.update(row.id, { watch_until: watch });
  const lic = all.find((l) => seatOf(l) === seat) || null;
  const st = licenseState(lic);
  let state = null; try { state = row.state ? JSON.parse(row.state) : null; } catch { state = null; }
  const online = Date.parse(row.updated_at || '') > now - ONLINE_MS;
  const picData = row.parts ? PART_KEYS.slice(0, row.parts).map((k) => row[k] || '').join('') : (row.picture || '');
  const picFresh = !!(picData || row.picture_url) && Date.parse(row.picture_at || '') > now - 60_000;
  const cmds = await memo('bcmdv:' + me.id, CMD_VIEW_MS, async () => (await E.BotCommand.filter({ member_id: me.id }, { sort: '-created_date', limit: 40 })).items);
  const items = cmds.filter((c) => seatOf(c) === seat).slice(0, 8);
  return Response.json({
    // 6.47: platform: what the device is locked to (pc or android); a phone also says so in its reports
    seat, platform: (state && state.platform === 'android') || (lic && lic.platform === 'android') ? 'android' : 'pc',
    devices: all.map((l) => ({ seat: seatOf(l), label: seatName(l), device_tag: l.hwid_hash ? deviceTag(l.hwid_hash) : '', active: licenseState(l).active, online: onlineSeat(seatOf(l)), platform: l.hwid_hash ? (l.platform === 'android' ? 'android' : 'pc') : '' })),
    licensed: st.active, device_bound: !!(lic && lic.hwid_hash), online, updated_at: row.updated_at || null,
    state: online ? state : null, log: online ? (row.log || '') : '', picture: online && picFresh && picData ? picData : null, picture_url: online && picFresh && !picData ? row.picture_url || null : null, picture_at: picFresh ? row.picture_at : null,
    picture_type: picFresh ? (row.picture_type || 'jpeg') : null, picture_note: online && !picFresh ? (row.picture_note || 'waiting for the first picture') : '',
    commands: items.map((c) => ({ id: c.id, cmd: c.cmd, status: c.status === 'pending' && !(Date.parse(c.expires_at || '') > now) ? 'expired' : c.status, result: c.result || '', created_at: c.created_at }))
  });
}

async function remoteCommand(b, me, p) {
  const E = b.asServiceRole.entities;
  const cmd = String(p.cmd || '');
  if (!REMOTE_CMDS.includes(cmd)) throw new UserError('That is not a command the Assistant knows.');
  const seat = Math.round(Number(p.seat) || 1);
  const lic = await getLicense(b, me.id, seat);
  if (!licenseState(lic).active) throw new UserError('That device has no Assistant days left.', 403);
  if (!lic.hwid_hash) throw new UserError('That device has not been signed in on a PC yet.', 409);
  const row = await remoteRow(b, me.id, seat);
  if (!row || !(Date.parse(row.updated_at || '') > Date.now() - ONLINE_MS)) throw new UserError('Your Assistant is not online. Open the program on your PC (signed in) and try again.', 409);
  return await withMemberLock(b, me.id, async () => {
    const { items } = await E.BotCommand.filter({ member_id: me.id, status: 'pending' }, { limit: 40 });
    const fresh = items.filter((c) => seatOf(c) === seat && Date.parse(c.expires_at || '') > Date.now());
    if (fresh.length >= 3) throw new UserError('Your Assistant has not picked up the last commands yet - wait a moment.', 429);
    const now = Date.now();
    const c = await E.BotCommand.create({
      member_id: me.id, seat, cmd, args: JSON.stringify(cleanArgs(cmd, p.args)), status: 'pending',
      created_at: new Date(now).toISOString(), expires_at: new Date(now + CMD_TTL_MS).toISOString()
    });
    bust('bcmdv:' + me.id);
    return Response.json({ ok: true, id: c.id });
  });
}

// ======================================================================= the site

async function status(b, me) {
  const all = await getLicenses(b, me.id);
  const { items: sess } = await b.asServiceRole.entities.BotSession.filter({ member_id: me.id }, { limit: 20 });
  const onlineHw = new Set(sess.filter((x) => minutesAgo(x.last_seen_at, 5)).map((x) => x.hwid_hash));
  const shop = await memo('bshop', 30_000, async () => (await b.asServiceRole.entities.ShopItem.filter({ active: true }, { sort: 'sort', limit: 300 })).items);
  const now = Date.now();
  const devices = all.map((l) => {
    return {
      ...licenseSummary(l), online: !!(l.hwid_hash && onlineHw.has(l.hwid_hash)),
      whole_days: Math.max(0, Math.floor((Date.parse(l.expires_at || '') - now) / DAY_MS)),
      // 6.46: no waiting period - a device locked to a PC can be moved whenever the member wants
      can_reset: !!l.hwid_hash, next_reset_at: null
    };
  });
  const sum = memberSummary(all);
  return Response.json({
    // 6.41: `license` is the member as a whole (best device); `devices` lists each device with its own days
    license: sum, devices, max_devices: MAX_SEATS, app_online: devices.some((d) => d.online),
    mobile_allowed: mobileOn(me, all),       // 6.47: the Guild Leader switched the phone Assistant on for this member
    can_reset: devices.some((d) => d.can_reset), next_reset_at: null,
    shop_items: shop.filter((it) => (it.bot_days || 0) > 0).map((it) => ({ id: it.id, name: it.name, days: it.bot_days }))
  });
}

// A member who keeps guessing sign-in codes is stopped for a while.
async function tooManyBadCodes(b, me) {
  const { items } = await b.asServiceRole.entities.BotEvent.filter({ member_id: me.id, kind: 'bad_code' }, { sort: '-created_date', limit: 10 });
  return items.filter((x) => minutesAgo(x.at, 10)).length >= 8;
}
async function findPending(b, me, p) {
  if (await tooManyBadCodes(b, me)) throw new UserError('Too many wrong codes. Wait ten minutes and try again.', 429);
  const code = normCode(p.code);
  const E = b.asServiceRole.entities.BotDevice;
  const row = code ? (await E.filter({ user_code: code }, { limit: 1 })).items[0] : null;
  if (!row || row.status !== 'pending' || !(Date.parse(row.expires_at || '') > Date.now())) {
    await logEvent(b, me, 'bad_code', code || 'malformed');
    throw new UserError('That code is wrong or has run out. Press Sign in again in the app to get a new one.', 404);
  }
  return row;
}

async function describe(b, me, p) {
  const row = await findPending(b, me, p);
  const all = await getLicenses(b, me.id);
  const mine = all.find((l) => l.hwid_hash === row.hwid_hash);
  const free = all.find((l) => !l.hwid_hash && licenseState(l).active);
  return Response.json({
    code: row.user_code, device_tag: deviceTag(row.hwid_hash), app_version: row.app_version || '',
    platform: row.platform === 'android' ? 'android' : 'pc',
    // 6.47: a phone asking while the Guild Leader hasn't switched the phone Assistant on for this member
    mobile_off: row.platform === 'android' && all.length > 0 && !mobileOn(me, all),
    // 6.41: this PC already has its device, or will take a free one; otherwise every device with days is locked elsewhere
    device: mine ? seatName(mine) : free ? seatName(free) : '',
    other_device: !mine && !free && all.some((l) => licenseState(l).active),
    license: memberSummary(all)
  });
}

async function approve(b, me, p) {
  if (me.banned) throw new UserError('You are banned.', 403);
  const row = await findPending(b, me, p);
  // Look at Discord right now: only someone who still holds the member role can sign the app in.
  const settings = await getSettings(b);
  const fresh = await refreshAccess(b, settings, me, true);
  if (!fresh || fresh.no_access) throw new UserError('You no longer have the guild member role on Discord.', 403);
  if (p.deviceTag && String(p.deviceTag).toUpperCase() !== deviceTag(row.hwid_hash)) {
    throw new UserError('The device ID does not match the one the app shows. Check the code and try again.', 409);
  }
  await withRecordLock(b, 'BotDevice', row.id, async () => {
    const again = await b.asServiceRole.entities.BotDevice.get(row.id).catch(() => null);
    if (!again || again.status !== 'pending') throw new UserError('That code was already used.', 409);
    await b.asServiceRole.entities.BotDevice.update(row.id, { status: 'approved', member_id: me.id });
  });
  await logEvent(b, me, 'approve', `device ${deviceTag(row.hwid_hash)}`);
  return Response.json({ ok: true });
}

async function resetDevice(b, me, p) {
  const seat = Math.round(Number(p && p.seat) || 1);
  return await withMemberLock(b, me.id, async () => {
    const lic = await getLicense(b, me.id, seat);
    if (!lic || !lic.hwid_hash) throw new UserError('That device is not locked to a computer yet.');
    // 6.46: a device may move to another computer at any time - there is no waiting period. Moving it still
    // signs the old PC out and frees the device for the next PC that signs in.
    await b.asServiceRole.entities.BotLicense.update(lic.id, { hwid_hash: '', hwid_resets: (lic.hwid_resets || 0) + 1, hwid_reset_at: nowIso() });
    await killBotSessions(b, me.id, lic.hwid_hash);
    await logEvent(b, me, 'reset', `device ${seat} · was PC ${deviceTag(lic.hwid_hash)}`);
    return Response.json({ ok: true });
  });
}

// 6.41: divide days between devices: move whole days from one device to another, or to a new device
async function moveDaysAction(b, me, p) {
  if (me.banned) throw new UserError('You are banned.', 403);
  const to = p.to === 'new' ? 'new' : Math.round(Number(p.to) || 0);
  const r = await withMemberLock(b, me.id, () => moveDays(b, me, Math.round(Number(p.from) || 0), to, Number(p.days)));
  return Response.json({ ok: true, from: licenseSummary(r.from), to: licenseSummary(r.to) });
}
async function renameDevice(b, me, p) {
  const lic = await getLicense(b, me.id, Math.round(Number(p.seat) || 1));
  if (!lic) throw new UserError('That device does not exist.', 404);
  const label = text(p.label, 24).replace(/[<>]/g, '');
  await b.asServiceRole.entities.BotLicense.update(lic.id, { label });
  return Response.json({ ok: true, label: label || `Device ${seatOf(lic)}` });
}
// A device with no days left (and not device 1) can be taken off the list.
async function removeDevice(b, me, p) {
  const seat = Math.round(Number(p.seat) || 0);
  if (seat <= 1) throw new UserError('Device 1 stays on your list.');
  return await withMemberLock(b, me.id, async () => {
    const lic = await getLicense(b, me.id, seat);
    if (!lic) throw new UserError('That device does not exist.', 404);
    if (Math.floor((Date.parse(lic.expires_at || '') - Date.now()) / DAY_MS) >= 1) throw new UserError('Move its days to another device first.');
    if (lic.hwid_hash) await killBotSessions(b, me.id, lic.hwid_hash);
    await b.asServiceRole.entities.BotLicense.delete(lic.id);
    await logEvent(b, me, 'remove_device', `device ${seat}`);
    return Response.json({ ok: true });
  });
}

// ======================================================================= the Guild Leader

async function admin(b, me, action: string, p) {
  const E = b.asServiceRole.entities;
  if (action === 'adminList') {
    const { items } = await E.BotLicense.filter({}, { sort: '-expires_at', limit: 500 });
    const { items: sess } = await E.BotSession.filter({}, { limit: 500 });
    const online = new Set(sess.filter((x) => minutesAgo(x.last_seen_at, 5)).map((x) => `${x.member_id}|${x.hwid_hash}`));
    const { items: events } = await E.BotEvent.filter({}, { sort: '-created_date', limit: 40 });
    // 6.47: everyone the phone Assistant is switched on for (with or without a license yet)
    const { items: phones } = await E.Member.filter({ assistant_mobile: true }, { limit: 500 });
    const phoneIds = new Set([...phones.map((m) => String(m.discord_id || '')), ...items.filter((l) => l.mobile).map((l) => String(l.discord_id || ''))]);
    return Response.json({
      phone_members: phones.map((m) => ({ member_id: m.id, discord_id: String(m.discord_id || ''), name: m.discord_name || '' })),
      phone_ids: [...phoneIds].filter(Boolean),
      // 6.41: one line per device
      licenses: items.map((l) => ({ member_id: l.member_id, discord_id: l.discord_id, member_name: l.member_name, online: !!l.hwid_hash && online.has(`${l.member_id}|${l.hwid_hash}`), hwid_resets: l.hwid_resets || 0, ...licenseSummary(l) }))
        .sort((a, c) => String(a.member_name).localeCompare(String(c.member_name)) || a.seat - c.seat),
      events: events.map((e) => ({ id: e.id, at: e.at, kind: e.kind, discord_id: e.discord_id, detail: e.detail }))
    });
  }
  if (action === 'adminReleases') {
    const { items } = await E.BotRelease.filter({}, { limit: 100 });
    items.sort((a, c) => verCmp(c.version, a.version));
    return Response.json({ releases: items.map((r) => ({ id: r.id, version: r.version, notes: r.notes, file_url: r.file_url, size: r.size, mandatory: !!r.mandatory, active: !!r.active, at: r.at })) });
  }
  if (action === 'adminRelease') {
    const version = String(p.version || '').trim();
    const url = String(p.url || '').trim();
    const sha = String(p.sha256 || '').trim().toLowerCase();
    const size = Number(p.size);
    if (!VER.test(version)) throw new UserError('Version must look like 4.2.0.');
    if (!/^https:\/\/[^\s]{4,500}$/.test(url)) throw new UserError('The download link must be a direct https:// link.');
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new UserError('Pick the update zip so its checksum can be calculated.');
    if (!Number.isInteger(size) || size < 1 || size > 500 * 1024 * 1024) throw new UserError('The file size is not valid (1 byte to 500 MB).');
    const { items: have } = await E.BotRelease.filter({ version }, { limit: 1 });
    if (have.length) throw new UserError(`Version ${version} is already published. Use a new version number.`);
    const sig = await signText(`IBU1|${version}|${sha}|${size}`);
    const row = await E.BotRelease.create({ version, notes: text(p.notes, 1000), file_url: url, sha256: sha, size, sig, mandatory: !!p.mandatory, active: true, published_by: me.id, at: nowIso() });
    await logEvent(b, me, 'release', `${version} · ${size} bytes${p.mandatory ? ' · mandatory' : ''}`);
    return Response.json({ ok: true, id: row.id });
  }
  if (action === 'adminReleaseToggle') {
    const r = await E.BotRelease.get(String(p.id || '')).catch(() => null);
    if (!r) throw new UserError('Release not found.', 404);
    await E.BotRelease.update(r.id, { active: !!p.active });
    await logEvent(b, me, 'release', `${r.version} ${p.active ? 'offered again' : 'withdrawn'}`);
    return Response.json({ ok: true });
  }
  // 6.31: give (or take) days to several members at once, or to every member with access. Each member is
  // done on their own, under their own lock; one that can't take the days (switched off, over the 730-day
  // limit) is skipped and reported, the rest still get theirs.
  if (action === 'adminGrantMany') {
    const days = Number(p.days);
    if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 3650) throw new UserError('Days must be a whole number between -3650 and 3650 (not 0).');
    let targets = [];
    if (p.everyone === true) {
      targets = await rankedMembers(b, 500, ['id', 'discord_id', 'discord_name', 'role']);
    } else {
      const ids = [...new Set((Array.isArray(p.discordIds) ? p.discordIds : []).map((x) => String(x || '').trim()).filter((x) => /^\d{5,25}$/.test(x)))];
      if (!ids.length) throw new UserError('Pick at least one member.');
      if (ids.length > 200) throw new UserError('Pick at most 200 members at a time (or use Everyone).');
      for (const id of ids) { const m = await getMemberByDiscordId(b, id); if (m && !m.banned) targets.push(m); }
    }
    if (!targets.length) throw new UserError('Nobody to give days to.');
    const note = text(p.note, 100);
    const done = [], skipped = [];
    for (const t of targets) {
      try {
        await withMemberLock(b, t.id, () => grantDays(b, t, days, p.everyone === true ? 'grant_all' : 'grant', me.id, note));
        done.push(t.discord_name || t.discord_id);
      } catch (e) {
        skipped.push({ name: t.discord_name || t.discord_id, why: e instanceof UserError ? e.message : 'failed' });
      }
    }
    await logEvent(b, me, 'grant_many', `${days} days · ${done.length} given, ${skipped.length} skipped${note ? ' · ' + note : ''}`);
    return Response.json({ ok: true, days, given: done.length, skipped, names: done.slice(0, 50) });
  }
  // How many members "Everyone" would reach (shown before the leader confirms).
  if (action === 'adminCountAll') {
    const all = await rankedMembers(b, 500, ['id']);
    return Response.json({ ok: true, count: all.length });
  }

  const target = p.discordId ? await getMemberByDiscordId(b, String(p.discordId)) : null;
  if (!target) throw new UserError('No member with that Discord ID.', 404);

  // 6.47: the phone Assistant, on or off for this member (no license needed yet: they still buy days). Off signs their phones out.
  if (action === 'adminMobile') {
    const on = p.on === true;
    await withMemberLock(b, target.id, async () => {
      await E.Member.update(target.id, { assistant_mobile: on });
      const all = await getLicenses(b, target.id);
      for (const l of all) await E.BotLicense.update(l.id, { mobile: on });
      if (!on) for (const l of all) if (l.hwid_hash && l.platform === 'android') await killBotSessions(b, target.id, l.hwid_hash);
      await logEvent(b, target, 'mobile', `phone Assistant ${on ? 'on' : 'off'} · by ${me.id}`);
    });
    return Response.json({ ok: true, mobile: on });
  }
  if (action === 'adminGrant') {
    const days = Number(p.days);
    if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 3650) throw new UserError('Days must be a whole number between -3650 and 3650 (not 0).');
    const seat = p.seat === 'new' ? 'new' : Math.round(Number(p.seat) || 1);
    const { license } = await withMemberLock(b, target.id, () => grantDays(b, target, days, 'grant', me.id, text(p.note, 100), seat));
    return Response.json({ ok: true, license: licenseSummary(license) });
  }
  const all = await getLicenses(b, target.id);
  const lic = all[0] || null;
  if (!lic) throw new UserError('That member has no Assistant license.', 404);
  if (action === 'adminRevoke') {
    await withMemberLock(b, target.id, async () => {
      for (const l of all) await E.BotLicense.update(l.id, { revoked: true, revoked_reason: text(p.reason, 200) });
      await killBotSessions(b, target.id);
      await logEvent(b, target, 'revoke', `${text(p.reason, 100)} · by ${me.id}`);
    });
    return Response.json({ ok: true });
  }
  if (action === 'adminRestore') {
    for (const l of all) await E.BotLicense.update(l.id, { revoked: false, revoked_reason: '' });
    await logEvent(b, target, 'restore', `by ${me.id}`);
    return Response.json({ ok: true });
  }
  if (action === 'adminReset') {
    // 6.41: one device (seat), or all of them when none is named
    const seat = p.seat ? Math.round(Number(p.seat)) : 0;
    await withMemberLock(b, target.id, async () => {
      for (const l of all) {
        if (seat && seatOf(l) !== seat) continue;
        await E.BotLicense.update(l.id, { hwid_hash: '', hwid_resets: (l.hwid_resets || 0) + 1 });
        if (l.hwid_hash) await killBotSessions(b, target.id, l.hwid_hash);
      }
      await logEvent(b, target, 'reset', `${seat ? 'device ' + seat : 'all devices'} · by leader ${me.id}`);
    });
    return Response.json({ ok: true });
  }
  throw new UserError('Unknown action.');
}

// ---------- 6.49: the phone app's updates ----------
// The app asks which build the site offers: the file the leader linked in Admin (App download link), read from the file itself
// (build number, version, checksum, size). A file replaced behind the same link is read again after 20 minutes. Nothing about a
// member is needed or given. The app still also looks at /app/introboys-android.json and takes the newer of the two.
const APP_PACKAGE = 'com.blacklistintroboys.guild';
const APP_REREAD_MS = 20 * 60000;
let appReading: Promise<void> | null = null;

async function appUpdate(b) {
  let s = await getSettings(b);
  const url = String(s.app_download_url || '');
  if (!url) return Response.json({ ok: true, offered: false });
  const stale = s.app_meta_url !== url || !s.app_sha256 || Date.now() - Date.parse(s.app_meta_at || '') > APP_REREAD_MS;
  if (stale && !(s.app_meta_url === url && s.app_meta_error && Date.now() - Date.parse(s.app_meta_at || '') < APP_REREAD_MS)) {
    appReading ??= (async () => {
      const at = new Date().toISOString();
      try {
        const a = await readApkFromUrl(url);
        await b.asServiceRole.entities.Settings.update(s.id, { app_meta_url: url, app_package: a.package, app_version_code: a.versionCode,
          app_version_name: a.versionName, app_sha256: a.sha256, app_size: a.size, app_meta_error: '', app_meta_at: at });
      } catch (e) {
        await b.asServiceRole.entities.Settings.update(s.id, { app_meta_url: url, app_meta_error: String((e as any)?.message || e).slice(0, 200), app_meta_at: at }).catch(() => {});
      }
    })().finally(() => { appReading = null; });
    await appReading.catch(() => {});
    s = await getSettings(b, true);
  }
  const ok = s.app_meta_url === url && /^[0-9a-f]{64}$/.test(String(s.app_sha256 || '')) && Number(s.app_version_code) > 0 && s.app_package === APP_PACKAGE;
  if (!ok) return Response.json({ ok: true, offered: false, why: s.app_meta_error || (s.app_package && s.app_package !== APP_PACKAGE ? 'the linked file is another app' : '') });
  return Response.json({ ok: true, offered: true, versionCode: Number(s.app_version_code), versionName: String(s.app_version_name || ''),
    url, sha256: String(s.app_sha256), size: Number(s.app_size || 0), notes: '' });
}
