import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getSettings, getMemberByUserId, UserError, errorResponse } from '../../shared/points.ts';
import { GUILD_CHANNEL, postToDiscord } from '../../shared/chat.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

// Copy a guild-chat message into the linked Discord channel (optional).
// Set the secret DISCORD_CHAT_WEBHOOK_URL to a channel webhook to turn it on.
async function relayToDiscord(me, text) {
  await postToDiscord(text, { username: `${(me.discord_name || 'Member').slice(0, 60)} (site)`, avatarUrl: me.avatar_url });
}

const MAX_LEN = 300;
const MIN_GAP_MS = 1200;

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');

    let p; try { p = await req.json(); } catch { p = {}; }
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });
    const settings = await getSettings(b);
    if (settings.chat_enabled === false) throw new UserError('Chat is turned off right now.');

    if (p.action === 'delete') {
      if (!['officer', 'leader'].includes(me.role)) throw new UserError('Only the Guild Leader and Vice Guild Members can remove messages.', 403);
      const msg = await b.asServiceRole.entities.ChatMessage.get(String(p.id));
      if (!msg) throw new UserError('Message not found.', 404);
      await b.asServiceRole.entities.ChatMessage.update(msg.id, { deleted: true, text: '' });
      return Response.json({ ok: true });
    }

    // send
    if (me.banned) throw new UserError("You can't chat while banned.", 403);
    const channel = String(p.channel || GUILD_CHANNEL);
    if (channel !== GUILD_CHANNEL) {
      const m = /^table:([A-Za-z0-9_-]{1,64})$/.exec(channel);
      if (!m) throw new UserError('Unknown chat channel.');
      // Make sure the table exists.
      await b.asServiceRole.entities.PokerTable.get(m[1]).catch(() => {
        throw new UserError('That table no longer exists.');
      });
    }
    const text = String(p.text || '').replace(/\s+/g, ' ').trim();
    if (!text) throw new UserError('Type a message first.');
    if (text.length > MAX_LEN) throw new UserError(`Keep messages under ${MAX_LEN} characters.`);

    const { items: recent } = await b.asServiceRole.entities.ChatMessage.filter(
      { member_id: me.id },
      { sort: '-created_date', limit: 1, fields: ['created_date'] }
    );
    if (recent[0] && Date.now() - Date.parse(recent[0].created_date) < MIN_GAP_MS) {
      throw new UserError('Slow down a little.', 429);
    }

    const msg = await b.asServiceRole.entities.ChatMessage.create({
      channel,
      member_id: me.id,
      discord_id: me.discord_id,
      name: me.discord_name || me.discord_id,
      avatar: me.avatar_url || '',
      role: me.role,
      text,
      kind: 'user',
      deleted: false
    });
    if (channel === GUILD_CHANNEL) await relayToDiscord(me, text);
    return Response.json({ ok: true, message: msg });
  } catch (e) {
    return errorResponse(e);
  }
}