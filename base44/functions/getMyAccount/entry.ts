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

// 6.15: the top bar refreshes the account often, so the plain call is light (member + settings).
// History, stats and rank are only read when a page asks for them ({ detail: true }).
// Rank comes from a short-lived per-instance list of balances instead of a scan on every call.
const RANK_CACHE_MS = Number((globalThis as any).__rankCacheMs ?? 60000);
let rankCache: { at: number; rows: any[] } | null = null;
async function rankOf(b, member) {
  if (!rankCache || Date.now() - rankCache.at >= RANK_CACHE_MS) {
    const { items } = await b.asServiceRole.entities.Member.filter(
      { banned: false }, { limit: 1000, fields: ['id', 'points', 'no_access'] }
    );
    rankCache = { at: Date.now(), rows: items || [] };
  }
  const mine = member.points || 0;
  return rankCache.rows.filter((m) => m.id !== member.id && !m.no_access && (m.points || 0) > mine).length + 1;
}

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) return Response.json({ error: 'Link your Discord first.' }, { status: 401 });

    let body: any = {};
    try { body = (await req.json()) || {}; } catch { body = {}; }
    const detail = body.detail === true;
    // { fresh: true } right after the leader saves settings; otherwise the short cache is fine.
    const settings = await getSettings(b, body.fresh === true || body.recheck === true);
    // Keep access in step with the member's Discord role.
    const member = await refreshAccess(b, settings, user.member, false);
    if (!member || member.no_access) {
      // Lost the guild role or left the server: sign them out everywhere.
      await destroyMemberSessions(b, user.id);
      return Response.json({ linked: false, denied: 'no_role', invite_url: settings.discord_invite_url || '', version: BACKEND_VERSION });
    }
    const setup = { guild_configured: !!String(settings.guild_id || '').trim() };

    const safe = Object.fromEntries(PUBLIC_MEMBER_FIELDS.map((k) => [k, member[k]]));
    const out: any = {
      linked: true,
      setup,
      member: safe,
      // Settings are no longer readable directly; members get them here.
      settings,
      version: BACKEND_VERSION
    };
    if (!detail) return Response.json(out);

    const [logs, bets, rank] = await Promise.all([
      b.asServiceRole.entities.PointLog.filter({ member_id: member.id }, { sort: '-created_date', limit: 50 }),
      b.asServiceRole.entities.Bet.filter({ member_id: member.id }, { sort: '-created_date', limit: 50 }),
      rankOf(b, member)
    ]);
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
    return Response.json({ ...out, detail: true, rank, stats, recentLogs: logs.items, recentBets: betItems });
  } catch (e) {
    return errorResponse(e);
  }
}