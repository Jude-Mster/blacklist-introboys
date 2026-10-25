import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser, POLL_REUSE_MS } from '../../shared/session.ts';
import { getMemberByUserId, errorResponse } from '../../shared/points.ts';
import { resilient } from '../../shared/points.ts';
import { memo } from '../../shared/memo.ts';

// Members-only read of the public game feed. GameFeed is read:false, so the only
// way to see it is through this function, which requires a linked member.
export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    // 6.44: the feed is a look, refreshed on a timer: reuse the member row this copy read a moment ago
    // instead of reading it again for every refresh.
    const user = await sessionUser(b, req, POLL_REUSE_MS);
    if (!user) return Response.json({ error: 'Link your Discord first.' }, { status: 401 });
    const me = await getMemberByUserId(b, user.id);
    if (!me) return Response.json({ error: 'Link your Discord first.' }, { status: 403 });
    let p; try { p = await req.json(); } catch { p = {}; }
    const limit = Math.min(Math.max(Number(p.limit) || 14, 1), 50);
    // 6.45: the feed is read once for everyone looking at this moment instead of once per viewer.
    const items = await memo(`feed:${limit}`, 5000, async () => (await b.asServiceRole.entities.GameFeed.filter({}, { sort: '-created_date', limit })).items);
    return Response.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}