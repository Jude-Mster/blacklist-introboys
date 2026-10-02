import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';

function secret(name: string) {
  try {
    const v = secrets.get(name);
    return v ? String(v).trim() : '';
  } catch {
    return '';
  }
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Log in first.' }, { status: 401 });

    const clientId = secret('DISCORD_CLIENT_ID');
    const redirectUri = secret('DISCORD_REDIRECT_URI');
    const missing = [!clientId && 'DISCORD_CLIENT_ID', !redirectUri && 'DISCORD_REDIRECT_URI'].filter(Boolean);
    if (missing.length) {
      return Response.json({ error: `Discord login isn't set up yet: missing ${missing.join(' and ')} in the app secrets.` }, { status: 500 });
    }

    // Clear this user's old, unused states so the table doesn't grow forever.
    const { items: old } = await b.asServiceRole.entities.OAuthState.filter({ user_id: user.id }, { limit: 20 });
    await Promise.all(old.map((s) => b.asServiceRole.entities.OAuthState.delete(s.id).catch(() => {})));

    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await b.asServiceRole.entities.OAuthState.create({ state, user_id: user.id, expires_at: expiresAt });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds guilds.members.read',
      state
    });
    return Response.json({ url: `https://discord.com/oauth2/authorize?${params.toString()}` });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}