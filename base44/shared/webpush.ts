// Web push, written with the standard Web Crypto API only (works in Deno and browsers):
//   - VAPID (RFC 8292): proves to the push service that the message comes from this site.
//   - Message encryption (RFC 8291, "aes128gcm"): only the member's phone can read it.
// The site's VAPID key pair is made automatically the first time it is needed and kept in
// the PushConfig entity, which nobody but the server can read.

const enc = new TextEncoder();
export const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (s: string) => {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// ----- The site's key pair -----
let cached: { publicKey: string; privateKey: CryptoKey } | null = null;

export async function getVapid(b) {
  if (cached) return cached;
  const E = b.asServiceRole.entities.PushConfig;
  let { items } = await E.filter({ name: 'vapid' }, { limit: 10 });
  if (!items.length) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    await E.create({ name: 'vapid', public_key: b64u(pub), private_jwk: JSON.stringify(jwk), created_at: new Date().toISOString() });
    ({ items } = await E.filter({ name: 'vapid' }, { limit: 10 }));
  }
  // If two calls made a key at the same moment, everyone uses the oldest one.
  const row = items.slice().sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')) || String(x.id).localeCompare(String(y.id)))[0];
  const privateKey = await crypto.subtle.importKey('jwk', JSON.parse(row.private_jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  cached = { publicKey: row.public_key, privateKey };
  return cached;
}

// Only real browser push services may be sent to, so this can't be used to make the
// server call some other address.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function validSubscription(sub) {
  try {
    const u = new URL(String(sub && sub.endpoint));
    if (u.protocol !== 'https:' || !PUSH_HOSTS.some((r) => r.test(u.hostname))) return false;
    const p = unb64u(sub.keys && sub.keys.p256dh), a = unb64u(sub.keys && sub.keys.auth);
    return p.length === 65 && p[0] === 4 && a.length === 16 && String(sub.endpoint).length < 1000;
  } catch { return false; }
}

async function vapidHeader(endpoint: string, vapid, subject: string) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.privateKey, enc.encode(`${header}.${body}`));
  return `vapid t=${header}.${body}.${b64u(sig)}, k=${vapid.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// Encrypt `text` for one subscription (RFC 8291). Returns the request body.
export async function encryptPayload(text: string, p256dh: string, auth: string) {
  const uaPub = unb64u(p256dh), authSecret = unb64u(auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, sealed);
}

// Send one push. Returns the push service's HTTP status (201 = delivered to the service;
// 404/410 = the subscription is gone and should be deleted). 0 = could not reach it.
export async function sendPush(b, sub: { endpoint: string; p256dh: string; auth: string }, message: Record<string, unknown>, opts: { ttl?: number; subject?: string } = {}) {
  const vapid = await getVapid(b);
  const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidHeader(sub.endpoint, vapid, opts.subject || 'https://blacklistintroboys.com'),
        TTL: String(opts.ttl ?? 600),
        Urgency: 'high',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream'
      },
      body
    });
    if (res.status >= 400) console.log('Push refused', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.status;
  } catch (e) {
    console.log('Push failed', String(e));
    return 0;
  }
}