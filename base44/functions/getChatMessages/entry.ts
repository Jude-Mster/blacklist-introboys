import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getMemberByUserId, errorResponse } from '../../shared/points.ts';

// Members-only read of chat messages. ChatMessage is read:false, so the only way
// to load them is through this function, which requires a linked member.
export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) return Response.json({ error: 'Link your Discord first.' }, { status: 401 });
    const me = await getMemberByUserId(b, user.id);
    if (!me) return Response.json({ error: 'Link your Discord first.' }, { status: 403 });
    let p; try { p = await req.json(); } catch { p = {}; }
    const channel = String(p.channel || 'guild');
    const limit = Math.min(Math.max(Number(p.limit) || 40, 1), 120);
    const { items } = await b.asServiceRole.entities.ChatMessage.filter({ channel }, { sort: '-created_date', limit });
    return Response.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}