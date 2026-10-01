import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getMemberByUserId } from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const member = await getMemberByUserId(b, user.id);
    if (!member) return Response.json({ linked: false });
    const [logs, bets] = await Promise.all([
      b.asServiceRole.entities.PointLog.filter({ member_id: member.id }, { sort: '-created_date', limit: 20 }),
      b.asServiceRole.entities.Bet.filter({ member_id: member.id }, { sort: '-created_date', limit: 10 })
    ]);
    return Response.json({ linked: true, member, recentLogs: logs.items, recentBets: bets.items });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}