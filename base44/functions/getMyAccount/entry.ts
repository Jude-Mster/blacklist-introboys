import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getMemberRecordByUserId, getSettings, errorResponse, isAppAdmin } from '../../shared/points.ts';
import { refreshAccess } from '../../shared/access.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

const PUBLIC_MEMBER_FIELDS = [
  'id', 'discord_id', 'discord_name', 'discord_username', 'avatar_url', 'points', 'role',
  'daily_claimed_at', 'daily_bet_total', 'daily_bet_date', 'banned', 'created_date'
];

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Log in first.' }, { status: 401 });

    let p; try { p = await req.json(); } catch { p = {}; }
    const [found, settings] = await Promise.all([getMemberRecordByUserId(b, user.id), getSettings(b)]);
    let member = found;
    // The app owner is always the Guild Leader, even if they linked before that rule existed.
    if (member && member.role !== 'leader' && (await isAppAdmin(b, user.id))) {
      member = await b.asServiceRole.entities.Member.update(member.id, { role: 'leader' });
    }
    // Keep access in step with the member's Discord role.
    if (member) member = await refreshAccess(b, settings, member, !!(p && p.recheck) && !!member.no_access);
    if (member && member.no_access) {
      return Response.json({ linked: false, denied: 'no_role', setup: { guild_configured: true }, invite_url: settings.discord_invite_url || '', version: BACKEND_VERSION });
    }
    const setup = { guild_configured: !!String(settings.guild_id || '').trim() };
    if (!member) return Response.json({ linked: false, setup, invite_url: settings.discord_invite_url || '' });

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
      version: BACKEND_VERSION
    });
  } catch (e) {
    return errorResponse(e);
  }
}