import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings, getMemberByDiscordId } from '../../shared/points.ts';
import { GUILD_CHANNEL } from '../../shared/chat.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

// Receives messages from the Discord bridge bot (see /discord-bridge) and puts
// them into the website's guild chat. Protected by the BRIDGE_SECRET secret,
// which the bot sends in the X-Bridge-Secret header.

function same(a: string, c: string) {
  if (a.length !== c.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ c.charCodeAt(i);
  return diff === 0;
}

export default async function(req) {
  try {
    let p; try { p = await req.json(); } catch { p = {}; }
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    let expected = '';
    try { expected = secrets.get('BRIDGE_SECRET') || ''; } catch { expected = ''; }
    if (expected.length < 16) return Response.json({ error: 'Bridge is not set up: add BRIDGE_SECRET (16+ characters) to the app secrets.' }, { status: 503 });
    const given = req.headers.get('X-Bridge-Secret') || '';
    if (!same(given, expected)) return Response.json({ error: 'Wrong bridge secret.' }, { status: 401 });

    const b = resilient(createClientFromRequest(req));
    const settings = await getSettings(b);
    if (settings.chat_enabled === false) return Response.json({ ok: true, skipped: 'chat off' });

    const discordId = String(p.discord_id || '').slice(0, 32);
    const text = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!/^\d{5,32}$/.test(discordId) || !text) return Response.json({ ok: true, skipped: 'empty' });

    // Linked members keep their site name, avatar and rank.
    const member = await getMemberByDiscordId(b, discordId).catch(() => null);
    if (member && member.banned) return Response.json({ ok: true, skipped: 'banned' });
    const avatar = String(p.avatar || '');
    await b.asServiceRole.entities.ChatMessage.create({
      channel: GUILD_CHANNEL,
      member_id: member ? member.id : '',
      discord_id: discordId,
      name: (member && member.discord_name) || String(p.name || 'Discord member').slice(0, 40),
      avatar: (member && member.avatar_url) || (avatar.startsWith('https://cdn.discordapp.com/') ? avatar.slice(0, 300) : ''),
      role: member ? member.role : 'guest',
      text,
      kind: 'discord',
      deleted: false
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Bridge error.' }, { status: 500 });
  }
}