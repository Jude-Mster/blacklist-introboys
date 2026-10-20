import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser, sha256Hex, randomHex } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, getMemberByDiscordId, withMemberLock, withRecordLock, UserError, errorResponse, resilient
} from '../../shared/points.ts';
import { refreshAccess } from '../../shared/access.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import {
  TICKET_TTL_S, CHECK_EVERY_S, BOT_SESSION_DAYS, CODE_TTL_MS, RESET_COOLDOWN_DAYS, DAY_MS,
  cleanHwid, cleanNonce, hwHash, deviceTag, newUserCode, normCode, text, siteUrl,
  getLicense, licenseState, licenseSummary, grantDays, logEvent, botSession, killBotSessions, signTicket, signingConfigured,
  START_PER_IP, START_WINDOW_MS, POLL_PER_IP_PER_MIN, clientIp, ipHash, memLimit
} from '../../shared/botLicense.ts';
import { rankedMembers } from '../../shared/points.ts';

// The IntroBoys Assistant license service. One function, three kinds of caller:
//
//   the app, not signed in   start  poll              (device sign-in: the app shows a code, the member approves it on the site)
//   the app, signed in       check  logout            (header X-Bot-Token; `check` returns the signed ticket the app needs to run)
//   the site (Discord login) status describe approve resetDevice
//   the Guild Leader         adminList adminGrant adminRevoke adminRestore adminReset
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
    if (action === 'start') return await start(b, p, req);
    if (action === 'poll') {
      const pip = clientIp(req);   // no address known: no per-connection limit (never one shared bucket for everyone)
      if (pip && !memLimit('poll:' + pip, POLL_PER_IP_PER_MIN, 60000)) return fail('busy', 'Slow down: try again in a minute.', 429);
      return await poll(b, p);
    }

    // ---------- the app, signed in ----------
    if (action === 'check' || action === 'logout') {
      const s = await botSession(b, req);
      if (!s) return fail('session', 'Sign in again.', 401);
      if (action === 'logout') { await b.asServiceRole.entities.BotSession.delete(s.id).catch(() => {}); return Response.json({ ok: true }); }
      return await check(b, s, p);
    }

    // ---------- the site ----------
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.', 401);
    const leader = me.role === 'leader';
    const leaderOnly = () => { if (!leader) throw new UserError('Only the Guild Leader can do that.', 403); };

    if (action === 'status') return await status(b, me);
    if (action === 'describe') return await describe(b, me, p);
    if (action === 'approve') return await approve(b, me, p);
    if (action === 'resetDevice') return await resetDevice(b, me);

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
    device_hash: await sha256Hex(secretRaw), user_code: code, hwid_hash: hh, ip_hash: ih, app_version: text(p.app_version, 24),
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
    await killBotSessions(b, member.id);                   // only the newest sign-in works
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

  const lic = await getLicense(b, member.id);
  const st = licenseState(lic);
  const who = { name: member.discord_name || '', avatar_url: member.avatar_url || '' };
  if (!st.active) return Response.json({ licensed: false, reason: st.reason, days_left: 0, expires_at: lic ? lic.expires_at || null : null, ...who, check_every: CHECK_EVERY_S });

  // The license belongs to one computer: the first one that uses it keeps it until the member moves it.
  if (!lic.hwid_hash) {
    await withMemberLock(b, member.id, async () => {
      const fresh = await getLicense(b, member.id);
      if (fresh && !fresh.hwid_hash) {
        await E.BotLicense.update(fresh.id, { hwid_hash: s.hwid_hash, hwid_bound_at: nowIso() });
        await logEvent(b, member, 'bind', `device ${deviceTag(s.hwid_hash)}`);
        lic.hwid_hash = s.hwid_hash;
      } else if (fresh) lic.hwid_hash = fresh.hwid_hash;
    });
  }
  if (lic.hwid_hash !== s.hwid_hash) {
    return Response.json({ licensed: false, reason: 'other_device', days_left: st.days_left, expires_at: lic.expires_at, device_tag: deviceTag(lic.hwid_hash), ...who, check_every: CHECK_EVERY_S });
  }
  if (!minutesAgo(lic.last_seen_at, 5)) await E.BotLicense.update(lic.id, { last_seen_at: nowIso() }).catch(() => {});

  const now = Math.floor(Date.now() / 1000);
  const exp = Math.floor(Date.parse(lic.expires_at) / 1000);
  const ticket = await signTicket({
    v: 1, mid: member.id, did: String(member.discord_id || ''), hw: hwid, n: nonce, sid: s.id,
    iat: now, ttl: Math.max(30, Math.min(TICKET_TTL_S, exp - now)), exp
  });
  return Response.json({ licensed: true, reason: '', days_left: st.days_left, expires_at: lic.expires_at, ...who, ticket, check_every: CHECK_EVERY_S });
}

// ======================================================================= the site

async function status(b, me) {
  const lic = await getLicense(b, me.id);
  const { items: sess } = await b.asServiceRole.entities.BotSession.filter({ member_id: me.id }, { limit: 5 });
  const online = sess.some((x) => minutesAgo(x.last_seen_at, 5));
  const { items: shop } = await b.asServiceRole.entities.ShopItem.filter({ active: true }, { sort: 'sort', limit: 300 });
  const sum = licenseSummary(lic);
  const nextReset = lic && lic.hwid_reset_at ? Date.parse(lic.hwid_reset_at) + RESET_COOLDOWN_DAYS * DAY_MS : 0;
  return Response.json({
    license: sum, app_online: online,
    can_reset: !!(lic && lic.hwid_hash) && !(nextReset > Date.now()),
    next_reset_at: nextReset > Date.now() ? new Date(nextReset).toISOString() : null,
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
  const lic = await getLicense(b, me.id);
  return Response.json({
    code: row.user_code, device_tag: deviceTag(row.hwid_hash), app_version: row.app_version || '',
    other_device: !!(lic && lic.hwid_hash && lic.hwid_hash !== row.hwid_hash),
    license: licenseSummary(lic)
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

async function resetDevice(b, me) {
  return await withMemberLock(b, me.id, async () => {
    const lic = await getLicense(b, me.id);
    if (!lic || !lic.hwid_hash) throw new UserError('Your license is not locked to a computer yet.');
    const next = lic.hwid_reset_at ? Date.parse(lic.hwid_reset_at) + RESET_COOLDOWN_DAYS * DAY_MS : 0;
    if (next > Date.now()) throw new UserError(`You can move the license to another computer once every ${RESET_COOLDOWN_DAYS} days. Next time: ${new Date(next).toLocaleDateString('en-US')}.`, 429);
    await b.asServiceRole.entities.BotLicense.update(lic.id, { hwid_hash: '', hwid_resets: (lic.hwid_resets || 0) + 1, hwid_reset_at: nowIso() });
    await killBotSessions(b, me.id);
    await logEvent(b, me, 'reset', `was device ${deviceTag(lic.hwid_hash)}`);
    return Response.json({ ok: true });
  });
}

// ======================================================================= the Guild Leader

async function admin(b, me, action: string, p) {
  const E = b.asServiceRole.entities;
  if (action === 'adminList') {
    const { items } = await E.BotLicense.filter({}, { sort: '-expires_at', limit: 500 });
    const { items: sess } = await E.BotSession.filter({}, { limit: 500 });
    const online = new Set(sess.filter((x) => minutesAgo(x.last_seen_at, 5)).map((x) => x.member_id));
    const { items: events } = await E.BotEvent.filter({}, { sort: '-created_date', limit: 40 });
    return Response.json({
      licenses: items.map((l) => ({ member_id: l.member_id, discord_id: l.discord_id, member_name: l.member_name, online: online.has(l.member_id), hwid_resets: l.hwid_resets || 0, ...licenseSummary(l) })),
      events: events.map((e) => ({ id: e.id, at: e.at, kind: e.kind, discord_id: e.discord_id, detail: e.detail }))
    });
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

  if (action === 'adminGrant') {
    const days = Number(p.days);
    if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 3650) throw new UserError('Days must be a whole number between -3650 and 3650 (not 0).');
    const { license } = await withMemberLock(b, target.id, () => grantDays(b, target, days, 'grant', me.id, text(p.note, 100)));
    return Response.json({ ok: true, license: licenseSummary(license) });
  }
  const lic = await getLicense(b, target.id);
  if (!lic) throw new UserError('That member has no Assistant license.', 404);
  if (action === 'adminRevoke') {
    await withMemberLock(b, target.id, async () => {
      await E.BotLicense.update(lic.id, { revoked: true, revoked_reason: text(p.reason, 200) });
      await killBotSessions(b, target.id);
      await logEvent(b, target, 'revoke', `${text(p.reason, 100)} · by ${me.id}`);
    });
    return Response.json({ ok: true });
  }
  if (action === 'adminRestore') {
    await E.BotLicense.update(lic.id, { revoked: false, revoked_reason: '' });
    await logEvent(b, target, 'restore', `by ${me.id}`);
    return Response.json({ ok: true });
  }
  if (action === 'adminReset') {
    await withMemberLock(b, target.id, async () => {
      await E.BotLicense.update(lic.id, { hwid_hash: '', hwid_resets: (lic.hwid_resets || 0) + 1 });
      await killBotSessions(b, target.id);
      await logEvent(b, target, 'reset', `by leader ${me.id}`);
    });
    return Response.json({ ok: true });
  }
  throw new UserError('Unknown action.');
}
