import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser, destroySession } from '../../shared/session.ts';
import { resilient } from '../../shared/points.ts';

// Sign out: forget this device's session.
export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (user) await destroySession(b, user.session);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: true });
  }
}