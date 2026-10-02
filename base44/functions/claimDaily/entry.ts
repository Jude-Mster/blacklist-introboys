import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getSettings, getMemberByUserId, changePoints, withMemberLock, randInt, UserError, errorResponse } from '../../shared/points.ts';

const DAY = 24 * 60 * 60 * 1000;

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Sign in with Discord first.', 401);
    const found = await getMemberByUserId(b, user.id);
    if (!found) throw new UserError('Sign in with Discord first.');

    const settings = await getSettings(b);
    const prizes = Array.isArray(settings.daily_wheel_prizes) && settings.daily_wheel_prizes.length
      ? settings.daily_wheel_prizes.map((n) => Math.floor(Number(n))).filter((n) => n > 0)
      : [100];

    const result = await withMemberLock(b, found.id, async () => {
      const member = await b.asServiceRole.entities.Member.get(found.id);
      if (member.banned) throw new UserError('You are banned.', 403);
      const last = member.daily_claimed_at ? Date.parse(member.daily_claimed_at) : 0;
      if (last && Date.now() - last < DAY) {
        throw new UserError('Already claimed. The wheel opens again 24 hours after your last spin.');
      }
      const index = randInt(prizes.length);
      const prize = prizes[index];
      const now = new Date().toISOString();
      // Mark the claim first so a retry can't claim twice.
      await b.asServiceRole.entities.Member.update(member.id, { daily_claimed_at: now });
      const { balance } = await changePoints(b, member.id, prize, 'daily', 'Daily wheel', null);
      return { prize, index, prizes, balance, next_at: new Date(Date.now() + DAY).toISOString() };
    });

    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}