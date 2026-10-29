import { secrets } from 'base44:runtime';
import { sha256Hex, randomHex } from './session.ts';
import { UserError } from './points.ts';

// IntroBoys Assistant licenses.
//
// The desktop app (a separate program the member runs on their own PC) never decides for itself whether it
// may run. It asks the site, and the site answers with a TICKET: a small statement ("this member, on this
// computer, may run until T") signed with a private key that only this backend holds (secret
// BOT_LICENSE_PRIVATE_KEY). The app carries only the matching PUBLIC key, so it can check a ticket but can
// never make one. A ticket names the computer and echoes a random number the app sent with its question, so
// it can't be copied to another computer or replayed later, and it lives only ten minutes, so the app has
// to keep asking (and the site keeps checking the member's Discord role, ban, license and device each time).
//
// What the site owns, and nobody can edit from outside: who holds a license, until when (BotLicense), which
// computer it is locked to, and the sign-ins of the app (BotSession). Days are only ever added by paying for
// them in the shop (shopAction) or by the Guild Leader (botAuth, adminGrant).

export const TICKET_TTL_S = 600;               // a signed ticket is good for 10 minutes
export const CHECK_EVERY_S = 120;              // the app asks again this often
export const BOT_SESSION_DAYS = 14;            // the app's sign-in; every check-in keeps it alive
export const CODE_TTL_MS = 10 * 60 * 1000;     // how long a sign-in code can be approved
export const MAX_DAYS_AHEAD = 730;             // nobody can hold more than 2 years at once
export const DAY_MS = 24 * 60 * 60 * 1000;

const HW_RE = /^[a-f0-9]{64}$/;
const NONCE_RE = /^[a-f0-9]{32}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L

export function secret(name: string) {
  try { const v = secrets.get(name); return v ? String(v).trim() : ''; } catch { return ''; }
}
export const siteUrl = () => (secret('SITE_URL') || 'https://blacklistintroboys.com').replace(/\/+$/, '');

export const cleanHwid = (v): string | null => (typeof v === 'string' && HW_RE.test(v) ? v : null);
export const cleanNonce = (v): string | null => (typeof v === 'string' && NONCE_RE.test(v) ? v : null);
export const cleanToken = (v): string | null => (typeof v === 'string' && TOKEN_RE.test(v.trim()) ? v.trim() : null);
// What the server remembers of a computer: a hash of what the app sent (so the stored value alone is useless).
export const hwHash = (hwid: string) => sha256Hex('bi-assistant-hw1:' + hwid);
export const deviceTag = (hwidHash: string) => String(hwidHash || '').slice(0, 6).toUpperCase();

export function newUserCode(): string {
  const out: string[] = [];
  const a = new Uint8Array(64);
  crypto.getRandomValues(a);
  for (const x of a) {
    if (x >= 248) continue;                       // 248 = 31 x 8: no modulo bias
    out.push(CODE_ALPHABET[x % 31]);
    if (out.length === 8) break;
  }
  if (out.length < 8) return newUserCode();
  return out.slice(0, 4).join('') + '-' + out.slice(4).join('');
}
export function normCode(v): string | null {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8 || [...s].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return s.slice(0, 4) + '-' + s.slice(4);
}

export const text = (v, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- licenses ----------
// 6.41: one license row PER DEVICE ("seat"). Each has its own days and its own locked computer, so a member can run
// the app on several PCs: they move days between their devices, or buy days for a new one. Rows from before 6.41
// have no seat number and are device 1. "Switched off" (revoked) is for the member: it is set on all their rows.
export const MAX_SEATS = 5;
export const seatOf = (l) => Math.max(1, Math.round(Number(l && l.seat) || 1));
export async function getLicenses(b, memberId: string) {
  const { items } = await b.asServiceRole.entities.BotLicense.filter({ member_id: memberId }, { limit: 50 });
  return items.sort((a, c) => seatOf(a) - seatOf(c) || String(a.created_date || a.id).localeCompare(String(c.created_date || c.id)));
}
// One device's license (device 1 when none is named).
export async function getLicense(b, memberId: string, seat = 1) {
  const all = await getLicenses(b, memberId);
  return all.find((l) => seatOf(l) === seat) || null;
}
export const seatName = (l) => text(l && l.label, 24) || `Device ${seatOf(l)}`;

// active / days left / why not
export function licenseState(lic, now = Date.now()) {
  if (!lic) return { active: false, days_left: 0, reason: 'no_license' };
  if (lic.revoked) return { active: false, days_left: 0, reason: 'revoked' };
  const exp = Date.parse(lic.expires_at || '');
  if (!(exp > now)) return { active: false, days_left: 0, reason: 'expired' };
  return { active: true, days_left: Math.ceil((exp - now) / DAY_MS), reason: '' };
}

export function licenseSummary(lic) {
  const st = licenseState(lic);
  return {
    seat: lic ? seatOf(lic) : 1, label: lic ? seatName(lic) : 'Device 1',
    active: st.active, reason: st.reason, days_left: st.days_left,
    expires_at: lic && lic.expires_at ? lic.expires_at : null,
    total_days: lic ? lic.total_days || 0 : 0,
    revoked: !!(lic && lic.revoked), revoked_reason: lic && lic.revoked ? lic.revoked_reason || '' : '',
    device_bound: !!(lic && lic.hwid_hash), device_tag: lic && lic.hwid_hash ? deviceTag(lic.hwid_hash) : '',
    // 6.47: a device is locked to a PC or a phone; the phone Assistant is switched on per member by the Guild Leader
    platform: lic && lic.hwid_hash ? (lic.platform === 'android' ? 'android' : 'pc') : '',
    mobile: !!(lic && lic.mobile),
    last_seen_at: lic ? lic.last_seen_at || null : null
  };
}

// The member as a whole: their best device (the active one with the most time, else device 1), for screens that show one license.
export function memberSummary(all) {
  const best = all.filter((l) => licenseState(l).active).sort((a, c) => Date.parse(c.expires_at) - Date.parse(a.expires_at))[0] || all.find((l) => seatOf(l) === 1) || all[0] || null;
  return { ...licenseSummary(best), devices: all.length, active_devices: all.filter((l) => licenseState(l).active).length };
}

// Which device a grant is for: a seat number, or 'new' (the next free number, up to MAX_SEATS).
export function pickSeat(all, seat): { seat: number; isNew: boolean } {
  if (seat === 'new') {
    if (all.length >= MAX_SEATS) throw new UserError(`You can have at most ${MAX_SEATS} devices.`);
    const used = new Set(all.map(seatOf));
    let n = 1; while (used.has(n)) n++;
    return { seat: n, isNew: true };
  }
  const n = Math.round(Number(seat) || 1);
  if (n < 1 || n > MAX_SEATS) throw new UserError('Pick one of your devices.');
  const have = all.some((l) => seatOf(l) === n);
  if (!have && !(n === 1 && all.length === 0)) throw new UserError('That device does not exist. Pick one of your devices or a new one.', 404);
  return { seat: n, isNew: !have };
}

// Throws before any points are taken when this member can't be given days (on that device).
export async function assertCanHold(b, member, days: number, seat: number | 'new' = 1) {
  const all = await getLicenses(b, member.id);
  if (all.some((l) => l.revoked)) throw new UserError('Your Assistant license was switched off by the Guild Leader. Ask them about it.', 403);
  const pick = pickSeat(all, seat);
  const lic = all.find((l) => seatOf(l) === pick.seat) || null;
  const now = Date.now();
  const base = lic && Date.parse(lic.expires_at || '') > now ? Date.parse(lic.expires_at) : now;
  if (days > 0 && base + days * DAY_MS - now > MAX_DAYS_AHEAD * DAY_MS) {
    throw new UserError(`You can hold at most ${MAX_DAYS_AHEAD} days of Assistant time at once.`);
  }
  return lic;
}

// Add (or, for the leader, take away) days, on one device (1 when none is named, or 'new'). Call it inside
// withMemberLock(member.id). Returns the license and what is needed to put it back exactly as it was.
export async function grantDays(b, member, days: number, kind: string, byId: string | null, note = '', seat: number | 'new' = 1) {
  if (!Number.isInteger(days) || days === 0) throw new UserError('Days must be a whole number.');
  const all = await getLicenses(b, member.id);
  const pick = pickSeat(all, seat);
  const lic = await assertCanHold(b, member, days, pick.isNew ? 'new' : pick.seat);
  const now = Date.now();
  const E = b.asServiceRole.entities.BotLicense;
  const live = lic && Date.parse(lic.expires_at || '') > now;
  const base = live ? Date.parse(lic.expires_at) : now;
  const next = new Date(Math.max(now, base + days * DAY_MS)).toISOString();
  const name = member.discord_name || member.discord_id || '';
  let row, undo;
  if (lic) {
    undo = { id: lic.id, created: false, expires_at: lic.expires_at || '', total_days: lic.total_days || 0 };
    row = await E.update(lic.id, { expires_at: next, total_days: (lic.total_days || 0) + Math.max(0, days), member_name: name, discord_id: String(member.discord_id || '') });
  } else {
    row = await E.create({ member_id: member.id, seat: pick.seat, label: '', discord_id: String(member.discord_id || ''), member_name: name, expires_at: next, total_days: Math.max(0, days), hwid_hash: '', hwid_resets: 0, revoked: false, mobile: all.some((l) => l.mobile) });
    undo = { id: row.id, created: true };
  }
  await logEvent(b, member, kind, `${days > 0 ? '+' : ''}${days} days · device ${pick.seat}${note ? ' · ' + note : ''} · until ${next}${byId ? ' · by ' + byId : ''}`);
  return { license: row, undo };
}

export async function undoGrant(b, undo) {
  if (!undo) return;
  const E = b.asServiceRole.entities.BotLicense;
  if (undo.created) await E.delete(undo.id).catch(() => {});
  else await E.update(undo.id, { expires_at: undo.expires_at, total_days: undo.total_days }).catch(() => {});
}

export async function logEvent(b, who, kind: string, detail = '') {
  try {
    await b.asServiceRole.entities.BotEvent.create({
      member_id: who ? who.id || '' : '', discord_id: who ? String(who.discord_id || '') : '', kind, detail: text(detail, 300), at: new Date(Date.now()).toISOString()
    });
  } catch { /* the log is best effort */ }
}

// ---------- the app's sign-in ----------

// The app's token comes in the X-Bot-Token header, or as `_bt` in the JSON body (in case a proxy drops the header).
export async function botSession(b, req) {
  let raw = req.headers.get('x-bot-token');
  if (!raw) {
    try { const body = await req.clone().json(); raw = body && typeof body._bt === 'string' ? body._bt : ''; } catch { raw = ''; }
  }
  const token = cleanToken(raw);
  if (!token) return null;
  const E = b.asServiceRole.entities.BotSession;
  const { items } = await E.filter({ token_hash: await sha256Hex(token) }, { limit: 1 });
  const s = items[0];
  if (!s) return null;
  if (!(Date.parse(s.expires_at || '') > Date.now())) { await E.delete(s.id).catch(() => {}); return null; }
  return s;
}

// hwidHash: only the sign-ins of that one computer (6.41: signing in on one PC no longer signs the others out).
export async function killBotSessions(b, memberId: string, hwidHash = '') {
  try {
    const E = b.asServiceRole.entities.BotSession;
    const { items } = await E.filter({ member_id: memberId }, { limit: 100 });
    for (const s of items) if (!hwidHash || s.hwid_hash === hwidHash) await E.delete(s.id).catch(() => {});
  } catch { /* best effort */ }
}

// 6.41: move whole days from one of the member's devices to another (or to a new one). Call inside withMemberLock.
export async function moveDays(b, member, from: number, to: number | 'new', days: number) {
  if (!Number.isInteger(days) || days < 1) throw new UserError('Move at least 1 whole day.');
  const all = await getLicenses(b, member.id);
  if (all.some((l) => l.revoked)) throw new UserError('Your Assistant license was switched off by the Guild Leader. Ask them about it.', 403);
  const src = all.find((l) => seatOf(l) === Math.round(Number(from)));
  if (!src) throw new UserError('Pick the device to take the days from.', 404);
  const now = Date.now();
  const left = Math.floor((Date.parse(src.expires_at || '') - now) / DAY_MS);
  if (!(left >= days)) throw new UserError(`${seatName(src)} has ${Math.max(0, left)} whole day${left === 1 ? '' : 's'} to move.`);
  const pick = pickSeat(all, to);
  if (pick.seat === seatOf(src)) throw new UserError('Pick a different device to move the days to.');
  const dst = all.find((l) => seatOf(l) === pick.seat) || null;
  const base = dst && Date.parse(dst.expires_at || '') > now ? Date.parse(dst.expires_at) : now;
  if (base + days * DAY_MS - now > MAX_DAYS_AHEAD * DAY_MS) throw new UserError(`A device can hold at most ${MAX_DAYS_AHEAD} days.`);
  const E = b.asServiceRole.entities.BotLicense;
  const srcExp = new Date(Date.parse(src.expires_at) - days * DAY_MS).toISOString();
  const dstExp = new Date(base + days * DAY_MS).toISOString();
  await E.update(src.id, { expires_at: srcExp });
  let row;
  try {
    row = dst ? await E.update(dst.id, { expires_at: dstExp })
      : await E.create({ member_id: member.id, seat: pick.seat, label: '', discord_id: String(member.discord_id || ''), member_name: member.discord_name || '', expires_at: dstExp, total_days: 0, hwid_hash: '', hwid_resets: 0, revoked: false, mobile: all.some((l) => l.mobile) });
  } catch (e) {
    await E.update(src.id, { expires_at: src.expires_at }).catch(() => {});      // put the days back
    throw e;
  }
  await logEvent(b, member, 'move', `${days} days · device ${seatOf(src)} -> device ${pick.seat}`);
  return { from: { ...src, expires_at: srcExp }, to: row };
}

export { randomHex };

// ---------- 6.31: spam guard for the app's sign-in (it needs no account, so it is open to anyone) ----------
// A connection may ask for at most START_PER_IP sign-in codes per START_WINDOW_MS (checked in the database, so
// it holds across every running copy of the function), and is also slowed down here in memory. Polling for
// the answer is limited per connection too. When one source is stopped, everybody else still gets codes.
export const START_PER_IP = 5;
export const START_WINDOW_MS = 10 * 60 * 1000;
export const POLL_PER_IP_PER_MIN = 60;          // the app polls every 3 s: 20 a minute
export const clientIp = (req) => {
  const f = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '';
  return String(f).split(',')[0].trim().slice(0, 64);
};
export const ipHash = async (ip: string) => (ip ? (await sha256Hex('bi-assistant-ip1:' + ip)).slice(0, 32) : '');
const hits = new Map<string, number[]>();
// true = allowed. Keeps the last `max` times per key inside `windowMs` (in this running copy).
export function memLimit(key: string, max: number, windowMs: number): boolean {
  if (!key) return true;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  if (hits.size > 20000) hits.clear();
  hits.set(key, list);
  return true;
}

// ---------- signing ----------

let keyCache: { raw: string; key: CryptoKey } | null = null;
const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function signingKey(): Promise<CryptoKey | null> {
  const raw = secret('BOT_LICENSE_PRIVATE_KEY');
  if (!raw) return null;
  if (keyCache && keyCache.raw === raw) return keyCache.key;
  try {
    const key = await crypto.subtle.importKey('pkcs8', fromB64(raw.replace(/\s+/g, '')), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    keyCache = { raw, key };
    return key;
  } catch (e) {
    console.error('BOT_LICENSE_PRIVATE_KEY could not be read', String(e));
    return null;
  }
}
export const signingConfigured = async () => !!(await signingKey());

// The app checks `sig` (ECDSA P-256 / SHA-256, r||s) over the exact bytes of `payload`.
export async function signTicket(fields: Record<string, unknown>) {
  const key = await signingKey();
  if (!key) throw new UserError('The Assistant license key is not set up on the site yet. Tell the Guild Leader.', 503);
  const payload = JSON.stringify(fields);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(payload)));
  return { payload, sig: b64(sig) };
}

// Signs a plain string (used for update manifests: `IBU1|version|sha256|size`).
export async function signText(msg: string) {
  const key = await signingKey();
  if (!key) throw new UserError('The Assistant license key is not set up on the site yet. Tell the Guild Leader.', 503);
  return b64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(msg))));
}