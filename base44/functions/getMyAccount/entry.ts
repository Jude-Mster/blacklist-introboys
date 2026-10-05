import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getSettings, errorResponse } from '../../shared/points.ts';
import { refreshAccess } from '../../shared/access.ts';
import { sessionUser, destroyMemberSessions } from '../../shared/session.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

const PUBLIC_MEMBER_FIELDS = [
  'id', 'discord_id', 'discord_name', 'discord_username', 'avatar_url', 'points', 'role',
  'daily_claimed_at', 'daily_bet_total', 'daily_bet_date', 'banned', 'created_date'
];

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) return Response.json({ error: 'Link your Discord first.' }, { status: 401 });

    const settings = await getSettings(b, true);
    // Keep access in step with the member's Discord role.
    const member = await refreshAccess(b, settings, user.member, false);
    if (!member || member.no_access) {
      // Lost the guild role or left the server: sign them out everywhere.
      await destroyMemberSessions(b, user.id);
      return Response.json({ linked: false, denied: 'no_role', invite_url: settings.discord_invite_url || '', version: BACKEND_VERSION });
    }
    const setup = { guild_configured: !!String(settings.guild_id || '').trim() };

    const [logs, bets, above] = await Promise.all([
      b.asServiceRole.entities.PointLog.filter({ member_id: member.id }, { sort: '-created_date', limit: 50 }),
      b.asServiceRole.entities.Bet.filter({ member_id: member.id }, { sort: '-created_date', limit: 50 }),
      b.asServiceRole.entities.Member.filter(
        { banned: false, points: { $gt: member.points || 0 } },
        { limit: 1000, fields: ['id'] }
      )
    ]);

    const safe = Object.fromEntries(PUBLIC_MEMBER_FIELDS.map((k) => [k, member[k]]));
    const betItems = bets.items || [];
    const stats = betItems.reduce(
      (s, x) => ({
        played: s.played + 1,
        wins: s.wins + (x.won ? 1 : 0),
        net: s.net + (x.payout - x.wager),
        best: Math.max(s.best, x.payout - x.wager)
      }),
      { played: 0, wins: 0, net: 0, best: 0 }
    );

    return Response.json({
      linked: true,
      setup,
      member: safe,
      rank: (above.items || []).length + 1,
      stats,
      recentLogs: logs.items,
      recentBets: betItems,
      // Settings are no longer readable directly; members get them here.
      settings,
      version: BACKEND_VERSION
    });
  } catch (e) {
    return errorResponse(e);
  }
}