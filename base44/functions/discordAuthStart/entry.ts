import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings } from '../../shared/points.ts';
import { sha256Hex } from '../../shared/session.ts';

// Step 1 of "Continue with Discord". Anyone may call this (there is no account
// yet). It only creates a short-lived state and returns Discord's authorize URL.

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
    let p; try { p = await req.json(); } catch { p = {}; }

    const clientId = secret('DISCORD_CLIENT_ID');
    const redirectUri = secret('DISCORD_REDIRECT_URI');
    const missing = [!clientId && 'DISCORD_CLIENT_ID', !redirectUri && 'DISCORD_REDIRECT_URI'].filter(Boolean);
    if (missing.length) {
      return Response.json({ error: `Discord login isn't set up yet: missing ${missing.join(' and ')} in the app secrets.` }, { status: 500 });
    }

    const E = b.asServiceRole.entities.OAuthState;
    // Clear expired states so the table doesn't grow forever.
    try {
      const { items: old } = await E.filter({ expires_at: { $lt: new Date().toISOString() } }, { limit: 50 });
      await Promise.all(old.map((s) => E.delete(s.id).catch(() => {})));
    } catch { /* best effort */ }

    // The browser keeps a random nonce; we store only its hash. If the same
    // browser finishes the sign-in it can present the nonce again.
    const nonce = typeof p.nonce === 'string' && /^[a-f0-9]{32,64}$/.test(p.nonce) ? p.nonce : '';
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await E.create({ state, nonce_hash: nonce ? await sha256Hex(nonce) : '', expires_at: expiresAt });

    const settings = await getSettings(b);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds guilds.members.read',
      state
    });
    return Response.json({
      url: `https://discord.com/oauth2/authorize?${params.toString()}`,
      invite_url: settings.discord_invite_url || ''
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Could not start Discord linking.' }, { status: 500 });
  }
}