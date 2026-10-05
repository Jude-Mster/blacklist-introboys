import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getMemberByUserId, errorResponse } from '../../shared/points.ts';
import { resilient } from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) return Response.json({ error: 'Link your Discord first.' }, { status: 401 });
    const me = await getMemberByUserId(b, user.id);
    if (!me) return Response.json({ error: 'Link your Discord first.' }, { status: 403 });
    const { items } = await b.asServiceRole.entities.Member.filter(
      { banned: false },
      { sort: '-points', limit: 20, fields: ['discord_id', 'discord_name', 'avatar_url', 'points', 'role'] }
    );
    return Response.json({ leaderboard: items });
  } catch (e) {
    return errorResponse(e);
  }
}