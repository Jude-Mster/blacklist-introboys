import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, getMemberByDiscordId, changePoints, withMemberLock,
  awardedLast24h, UserError, errorResponse
} from '../../shared/points.ts';
import { announcePoints } from '../../shared/discordPost.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    const caller = await getMemberByUserId(b, user.id);
    if (!caller) throw new UserError('Link your Discord first.');
    if (!['officer', 'leader'].includes(caller.role)) throw new UserError('Only officers and the leader can award points.', 403);

    let payload; try { payload = await req.json(); } catch { payload = {}; }
    if (payload.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });
    const { discordId, amount, reason } = payload;
    const amt = Math.floor(Number(amount));
    if (!Number.isInteger(amt) || amt === 0) throw new UserError('Enter a whole number other than 0.');
    const why = String(reason || '').trim();
    if (!why) throw new UserError('Add a reason so members know what the points were for.');
    if (caller.role === 'officer' && amt < 0) throw new UserError('Only the leader can take points away.', 403);

    const target = await getMemberByDiscordId(b, String(discordId));
    if (!target) throw new UserError('Member not found.', 404);

    if (caller.role === 'officer') {
      const settings = await getSettings(b);
      const used = await awardedLast24h(b, caller.id);
      if (used + amt > settings.award_cap_per_day) {
        const left = Math.max(0, settings.award_cap_per_day - used);
        throw new UserError(`Award cap reached. You can give ${left} more in the next 24 hours.`);
      }
    }

    const { balance } = await withMemberLock(b, target.id, () =>
      changePoints(b, target.id, amt, 'award', why, caller.id)
    );
    await announcePoints(target, amt, balance, why, caller.discord_name || '');
    return Response.json({ ok: true, balance, name: target.discord_name || target.discord_id });
  } catch (e) {
    return errorResponse(e);
  }
}