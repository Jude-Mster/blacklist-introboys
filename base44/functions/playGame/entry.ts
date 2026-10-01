import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  getSettings, getMemberByUserId, changePoints,
  resolveCoinFlip, resolveDragonDice, resolveLanternSlots, todayStr
} from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    let payload; try { payload = await req.json(); } catch { payload = {}; }
    const { game, wager, choice } = payload;

    const member = await getMemberByUserId(b, user.id);
    if (!member) return Response.json({ error: 'Discord account not linked.' }, { status: 400 });
    if (member.banned) return Response.json({ error: 'You are banned from games.' }, { status: 403 });

    const settings = await getSettings(b);
    if (!Array.isArray(settings.games_enabled) || !settings.games_enabled.includes(game))
      return Response.json({ error: 'This game is not enabled.' }, { status: 400 });

    const w = Math.floor(Number(wager));
    if (!Number.isInteger(w) || w < 1) return Response.json({ error: 'Invalid wager.' }, { status: 400 });
    if (w < settings.min_bet) return Response.json({ error: `Minimum bet is ${settings.min_bet}.` }, { status: 400 });
    if (w > settings.max_bet) return Response.json({ error: `Maximum bet is ${settings.max_bet}.` }, { status: 400 });
    if (w > member.points) return Response.json({ error: 'Not enough points.' }, { status: 400 });

    const today = todayStr();
    const usedToday = member.daily_bet_date === today ? (member.daily_bet_total || 0) : 0;
    if (usedToday + w > settings.daily_bet_cap) return Response.json({ error: 'Daily limit reached.' }, { status: 400 });

    let result;
    if (game === 'coinflip') {
      if (!['heads', 'tails'].includes(choice)) return Response.json({ error: 'Choose heads or tails.' }, { status: 400 });
      result = resolveCoinFlip(w, choice, settings.house_edge_pct);
    } else if (game === 'dragondice') {
      const target = Math.floor(Number(choice && choice.target));
      const direction = choice && choice.direction;
      if (!['over', 'under'].includes(direction)) return Response.json({ error: 'Invalid direction.' }, { status: 400 });
      if (!Number.isInteger(target) || target < 2 || target > 98) return Response.json({ error: 'Target must be between 2 and 98.' }, { status: 400 });
      result = resolveDragonDice(w, target, direction, settings.house_edge_pct);
    } else if (game === 'lanternslots') {
      result = resolveLanternSlots(w, settings.house_edge_pct);
    } else {
      return Response.json({ error: 'Unknown game.' }, { status: 400 });
    }

    const net = result.payout - w;
    const { balance } = await changePoints(b, member.id, net, 'game', `${game} ${result.won ? 'win' : 'loss'}`, null);
    await b.asServiceRole.entities.Member.update(member.id, { daily_bet_total: usedToday + w, daily_bet_date: today });
    await b.asServiceRole.entities.Bet.create({
      member_id: member.id,
      discord_id: member.discord_id,
      game,
      wager: w,
      payout: result.payout,
      won: result.won,
      outcome: result.outcome
    });
    return Response.json({ won: result.won, payout: result.payout, outcome: result.outcome, balance });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}