import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser, POLL_REUSE_MS } from '../../shared/session.ts';
import { getMemberByUserId, errorResponse, rankedMembers } from '../../shared/points.ts';
import { resilient } from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    // 6.44: the board is a look, and it is refreshed on a timer: reuse the member row this copy read a
    // moment ago instead of reading it again for every refresh.
    const user = await sessionUser(b, req, POLL_REUSE_MS);
    if (!user) return Response.json({ error: 'Link your Discord first.' }, { status: 401 });
    const me = await getMemberByUserId(b, user.id);
    if (!me) return Response.json({ error: 'Link your Discord first.' }, { status: 403 });
    // The board is read when it is opened, not on a timer, so it is never shared: a member who
    // regains their role must appear on it straight away.
    const items = await rankedMembers(b, 20, ['discord_id', 'discord_name', 'avatar_url', 'points', 'role']);
    return Response.json({ leaderboard: items });
  } catch (e) {
    return errorResponse(e);
  }
}