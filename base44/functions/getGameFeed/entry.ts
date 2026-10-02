import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getMemberByUserId, errorResponse } from '../../shared/points.ts';

// Members-only read of the public game feed. GameFeed is read:false, so the only
// way to see it is through this function, which requires a linked member.
export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Log in first.' }, { status: 401 });
    const me = await getMemberByUserId(b, user.id);
    if (!me) return Response.json({ error: 'Link your Discord first.' }, { status: 403 });
    let p; try { p = await req.json(); } catch { p = {}; }
    const limit = Math.min(Math.max(Number(p.limit) || 14, 1), 50);
    const { items } = await b.asServiceRole.entities.GameFeed.filter({}, { sort: '-created_date', limit });
    return Response.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}