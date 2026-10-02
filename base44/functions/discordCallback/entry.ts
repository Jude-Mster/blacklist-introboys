import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings } from '../../shared/points.ts';
import { requiredRoleId } from '../../shared/access.ts';

const DISCORD_API = 'https://discord.com/api/v10';

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
    // Discord's default avatar for accounts without one.
    const idx = Number((BigInt(me.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  const ext = me.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.${ext}?size=128`;
}

// Is this Base44 user the app owner/admin? The owner always gets in as leader,
// so a wrong or missing guild ID can never lock them out of the admin page.
async function isAppAdmin(b, userId) {
  try {
    const u = await b.asServiceRole.entities.User.get(userId);
    return u && u.role === 'admin';
  } catch {
    return false;
  }
}

export default async function(req) {
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

  // No app domain configured at all -> we can't safely redirect. Return a friendly
  // HTML page instead of sending the browser to the dispatcher worker.
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
    if (u.searchParams.get('error')) return fail('cancelled'); // user pressed Cancel on Discord
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state');
    if (!code || !state) {
      // Direct visit to the callback URL with no Discord code/state. Browsers get
      // a friendly redirect to the linking page; programmatic callers get JSON.
      if (isBrowser) return fail('state');
      return Response.json({ error: 'Missing code or state.' }, { status: 400 });
    }

    const { items } = await b.asServiceRole.entities.OAuthState.filter({ state }, { limit: 1 });
    if (items.length === 0) return fail('state');
    const st = items[0];
    await b.asServiceRole.entities.OAuthState.delete(st.id);
    if (new Date(st.expires_at) < new Date()) return fail('state');

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
    // Discord IDs are 17-20 digit strings. Always compare them as text.
    const guildId = String(settings.guild_id || secret('DISCORD_GUILD_ID') || '').trim();
    const myGuild = Array.isArray(guilds) ? guilds.find((g) => String(g.id) === guildId) : null;
    const admin = await isAppAdmin(b, st.user_id);

    if (!myGuild && !admin) {
      console.log('Guild check failed', JSON.stringify({
        configured_guild_id: guildId || '(not set)',
        user_guild_ids: Array.isArray(guilds) ? guilds.map((g) => String(g.id)) : guilds,
        discord_user: me.id
      }));
      return fail(guildId ? 'not_in_guild' : 'guild_not_set');
    }

    const isGuildOwner = !!(myGuild && myGuild.owner);

    // Members must hold the guild role. The app owner and the server owner always get in.
    const roleId = requiredRoleId(settings);
    if (roleId && !admin && !isGuildOwner) {
      const mRes = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, auth);
      if (mRes.status === 429) return fail('busy');
      const gm = mRes.ok ? await mRes.json() : null;
      const roles = gm && Array.isArray(gm.roles) ? gm.roles.map(String) : [];
      if (!roles.includes(roleId)) {
        console.log('Role check failed', JSON.stringify({ discord_user: me.id, required_role: roleId, status: mRes.status }));
        // If they linked before, lock that account until they get the role.
        const { items: prior } = await b.asServiceRole.entities.Member.filter({ discord_id: String(me.id) }, { limit: 1 });
        if (prior[0] && prior[0].role !== 'leader') {
          await b.asServiceRole.entities.Member.update(prior[0].id, { no_access: true, access_checked_at: new Date().toISOString() });
        }
        return fail('no_role');
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

    // Unlink this Base44 user from any other Discord account they linked before.
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

    // First leader to log in fills in the guild ID automatically when it's blank
    // and they came through a guild they own.
    if (!settings.guild_id && isGuildOwner) {
      await b.asServiceRole.entities.Settings.update(settings.id, { guild_id: guildId });
    }

    return back('/dashboard?linked=1');
  } catch (e) {
    console.error('Callback error', e);
    return fail('server');
  }
}