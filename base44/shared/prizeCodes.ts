import { secrets } from 'base44:runtime';
import { sendPush } from './webpush.ts';
import { UserError, withRecordLock } from './points.ts';

// Prize codes (for example Wuxen2 GP codes). Only the Guild Leader adds or gives them,
// and only the member a code was given to can ever load it. Everyone else, the Guild
// Leader included, only ever sees the last four characters.
//
// Codes are stored ENCRYPTED (AES-GCM) with a key kept in the PRIZE_CODE_KEY secret, so
// even someone browsing the database in the Base44 dashboard can't read them. They are
// decrypted only for the member they belong to (ownerView) and for that member's DM.
// Never change PRIZE_CODE_KEY once codes are saved: codes saved under the old key could
// no longer be read.
//
// A PrizeCode row is one code, in one of these states:
//   stock     waiting in the leader's stock, not promised to anyone
//   reserved  set aside for a raffle prize (raffle_id + place), not yet drawn
//   assigned  given to a member (member_id); delivered on the site, by Discord DM and push

const SITE = 'https://blacklistintroboys.com';
const REDEEM_URL = 'https://wuxen2.com/redeem';
const STOCK_LOCK = 'stock'; // one lock for every action that takes codes out of stock

// Spaces and dashes are ignored, as on the Wuxen2 redeem page. Letters and digits only.
export function normalizeCode(raw): string {
  return String(raw ?? '').replace(/[\s-]+/g, '');
}
export function checkCode(raw): string {
  const code = normalizeCode(raw);
  if (!code) throw new UserError('Type the code.');
  if (!/^[A-Za-z0-9]+$/.test(code)) throw new UserError('A code can only have letters and digits (spaces and dashes are ignored).');
  if (code.length < 6 || code.length > 64) throw new UserError('That code is too short or too long.');
  return code;
}
export const last4 = (code: string) => normalizeCode(code).slice(-4);

// ---------- Encryption at rest ----------
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let keyCache: { raw: string; aes: CryptoKey; mac: CryptoKey } | null = null;
async function keys() {
  let raw = '';
  try { raw = String(secrets.get('PRIZE_CODE_KEY') || '').trim(); } catch { raw = ''; }
  if (raw.length < 16) throw new UserError('Prize codes are not set up yet: add the PRIZE_CODE_KEY secret in Base44 (a long random text, at least 16 characters), then try again.');
  if (keyCache && keyCache.raw === raw) return keyCache;
  const material = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`blacklist-prize-codes:${raw}`)));
  const aes = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const mac = await crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  keyCache = { raw, aes, mac };
  return keyCache;
}
export async function sealCode(code: string) {
  const { aes } = await keys();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(normalizeCode(code))));
  return `v1:${b64(iv)}.${b64(ct)}`;
}
// The code itself, or '' if it can't be read (wrong key).
export async function openCode(stored: string) {
  const v = String(stored || '');
  if (!v.startsWith('v1:')) return v;
  try {
    const { aes } = await keys();
    const [iv, ct] = v.slice(3).split('.');
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, aes, unb64(ct)));
  } catch (e) {
    console.error('prize code could not be decrypted');
    return '';
  }
}
// A keyed fingerprint, to refuse the same code twice (letter case ignored).
export async function codeHash(code: string) {
  const { mac } = await keys();
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', mac, enc.encode(normalizeCode(code).toUpperCase())));
  return Array.from(sig).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const grouped = (code: string) => normalizeCode(code).replace(/(.{4})(?=.)/g, '$1-');
export const cleanLabel = (v, fallback = '') => String(v ?? fallback).replace(/\s+/g, ' ').trim().slice(0, 80);
export const cleanReason = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
const sameLabel = (a, b) => cleanLabel(a).toLowerCase() === cleanLabel(b).toLowerCase();
const now = () => new Date().toISOString();

// What the Guild Leader sees: never the code itself.
export function leaderView(r) {
  return {
    id: r.id, label: r.label, status: r.status, last4: r.last4, source: r.source || '',
    member_id: r.member_id || '', member_name: r.member_name || '', reason: r.reason || '',
    raffle_id: r.raffle_id || '', raffle_title: r.raffle_title || '', place: r.place || 0,
    assigned_at: r.assigned_at || '', dm_status: r.dm_status || '', dm_at: r.dm_at || '',
    push_sent: !!r.push_sent, opened_at: r.opened_at || '', redeemed_at: r.redeemed_at || '',
    created_date: r.created_date || ''
  };
}
// What the member the code belongs to sees.
export async function ownerView(r) {
  return { ...leaderView(r), code: await openCode(r.code), redeem_url: REDEEM_URL };
}

export async function runStockLocked(b, fn) {
  return withRecordLock(b, 'PrizeStock', STOCK_LOCK, fn, 60000);
}

// Throws if this code is already known (in stock, set aside or given).
export async function assertNewCode(b, code: string, exceptId = '') {
  const { items } = await b.asServiceRole.entities.PrizeCode.filter({ code_hash: await codeHash(code) }, { limit: 5 });
  if (items.some((r) => r.id !== exceptId)) throw new UserError(`The code ending in ${last4(code)} has already been added.`);
}

export async function codeFields(code: string) {
  return { code: await sealCode(code), code_hash: await codeHash(code), last4: last4(code) };
}

// The oldest stock code with this prize name, or null. Call inside runStockLocked.
export async function takeFromStock(b, label: string) {
  const { items } = await b.asServiceRole.entities.PrizeCode.filter({ status: 'stock' }, { limit: 2000 });
  const pick = items.filter((r) => sameLabel(r.label, label)).sort((x, y) => String(x.created_date || x.id).localeCompare(String(y.created_date || y.id)))[0];
  return pick || null;
}

export async function stockSummary(b) {
  const { items } = await b.asServiceRole.entities.PrizeCode.filter({ status: 'stock' }, { limit: 2000 });
  const map = new Map();
  for (const r of items) {
    const key = cleanLabel(r.label).toLowerCase();
    const cur = map.get(key) || { label: cleanLabel(r.label), count: 0 };
    cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].sort((x, y) => x.label.localeCompare(y.label));
}

// ---------- Delivery ----------

function botToken() {
  try { return String(secrets.get('DISCORD_BOT_TOKEN') || '').trim(); } catch { return ''; }
}

// Sends the code to the member in a Discord DM. Returns 'sent', 'blocked' (the member
// doesn't accept DMs from the bot), 'no_bot' or 'failed'. Never throws.
export async function sendCodeDm(discordId: string, row) {
  const token = botToken();
  if (!token) return 'no_bot';
  if (!/^\d{5,32}$/.test(String(discordId || ''))) return 'failed';
  const plain = await openCode(row.code);
  if (!plain) return 'failed';
  const call = async (url: string, body) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      return await fetch(url, { method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    } finally { clearTimeout(timer); }
  };
  try {
    const ch = await call('https://discord.com/api/v10/users/@me/channels', { recipient_id: String(discordId) });
    if (!ch.ok) { console.log('prize DM: could not open DM', ch.status); return ch.status === 403 ? 'blocked' : 'failed'; }
    const { id: channelId } = await ch.json();
    const place = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'][(row.place || 1) - 1] || '';
    const title = row.source === 'raffle' ? `You won ${place} prize: ${row.label}` : `You received: ${row.label}`;
    const lines = [];
    if (row.source === 'raffle' && row.raffle_title) lines.push(`Raffle: ${row.raffle_title}`);
    if (row.reason) lines.push(`For: ${row.reason}`);
    const msg = await call(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      allowed_mentions: { parse: [] },
      embeds: [{
        color: 0xD4A72C,
        title: title.slice(0, 250),
        description: [
          ...lines,
          '',
          '**Your code**',
          '```' + grouped(plain) + '```',
          `Redeem it at ${REDEEM_URL}. It is also saved on the guild site under Profile, My prizes: ${SITE}/profile#prizes`
        ].join('\n').slice(0, 3900),
        footer: { text: 'Keep this code private. Anyone who has it can redeem it.' }
      }]
    });
    if (msg.ok) return 'sent';
    const err = await msg.json().catch(() => ({}));
    console.log('prize DM: send failed', msg.status, err && err.code);
    return msg.status === 403 || (err && err.code === 50007) ? 'blocked' : 'failed';
  } catch (e) {
    console.log('prize DM: error', String(e));
    return 'failed';
  }
}

// A phone/browser notification that a prize is waiting. It never contains the code:
// notifications show on locked screens.
async function notifyPush(b, memberId: string, row) {
  let sent = false;
  try {
    const E = b.asServiceRole.entities.PushSub;
    const { items } = await E.filter({ member_id: memberId }, { limit: 10 });
    for (const s of items) {
      const status = await sendPush(b, s, {
        title: 'BLACKLIST INTROBOYS: You received a prize',
        body: `${row.label} is waiting for you in My prizes.`,
        tag: `prize-${row.id}`, url: '/profile#prizes', kind: 'prize'
      }, { ttl: 86400 });
      if (status >= 200 && status < 300) sent = true;
      else if (status === 404 || status === 410) await E.delete(s.id).catch(() => {});
    }
  } catch (e) { console.log('prize push failed', String(e)); }
  return sent;
}

// Give a code row to a member: record it, then DM and notify. Returns the updated row.
// `extra` may carry source, reason, raffle fields and place.
export async function assignAndDeliver(b, row, member, extra = {}) {
  const E = b.asServiceRole.entities.PrizeCode;
  let r = await E.update(row.id, {
    status: 'assigned', member_id: member.id, member_name: member.discord_name || member.discord_id || '',
    discord_id: String(member.discord_id || ''), assigned_at: now(), opened_at: '', redeemed_at: '',
    dm_status: 'pending', dm_at: '', push_sent: false, ...extra
  });
  r = await deliver(b, r);
  return r;
}

// (Re)send the DM and the push for an assigned row. Returns the updated row.
export async function deliver(b, r) {
  const E = b.asServiceRole.entities.PrizeCode;
  const dm = await sendCodeDm(r.discord_id, r);
  const push = await notifyPush(b, r.member_id, r);
  return E.update(r.id, { dm_status: dm, dm_at: now(), push_sent: push || !!r.push_sent }).catch(() => ({ ...r, dm_status: dm }));
}