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
export async function sessionUser(b, req) {
  const token = await readToken(req);
  if (!TOKEN_RE.test(token)) return null;
  const hash = await sha256Hex(token);
  const { items } = await b.asServiceRole.entities.Session.filter({ token_hash: hash }, { limit: 1 });
  const s = items[0];
  if (!s) return null;
  if (!s.expires_at || Date.parse(s.expires_at) < Date.now()) {
    await b.asServiceRole.entities.Session.delete(s.id).catch(() => {});
    return null;
  }
  let member = null;
  try { member = await b.asServiceRole.entities.Member.get(s.member_id); } catch { member = null; }
  if (!member) return null;
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
  if (session && session.id) await b.asServiceRole.entities.Session.delete(session.id).catch(() => {});
}

// Sign a member out everywhere (used when they lose access).
export async function destroyMemberSessions(b, memberId: string) {
  try {
    const E = b.asServiceRole.entities.Session;
    const { items } = await E.filter({ member_id: memberId }, { limit: 100 });
    for (const s of items) await E.delete(s.id).catch(() => {});
  } catch { /* best effort */ }
}