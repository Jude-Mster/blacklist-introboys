import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getSettings, getMemberByUserId, getMemberByDiscordId, changePoints } from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const caller = await getMemberByUserId(b, user.id);
    if (!caller) return Response.json({ error: 'Discord account not linked.' }, { status: 400 });
    if (!['officer', 'leader'].includes(caller.role)) return Response.json({ error: 'Not authorized.' }, { status: 403 });

    let payload; try { payload = await req.json(); } catch { payload = {}; }
    const { discordId, amount, reason } = payload;
    const amt = Math.floor(Number(amount));
    if (!Number.isInteger(amt) || amt === 0) return Response.json({ error: 'Amount must be a non-zero whole number.' }, { status: 400 });
    if (!reason || !String(reason).trim()) return Response.json({ error: 'Reason is required.' }, { status: 400 });
    if (caller.role === 'officer' && amt < 0) return Response.json({ error: 'Officers can only award points.' }, { status: 403 });

    const target = await getMemberByDiscordId(b, String(discordId));
    if (!target) return Response.json({ error: 'Member not found.' }, { status: 404 });

    if (caller.role === 'officer' && amt > 0) {
      const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { items } = await b.asServiceRole.entities.PointLog.filter(
        { by_member_id: caller.id, source: 'award', amount: { $gt: 0 }, created_date: { $gte: start } },
        { limit: 500 }
      );
      const totalAwarded = items.reduce((s, l) => s + l.amount, 0);
      const settings = await getSettings(b);
      if (totalAwarded + amt > settings.award_cap_per_day)
        return Response.json({ error: 'Daily award cap reached.' }, { status: 400 });
    }

    const { balance } = await changePoints(b, target.id, amt, 'award', String(reason).trim(), caller.id);
    return Response.json({ ok: true, balance });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}