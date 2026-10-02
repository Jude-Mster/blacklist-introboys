import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings } from '../../shared/points.ts';
import { requiredRoleId, markAccessDenied } from '../../shared/access.ts';
import { sha256Hex, createSession } from '../../shared/session.ts';

// Step 2 of "Continue with Discord". The /login page calls this with the code
// and state Discord sent back. We ask Discord who this is, and ONLY if they are
// in our server with the member role do we create/update their profile and hand
// this device a session. Anyone else gets an error code and is not signed in.

const DISCORD_API = 'https://discord.com/api/v10';
const REPLAY_MS = 5 * 60 * 1000; // a verified code may be presented again for this long
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function secret(name: string) {
  try { const v = secrets.get(name); return v ? String(v).trim() : ''; } catch { return ''; }
}

function avatarUrl(me) {
  if (!me.avatar) {
    const idx = Number((BigInt(me.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  const ext = me.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.${ext}?size=128`;
}

type Outcome = { result: string; member_id?: string; name?: string; avatar?: string };

// Ask Discord who holds this code and whether they're a guild member. On success
// the Member profile is created or refreshed. Expected failures are returned as
// { result: <error code> }; only unexpected errors throw.
async function verifyMember(b, code: string): Promise<Outcome> {
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: secret('DISCORD_CLIENT_ID'),
      client_secret: secret('DISCORD_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code,
      redirect_uri: secret('DISCORD_REDIRECT_URI')
    })
  });
  if (!tokenRes.ok) {
    console.log('Token exchange failed', tokenRes.status, await tokenRes.text());
    return { result: 'token' };
  }
  const { access_token: accessToken } = await tokenRes.json();
  const auth = { headers: { Authorization: `Bearer ${accessToken}` } };

  const [meRes, guildsRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, auth),
    fetch(`${DISCORD_API}/users/@me/guilds?limit=200`, auth)
  ]);
  if (!meRes.ok) return { result: 'token' };
  const me = await meRes.json();
  if (!me || !me.id) return { result: 'token' };
  if (guildsRes.status === 429) return { result: 'busy' };
  const guilds = guildsRes.ok ? await guildsRes.json() : [];

  const settings = await getSettings(b);
  const guildId = String(settings.guild_id || secret('DISCORD_GUILD_ID') || '').trim();
  const myGuild = Array.isArray(guilds) ? guilds.find((g) => String(g.id) === guildId) : null;

  // Fail closed: must be positively confirmed as a member of our server.
  if (!myGuild) {
    console.log('Guild check failed', JSON.stringify({ configured_guild_id: guildId || '(not set)', discord_user: me.id }));
    if (guildId) await markAccessDenied(b, { discordId: String(me.id) });
    return { result: guildId ? 'not_in_guild' : 'guild_not_set' };
  }

  const isGuildOwner = !!myGuild.owner;
  const roleId = requiredRoleId(settings);
  if (!isGuildOwner) {
    const mRes = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, auth);
    if (mRes.status === 429) return { result: 'busy' };
    let roles: string[] = [];
    if (mRes.ok) {
      const gm = await mRes.json();
      roles = gm && Array.isArray(gm.roles) ? gm.roles.map(String) : [];
    }
    // Any error, empty result, or missing role means no access.
    if (!mRes.ok || !roleId || !roles.includes(roleId)) {
      console.log('Role check failed', JSON.stringify({ discord_user: me.id, required_role: roleId, status: mRes.status, roles }));
      if (mRes.ok) await markAccessDenied(b, { discordId: String(me.id) });
      return { result: 'no_role' };
    }
  }

  const profile = {
    no_access: false,
    access_checked_at: new Date().toISOString(),
    discord_name: me.global_name || me.username,
    discord_username: me.username,
    avatar_url: avatarUrl(me)
  };

  const M = b.asServiceRole.entities.Member;
  const { items: existing } = await M.filter({ discord_id: String(me.id) }, { limit: 1 });
  let member;
  if (existing.length > 0) {
    const m = existing[0];
    if (m.role === 'leader' && !isGuildOwner) {
      console.log('NOTE: leader row signed in but is not the Discord server owner', JSON.stringify({ discord_id: me.id }));
    }
    // Leader is only ever GRANTED when Discord says this user owns the server.
    const promote = isGuildOwner && m.role !== 'leader';
    member = await M.update(m.id, { ...profile, ...(promote ? { role: 'leader' } : {}) });
    if (!member || !member.id) member = { ...m, ...profile };
  } else {
    member = await M.create({
      ...profile,
      user_id: '',
      discord_id: String(me.id),
      points: 0,
      role: isGuildOwner ? 'leader' : 'member',
      banned: false
    });
  }

  if (!settings.guild_id && isGuildOwner) {
    await b.asServiceRole.entities.Settings.update(settings.id, { guild_id: guildId });
  }

  return { result: 'ok', member_id: member.id, name: profile.discord_name, avatar: profile.avatar_url };
}

const stored = (row): Outcome => ({ result: row.result, member_id: row.result_member_id, name: row.result_name, avatar: row.result_avatar });

// Verify once per state, guarded by a lock so two calls arriving together can't
// both spend the single-use Discord code. The outcome is saved on the state row.
async function verifyOnce(b, st, code: string, codeHash: string) {
  const E = b.asServiceRole.entities.OAuthState;
  const token = crypto.randomUUID();
  const waitForResult = async () => {
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const c = await E.get(st.id);
      if (c.result) return c;
    }
    throw new Error('Discord sign-in is still processing. Try again in a moment.');
  };

  const cur = await E.get(st.id);
  if (cur.result) return cur;
  const lockFree = !cur.lock_token || !cur.lock_until || Date.parse(cur.lock_until) < Date.now();
  if (!lockFree) return await waitForResult();

  await E.update(st.id, { lock_token: token, lock_until: new Date(Date.now() + 30000).toISOString() });
  await sleep(35);
  const check = await E.get(st.id);
  if (check.result) return check;
  if (check.lock_token !== token) return await waitForResult();

  try {
    const out = await verifyMember(b, code);
    const fields = {
      result: out.result,
      result_member_id: out.member_id || '',
      result_name: out.name || '',
      result_avatar: out.avatar || '',
      code_hash: codeHash,
      consumed_at: new Date().toISOString(),
      lock_token: '',
      lock_until: new Date(0).toISOString()
    };
    await E.update(st.id, fields);
    return { ...check, ...fields };
  } catch (e) {
    await E.update(st.id, { lock_token: '', lock_until: new Date(0).toISOString() }).catch(() => {});
    throw e;
  }
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    let p; try { p = await req.json(); } catch { p = {}; }
    const code = String(p.code || '').trim();
    const state = String(p.state || '').trim();
    const nonce = typeof p.nonce === 'string' ? p.nonce.trim() : '';
    const confirmed = p.confirm === true;
    if (!code || !state || code.length > 200 || state.length > 100) return Response.json({ error: 'state' });

    const settings = await getSettings(b);
    const invite_url = settings.discord_invite_url || '';

    const { items } = await b.asServiceRole.entities.OAuthState.filter({ state }, { limit: 1 });
    if (items.length === 0) return Response.json({ error: 'state' });
    const st = items[0];
    if (!st.expires_at || new Date(st.expires_at) < new Date()) return Response.json({ error: 'state' });

    const codeHash = await sha256Hex(code);
    const row = await verifyOnce(b, st, code, codeHash);

    // Only the holder of the exact Discord code that was verified may continue.
    if (row.code_hash !== codeHash) return Response.json({ error: 'state' });

    const out = stored(row);
    // Not a member (or any other failure): no session, no sign-in.
    if (out.result !== 'ok' || !out.member_id) return Response.json({ error: out.result || 'server', invite_url });

    if (!row.consumed_at || Date.now() - Date.parse(row.consumed_at) > REPLAY_MS) return Response.json({ error: 'state' });

    // Was the sign-in finished on the same browser that started it? If not (for
    // example it started in the app and Discord returned to the browser), ask the
    // person to confirm the Discord account before signing this device in.
    const sameBrowser = !!st.nonce_hash && !!nonce && (await sha256Hex(nonce)) === st.nonce_hash;
    if (!sameBrowser && !confirmed) {
      return Response.json({ confirm_needed: true, name: out.name || '', avatar: out.avatar || '' });
    }

    let member = null;
    try { member = await b.asServiceRole.entities.Member.get(out.member_id); } catch { member = null; }
    if (!member || member.no_access) return Response.json({ error: 'no_role', invite_url });

    const session = await createSession(b, member);
    return Response.json({ token: session.token, expires_at: session.expires_at });
  } catch (e) {
    console.error('discordLogin error', e);
    return Response.json({ error: 'server' });
  }
}