import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings } from '../../shared/points.ts';
import { requiredRoleId, markAccessDenied } from '../../shared/access.ts';

const DISCORD_API = 'https://discord.com/api/v10';
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

// Run the Discord checks + link. The Discord account is always linked to `userId`,
// the site account that is logged in on the browser FINISHING the flow (the one
// that holds the Discord code). Returns a landing path (always).
// Never throws for expected outcomes — those become /link-discord?error=... paths.
async function linkFlow(b, userId: string, code): Promise<string> {
  const fail = (c: string) => `/link-discord?error=${c}`;

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
    return fail('token');
  }
  const { access_token: accessToken } = await tokenRes.json();
  const auth = { headers: { Authorization: `Bearer ${accessToken}` } };

  const [meRes, guildsRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, auth),
    fetch(`${DISCORD_API}/users/@me/guilds?limit=200`, auth)
  ]);
  if (!meRes.ok) return fail('token');
  const me = await meRes.json();
  if (guildsRes.status === 429) return fail('busy');
  const guilds = guildsRes.ok ? await guildsRes.json() : [];

  const settings = await getSettings(b);
  const guildId = String(settings.guild_id || secret('DISCORD_GUILD_ID') || '').trim();
  const myGuild = Array.isArray(guilds) ? guilds.find((g) => String(g.id) === guildId) : null;

  // Fail closed: must be positively confirmed as a member of our server.
  if (!myGuild) {
    console.log('Guild check failed', JSON.stringify({ configured_guild_id: guildId || '(not set)', discord_user: me.id }));
    await markAccessDenied(b, { discordId: String(me.id), userId: userId });
    return fail(guildId ? 'not_in_guild' : 'guild_not_set');
  }

  const isGuildOwner = !!myGuild.owner;
  const roleId = requiredRoleId(settings);
  if (roleId && !isGuildOwner) {
    const mRes = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, auth);
    if (mRes.status === 429) return fail('busy');
    let roles: string[] = [];
    if (mRes.ok) {
      const gm = await mRes.json();
      roles = gm && Array.isArray(gm.roles) ? gm.roles.map(String) : [];
    }
    if (!mRes.ok || !roles.includes(roleId)) {
      console.log('Role check failed', JSON.stringify({ discord_user: me.id, required_role: roleId, status: mRes.status, roles }));
      await markAccessDenied(b, { discordId: String(me.id), userId: userId });
      return fail('no_role');
    }
  }

  const { items: existing } = await b.asServiceRole.entities.Member.filter({ discord_id: String(me.id) }, { limit: 1 });

  // Already-linked guard: this Discord is linked to a DIFFERENT site user — never move it.
  if (existing[0] && existing[0].user_id && existing[0].user_id !== userId) {
    console.log('Already linked to another user', JSON.stringify({ discord_id: me.id, owner_user: existing[0].user_id, attempt_user: userId }));
    return fail('already_linked');
  }

  // Never sticky leader: a non-owner row that is somehow leader → block, don't keep it.
  if (existing[0] && existing[0].role === 'leader' && !isGuildOwner) {
    console.log('NON-OWNER LEADER BLOCK', JSON.stringify({ discord_id: me.id, user_id: userId, role: existing[0].role }));
    return fail('not_owner_leader');
  }

  const profile = {
    no_access: false,
    access_checked_at: new Date().toISOString(),
    user_id: userId,
    discord_name: me.global_name || me.username,
    discord_username: me.username,
    avatar_url: avatarUrl(me)
  };

  // Clear this site user's link from any other member rows (re-linking to a new Discord).
  const { items: previous } = await b.asServiceRole.entities.Member.filter({ user_id: userId }, { limit: 5 });
  for (const p of previous) {
    if (p.discord_id !== String(me.id)) await b.asServiceRole.entities.Member.update(p.id, { user_id: '' });
  }

  if (existing.length > 0) {
    const m = existing[0];
    // Leader only when Discord positively says this user owns the guild. Never by default.
    const promote = isGuildOwner && m.role !== 'leader';
    await b.asServiceRole.entities.Member.update(m.id, { ...profile, ...(promote ? { role: 'leader' } : {}) });
  } else {
    await b.asServiceRole.entities.Member.create({
      ...profile,
      discord_id: String(me.id),
      points: 0,
      role: isGuildOwner ? 'leader' : 'member',
      banned: false
    });
  }

  if (!settings.guild_id && isGuildOwner) {
    await b.asServiceRole.entities.Settings.update(settings.id, { guild_id: guildId });
  }

  return '/dashboard?linked=1';
}

// Compute the landing path once, guarded by a lock so two concurrent calls on the
// same state don't both spend the single-use Discord code.
async function computeOnce(b, st, userId: string, code): Promise<string> {
  const E = b.asServiceRole.entities.OAuthState;
  const token = crypto.randomUUID();
  const LOCK_MS = 30000;

  const cur = await E.get(st.id);
  if (cur.result) return cur.result;

  const lockFree = !cur.lock_token || !cur.lock_until || Date.parse(cur.lock_until) < Date.now();
  if (!lockFree) {
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const c = await E.get(st.id);
      if (c.result) return c.result;
    }
    throw new Error('Discord linking is still processing. Try again in a moment.');
  }

  await E.update(st.id, { lock_token: token, lock_until: new Date(Date.now() + LOCK_MS).toISOString() });
  await sleep(35);
  const check = await E.get(st.id);
  if (check.lock_token !== token) {
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const c = await E.get(st.id);
      if (c.result) return c.result;
    }
    throw new Error('Discord linking is still processing. Try again in a moment.');
  }

  try {
    const path = await linkFlow(b, userId, code);
    await E.update(st.id, {
      result: path,
      consumed_at: new Date().toISOString(),
      lock_token: '',
      lock_until: new Date(0).toISOString()
    });
    return path;
  } catch (e) {
    await E.update(st.id, { lock_token: '', lock_until: new Date(0).toISOString() }).catch(() => {});
    throw e;
  }
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Log in first.' }, { status: 401 });

    let p; try { p = await req.json(); } catch { p = {}; }
    const code = String(p.code || '').trim();
    const state = String(p.state || '').trim();
    const confirmed = p.confirm === true;
    if (!code || !state) return Response.json({ error: 'Missing code or state.' }, { status: 400 });

    const { items } = await b.asServiceRole.entities.OAuthState.filter({ state }, { limit: 1 });
    if (items.length === 0) return Response.json({ redirect: '/link-discord?error=state' });
    const st = items[0];

    if (new Date(st.expires_at) < new Date()) return Response.json({ redirect: '/link-discord?error=state' });

    // SESSION BINDING. The Discord account is only ever linked to the site account
    // logged in on THIS browser (the one holding the Discord code) - never to the
    // account that started the flow. So a link started by someone else can never
    // attach your Discord to their account.
    //
    // The flow can legitimately finish on a different session than it started on
    // (started in the installed app, Discord returned to Chrome, or the reverse).
    // In that case nothing is linked until the person on this browser explicitly
    // confirms they want their Discord linked to the account signed in here.
    const sameSession = st.user_id === user.id;
    if (!sameSession) {
      const { items: mine } = await b.asServiceRole.entities.Member.filter({ user_id: user.id }, { limit: 1 });
      if (mine[0] && !mine[0].no_access) {
        // This account is already linked - nothing to do, and nothing is changed.
        return Response.json({ redirect: '/dashboard' });
      }
      if (!confirmed) {
        console.log('Cross-session link needs confirmation', JSON.stringify({ state_user: st.user_id, browser_user: user.id }));
        return Response.json({ confirm_needed: true });
      }
    }

    // Idempotent replay: a second call on the same state returns the same landing path.
    if (st.result) return Response.json({ redirect: st.result });

    const resultPath = await computeOnce(b, st, user.id, code);
    return Response.json({ redirect: resultPath });
  } catch (e) {
    console.error('discordLinkComplete error', e);
    return Response.json({ error: e && e.message ? e.message : 'Something went wrong.' }, { status: 500 });
  }
}