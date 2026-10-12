// Discord is the only way to sign in. After Discord confirms someone is a guild
// member, we hand their device a random sign-in token and remember only its
// SHA-256 in the Session entity. Every backend function calls sessionUser() to
// find out who is calling. Base44's own login is not used for members at all.

const SESSION_DAYS = 30;
const TOKEN_RE = /^[a-f0-9]{64}$/;

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((x) => x.toString(16).padStart(2, '0')).join('');
}

// The token arrives in the X-Guild-Session header or as `_s` in the JSON body.
// The body is read from a clone so the function can still read it afterwards.
async function readToken(req): Promise<string> {
  const h = req.headers.get('x-guild-session');
  if (h) return String(h).trim();
  try {
    const body = await req.clone().json();
    return body && typeof body._s === 'string' ? body._s.trim() : '';
  } catch {
    return '';
  }
}

// Who is calling? Returns { id, member, session } or null when there is no valid
// session. `id` is the Member id. The member is returned even when no_access is
// set; getMemberByUserId() is what refuses those.
// To stay under the platform's request limit, a session that was just looked up is
// remembered for a short while by this running copy of the function. The member row
// is still read fresh on every call, so losing access or a ban applies at once.
const SESSION_CACHE_MS = 120000;   // two minutes (was 30 s): fewer database reads on every call
// 6.17: screens that only look (the table, the crowd, chat) may reuse what this copy read about the
// caller for up to 2 minutes (member row) / 10 minutes (session). Losing access still signs the member
// out within about 90 s (the account refresh), and anything that moves points always reads fresh.
export const POLL_REUSE_MS = 120000;
const POLL_SESSION_MS = 600000;
const sessionCache = new Map<string, { s: any; at: number }>();
const memberSeen = new Map<string, { m: any; at: number; used: number }>();

// The member row sessionUser() read a moment ago in this same request, so the
// function doesn't have to read it a second time.
export function recentMember(id: string) {
  const hit = memberSeen.get(id);
  return hit && Date.now() - hit.used < 1000 ? hit.m : null;
}

// 6.15: read-only screens that ask every few seconds (crowd pulse, arena state, chat) may pass
// maxAgeMs to reuse a member row this copy read within that window instead of reading it again.
// Anything that moves points calls without it and always reads the member fresh.
export async function sessionUser(b, req, maxAgeMs = 0) {
  const token = await readToken(req);
  if (!TOKEN_RE.test(token)) return null;
  const hash = await sha256Hex(token);
  const cached = sessionCache.get(hash);
  let s = cached && Date.now() - cached.at < (maxAgeMs > 0 ? POLL_SESSION_MS : SESSION_CACHE_MS) ? cached.s : null;
  if (!s) {
    const { items } = await b.asServiceRole.entities.Session.filter({ token_hash: hash }, { limit: 1 });
    s = items[0];
    if (!s) return null;
    if (sessionCache.size > 500) sessionCache.clear();
    sessionCache.set(hash, { s, at: Date.now() });
  }
  if (!s.expires_at || Date.parse(s.expires_at) < Date.now()) {
    sessionCache.delete(hash);
    await b.asServiceRole.entities.Session.delete(s.id).catch(() => {});
    return null;
  }
  const seen = maxAgeMs > 0 ? memberSeen.get(s.member_id) : null;
  if (seen && Date.now() - seen.at < maxAgeMs) {
    seen.used = Date.now();
    return { id: seen.m.id, member: seen.m, session: s };
  }
  let member = null;
  try { member = await b.asServiceRole.entities.Member.get(s.member_id); } catch { member = null; }
  if (!member) { sessionCache.delete(hash); return null; }
  if (memberSeen.size > 500) memberSeen.clear();
  memberSeen.set(member.id, { m: member, at: Date.now(), used: Date.now() });
  return { id: member.id, member, session: s };
}

// Issue a new session for a verified member. Returns the raw token (shown once).
export async function createSession(b, member) {
  const E = b.asServiceRole.entities.Session;
  // Tidy up this member's expired sessions.
  try {
    const { items } = await E.filter({ member_id: member.id }, { limit: 50 });
    const now = Date.now();
    for (const s of items) {
      if (!s.expires_at || Date.parse(s.expires_at) < now) await E.delete(s.id).catch(() => {});
    }
  } catch { /* best effort */ }
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await E.create({ token_hash: await sha256Hex(token), member_id: member.id, discord_id: member.discord_id, expires_at: expiresAt });
  return { token, expires_at: expiresAt };
}

export async function destroySession(b, session) {
  for (const [k, v] of sessionCache) if (session && v.s.id === session.id) sessionCache.delete(k);
  if (session && session.id) await b.asServiceRole.entities.Session.delete(session.id).catch(() => {});
}

// Sign a member out everywhere (used when they lose access).
export async function destroyMemberSessions(b, memberId: string) {
  try {
    const E = b.asServiceRole.entities.Session;
    const { items } = await E.filter({ member_id: memberId }, { limit: 100 });
    for (const [k, v] of sessionCache) if (v.s.member_id === memberId) sessionCache.delete(k);
    for (const s of items) await E.delete(s.id).catch(() => {});
  } catch { /* best effort */ }
}