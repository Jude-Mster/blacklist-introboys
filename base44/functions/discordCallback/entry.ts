import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings } from '../../shared/points.ts';
import { requiredRoleId } from '../../shared/access.ts';

const DISCORD_API = 'https://discord.com/api/v10';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function secret(name: string) {
  try {
    const v = secrets.get(name);
    return v ? String(v).trim() : '';
  } catch {
    return '';
  }
}

function avatarUrl(me) {
  if (!me.avatar) {
    const idx = Number((BigInt(me.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  const ext = me.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.${ext}?size=128`;
}

async function isAppAdmin(b, userId) {
  try {
    const u = await b.asServiceRole.entities.User.get(userId);
    return u && u.role === 'admin';
  } catch {
    return false;
  }
}

// Run the Discord flow once for a state and return the landing path it produced.
// Never throws for expected outcomes (non-member, rate limit) — those become
// /link-discord?error=... paths so they can be cached and replayed. Unexpected
// errors throw and the caller does NOT cache them (so the user can retry).
async function discordFlow(b, st, code): Promise<string> {
  const failPath = (c: string) => `/link-discord?error=${c}`;

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
    return failPath('token');
  }
  const { access_token: accessToken } = await tokenRes.json();
  const auth = { headers: { Authorization: `Bearer ${accessToken}` } };

  const [meRes, guildsRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, auth),
    fetch(`${DISCORD_API}/users/@me/guilds?limit=200`, auth)
  ]);
  if (!meRes.ok) return failPath('token');
  const me = await meRes.json();
  if (guildsRes.status === 429) return failPath('busy');
  const guilds = guildsRes.ok ? await guildsRes.json() : [];

  const settings = await getSettings(b);
  const guildId = String(settings.guild_id || secret('DISCORD_GUILD_ID') || '').trim();
  const myGuild = Array.isArray(guilds) ? guilds.find((g) => String(g.id) === guildId) : null;
  const admin = await isAppAdmin(b, st.user_id);

  if (!myGuild && !admin) {
    console.log('Guild check failed', JSON.stringify({
      configured_guild_id: guildId || '(not set)',
      user_guild_ids: Array.isArray(guilds) ? guilds.map((g) => String(g.id)) : guilds,
      discord_user: me.id
    }));
    return failPath(guildId ? 'not_in_guild' : 'guild_not_set');
  }

  const isGuildOwner = !!(myGuild && myGuild.owner);
  const roleId = requiredRoleId(settings);
  if (roleId && !admin && !isGuildOwner) {
    const mRes = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, auth);
    if (mRes.status === 429) return failPath('busy');
    const gm = mRes.ok ? await mRes.json() : null;
    const roles = gm && Array.isArray(gm.roles) ? gm.roles.map(String) : [];
    if (!roles.includes(roleId)) {
      console.log('Role check failed', JSON.stringify({ discord_user: me.id, required_role: roleId, status: mRes.status }));
      const { items: prior } = await b.asServiceRole.entities.Member.filter({ discord_id: String(me.id) }, { limit: 1 });
      if (prior[0] && prior[0].role !== 'leader') {
        await b.asServiceRole.entities.Member.update(prior[0].id, { no_access: true, access_checked_at: new Date().toISOString() });
      }
      return failPath('no_role');
    }
  }

  const profile = {
    no_access: false,
    access_checked_at: new Date().toISOString(),
    user_id: st.user_id,
    discord_name: me.global_name || me.username,
    discord_username: me.username,
    avatar_url: avatarUrl(me)
  };

  const { items: previous } = await b.asServiceRole.entities.Member.filter({ user_id: st.user_id }, { limit: 5 });
  for (const p of previous) {
    if (p.discord_id !== String(me.id)) await b.asServiceRole.entities.Member.update(p.id, { user_id: '' });
  }

  const { items: existing } = await b.asServiceRole.entities.Member.filter({ discord_id: String(me.id) }, { limit: 1 });
  if (existing.length > 0) {
    const m = existing[0];
    const promote = (admin || isGuildOwner) && m.role !== 'leader';
    await b.asServiceRole.entities.Member.update(m.id, { ...profile, ...(promote ? { role: 'leader' } : {}) });
  } else {
    await b.asServiceRole.entities.Member.create({
      ...profile,
      discord_id: String(me.id),
      points: 0,
      role: admin || isGuildOwner ? 'leader' : 'member',
      banned: false
    });
  }

  if (!settings.guild_id && isGuildOwner) {
    await b.asServiceRole.entities.Settings.update(settings.id, { guild_id: guildId });
  }

  return '/dashboard?linked=1';
}

// Compute the landing path for a state exactly once, guarded by a lock so two
// concurrent hits on the same state don't both spend the single-use Discord
// code. A second hit either finds the result already stored (replay) or waits
// for the first to finish, then replays.
async function computeOnce(b, st, code): Promise<string> {
  const E = b.asServiceRole.entities.OAuthState;
  const token = crypto.randomUUID();
  const LOCK_MS = 30000;

  const cur = await E.get(st.id);
  if (cur.result) return cur.result;

  const lockFree = !cur.lock_token || !cur.lock_until || Date.parse(cur.lock_until) < Date.now();
  if (!lockFree) {
    // Another invocation is processing. Wait for its result to appear.
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
    // Lost the race to another invocation; wait for its result.
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const c = await E.get(st.id);
      if (c.result) return c.result;
    }
    throw new Error('Discord linking is still processing. Try again in a moment.');
  }

  try {
    const path = await discordFlow(b, st, code);
    await E.update(st.id, {
      result: path,
      consumed_at: new Date().toISOString(),
      lock_token: '',
      lock_until: new Date(0).toISOString()
    });
    return path;
  } catch (e) {
    // Unexpected error: release the lock and do NOT cache, so the user can retry.
    await E.update(st.id, { lock_token: '', lock_until: new Date(0).toISOString() }).catch(() => {});
    throw e;
  }
}

export default async function(req) {
  // NOTE: never redirect to req.url.origin (dispatcher host) — see below.
  // Resolve the app's public origin. Prefer APP_URL (custom domain); otherwise
  // derive it from the registered Discord redirect URI, which is always the app
  // domain. NEVER fall back to req.url.origin — inside the dispatcher worker that
  // is the dispatcher's own host (base44-dispatcher…workers.dev), and redirecting
  // a browser there makes it hit the secret-protected dispatcher and get raw
  // {"error":"unauthorized","detail":"invalid dispatcher secret"} JSON.
  const redirectUri = secret('DISCORD_REDIRECT_URI');
  let appOrigin = secret('APP_URL');
  if (!appOrigin) {
    try { appOrigin = redirectUri ? new URL(redirectUri).origin : ''; } catch { appOrigin = ''; }
  }
  const appUrl = appOrigin.replace(/\/$/, '');

  if (!appUrl) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Discord linking isn't ready</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050505;color:#e8e8e8;font-family:system-ui,sans-serif;padding:1.5rem}.c{max-width:30rem;text-align:center;border:1px solid #3a3a3a;border-top:2px solid #C8161D;border-radius:6px;padding:2rem;background:#111}.c h1{font-size:1.15rem;margin:0 0 .6rem;color:#fff}.c p{color:#a8a8a8;font-size:.95rem;line-height:1.5;margin:0}</style></head>
<body><div class="c"><h1>Discord linking isn't ready yet</h1><p>The guild leader needs to finish Discord setup (app address + redirect URI) before linking works. Go back to the guild site and try again later.</p></div></body></html>`;
    return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const back = (path: string) => Response.redirect(appUrl + path, 302);
  const fail = (code: string) => back(`/link-discord?error=${code}`);
  const isBrowser = (req.headers.get('accept') || '').includes('text/html');

  try {
    const b = createClientFromRequest(req);
    const u = new URL(req.url);
    if (u.searchParams.get('error')) {
      return fail('cancelled');
    }
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state');
    if (!code || !state) {
      if (isBrowser) return fail('state');
      return Response.json({ error: 'Missing code or state.' }, { status: 400 });
    }

    const { items } = await b.asServiceRole.entities.OAuthState.filter({ state }, { limit: 1 });
    if (items.length === 0) {
      return fail('state');
    }
    const st = items[0];

    // Idempotent replay: a second hit on the same state returns the same landing
    // page as the first, instead of "expired".
    if (st.result) {
      return back(st.result);
    }

    if (new Date(st.expires_at) < new Date()) {
      return fail('state');
    }

    const resultPath = await computeOnce(b, st, code);
    return back(resultPath);
  } catch (e) {
    console.error('Callback error', e);
    return fail('server');
  }
}