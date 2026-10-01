import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings } from '../../shared/points.ts';

function avatarUrl(me) {
  if (!me.avatar) return '';
  const ext = me.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.${ext}`;
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const u = new URL(req.url);
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state');
    if (!code || !state) return new Response('Missing code or state.', { status: 400 });

    const { items } = await b.asServiceRole.entities.OAuthState.filter({ state }, { limit: 1 });
    if (items.length === 0) return new Response('Invalid or expired state.', { status: 400 });
    const st = items[0];
    await b.asServiceRole.entities.OAuthState.delete(st.id);
    if (new Date(st.expires_at) < new Date()) return new Response('State expired. Please try again.', { status: 400 });

    const clientId = secrets.get('DISCORD_CLIENT_ID');
    const clientSecret = secrets.get('DISCORD_CLIENT_SECRET');
    const redirectUri = secrets.get('DISCORD_REDIRECT_URI');
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return new Response('Discord token exchange failed: ' + t, { status: 400 });
    }
    const token = await tokenRes.json();
    const accessToken = token.access_token;

    const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
    const me = await meRes.json();
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } });
    const guilds = await guildsRes.json();

    const settings = await getSettings(b);
    const inGuild = Array.isArray(guilds) && settings.guild_id && guilds.some(g => g.id === settings.guild_id);
    if (!inGuild) return new Response('You are not a member of the BLACKLIST INTROBOYS guild.', { status: 403 });

    const { items: existing } = await b.asServiceRole.entities.Member.filter({ discord_id: me.id }, { limit: 1 });
    if (existing.length > 0) {
      await b.asServiceRole.entities.Member.update(existing[0].id, {
        user_id: st.user_id,
        discord_name: me.username,
        avatar_url: avatarUrl(me)
      });
    } else {
      await b.asServiceRole.entities.Member.create({
        user_id: st.user_id,
        discord_id: me.id,
        discord_name: me.username,
        avatar_url: avatarUrl(me),
        points: 0,
        role: 'member',
        banned: false
      });
    }

    const origin = new URL(req.url).origin;
    return Response.redirect(origin + '/', 302);
  } catch (e) {
    return new Response('Callback error: ' + e.message, { status: 500 });
  }
}