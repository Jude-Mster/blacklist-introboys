import { secrets } from 'base44:runtime';
import { destroyMemberSessions } from './session.ts';

// Only members holding this Discord role may use the site. An empty/cleared
// member_role_id always falls back to this default — never "anyone in the server".
export const DEFAULT_MEMBER_ROLE_ID = '1309724734203887647';
const RECHECK_MS = 30 * 60 * 1000;

export function requiredRoleId(settings) {
  const v = settings && settings.member_role_id;
  if (v === undefined || v === null) return DEFAULT_MEMBER_ROLE_ID;
  const s = String(v).trim();
  return s || DEFAULT_MEMBER_ROLE_ID;
}

function secret(name: string) {
  try { return String(secrets.get(name) || '').trim(); } catch { return ''; }
}

// Ask Discord (as the bot) whether this person still holds the role.
// Returns true / false, or null when Discord couldn't be asked (leave things as they are).
export async function hasRoleNow(settings, discordId: string) {
  const roleId = requiredRoleId(settings);
  const guildId = String(settings.guild_id || secret('DISCORD_GUILD_ID') || '').trim();
  const token = secret('DISCORD_BOT_TOKEN');
  if (!guildId || !token) return null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: ctl.signal
    });
    clearTimeout(timer);
    if (res.status === 404) {
      // A 404 on the member can mean the user left OR the bot can't see the guild.
      // Disambiguate: if the bot can't reach the guild at all, we can't decide → null.
      const gRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
        headers: { Authorization: `Bot ${token}` }
      });
      if (!gRes.ok) return null;
      return false; // bot is in the guild, the user is not → left the server
    }
    if (!res.ok) return null;
    const m = await res.json();
    return Array.isArray(m.roles) && m.roles.map(String).includes(roleId);
  } catch {
    return null;
  }
}

// Re-check a linked member now and then, and record the result on their Member row.
// Leaders are never locked out. Never changes no_access when Discord couldn't be asked.
export async function refreshAccess(b, settings, member, force = false) {
  if (!member || member.role === 'leader') {
    if (member && member.no_access) return await b.asServiceRole.entities.Member.update(member.id, { no_access: false });
    return member;
  }
  const last = member.access_checked_at ? Date.parse(member.access_checked_at) : 0;
  if (!force && Date.now() - last < RECHECK_MS) return member;
  const ok = await hasRoleNow(settings, member.discord_id);
  if (ok === null) return member;
  return await b.asServiceRole.entities.Member.update(member.id, { no_access: !ok, access_checked_at: new Date().toISOString() });
}

// Mark no_access on every non-leader Member row matching a Discord id OR a site user id.
// Used when a relink ends in not_in_guild / no_role — they've lost (or never had) access.
export async function markAccessDenied(b, { discordId, userId }: { discordId?: string; userId?: string }) {
  const or: any[] = [];
  if (discordId) or.push({ discord_id: String(discordId) });
  if (userId) or.push({ user_id: String(userId) });
  if (or.length === 0) return;
  const { items } = await b.asServiceRole.entities.Member.filter(
    { $or: or, role: { $ne: 'leader' } },
    { limit: 50 }
  );
  const now = new Date().toISOString();
  for (const m of items) {
    await b.asServiceRole.entities.Member.update(m.id, { no_access: true, access_checked_at: now });
    await destroyMemberSessions(b, m.id);
  }
}