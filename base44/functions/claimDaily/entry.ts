import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getSettings, getMemberByUserId, changePoints, randInt } from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const member = await getMemberByUserId(b, user.id);
    if (!member) return Response.json({ error: 'Discord account not linked.' }, { status: 400 });
    if (member.banned) return Response.json({ error: 'You are banned.' }, { status: 403 });

    const last = member.daily_claimed_at ? new Date(member.daily_claimed_at) : null;
    if (last && (Date.now() - last.getTime()) < 24 * 60 * 60 * 1000) {
      return Response.json({ error: 'Daily reward already claimed. Come back tomorrow.' }, { status: 400 });
    }

    const settings = await getSettings(b);
    const prizes = Array.isArray(settings.daily_wheel_prizes) && settings.daily_wheel_prizes.length
      ? settings.daily_wheel_prizes : [100];
    const prize = prizes[randInt(prizes.length)];
    const { balance } = await changePoints(b, member.id, prize, 'daily', 'Daily wheel reward', null);
    await b.asServiceRole.entities.Member.update(member.id, { daily_claimed_at: new Date().toISOString() });
    return Response.json({ prize, balance });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}