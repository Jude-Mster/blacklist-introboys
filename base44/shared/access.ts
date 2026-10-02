import { secrets } from 'base44:runtime';

// Only members holding this Discord role may use the site. It can be changed
// (or cleared, to allow everyone in the server) in Admin hall -> Guild settings.
export const DEFAULT_MEMBER_ROLE_ID = '1309724734203887647';
const RECHECK_MS = 30 * 60 * 1000;

export function requiredRoleId(settings) {
  const v = settings && settings.member_role_id;
  return v === undefined || v === null ? DEFAULT_MEMBER_ROLE_ID : String(v).trim();
}

function secret(name: string) {
  try { return String(secrets.get(name) || '').trim(); } catch { return ''; }
}

// Ask Discord (as the bot) whether this person still holds the role.
// Returns true / false, or null when Discord couldn't be asked (leave things as they are).
export async function hasRoleNow(settings, discordId: string) {
  const roleId = requiredRoleId(settings);
  if (!roleId) return true;
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
    if (res.status === 404) return false; // left the server
    if (!res.ok) return null;
    const m = await res.json();
    return Array.isArray(m.roles) && m.roles.map(String).includes(roleId);
  } catch {
    return null;
  }
}

// Re-check a linked member now and then, and record the result on their Member row.
// Leaders are never locked out.
export async function refreshAccess(b, settings, member, force = false) {
  if (!member || member.role === 'leader') {
    if (member && member.no_access) return await b.asServiceRole.entities.Member.update(member.id, { no_access: false });
    return member;
  }
  if (!requiredRoleId(settings)) {
    if (member.no_access) return await b.asServiceRole.entities.Member.update(member.id, { no_access: false });
    return member;
  }
  const last = member.access_checked_at ? Date.parse(member.access_checked_at) : 0;
  if (!force && Date.now() - last < RECHECK_MS) return member;
  const ok = await hasRoleNow(settings, member.discord_id);
  if (ok === null) return member;
  return await b.asServiceRole.entities.Member.update(member.id, { no_access: !ok, access_checked_at: new Date().toISOString() });
}