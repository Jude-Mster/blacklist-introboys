import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, houseEdge, todayStr,
  resolveCoinFlip, resolveDragonDice, resolveLanternSlots, resolveSkyWheel, resolveRoulette, validRouletteBet,
  WHEEL_SEGMENTS, UserError, errorResponse
} from '../../shared/points.ts';
import { GAME_NAMES } from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

const GAME_LABEL = GAME_NAMES;

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) throw new UserError('Log in first.', 401);
    let payload; try { payload = await req.json(); } catch { payload = {}; }
    const { game, wager, choice } = payload;
    if (payload.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const found = await getMemberByUserId(b, user.id);
    if (!found) throw new UserError('Link your Discord account first.');

    const settings = await getSettings(b);
    if (!Array.isArray(settings.games_enabled) || !settings.games_enabled.includes(game))
      throw new UserError('This game is closed right now.');
    const edge = houseEdge(settings);

    if (game === 'poker') throw new UserError('Poker is played at the tables.');

    // Roulette: the wager is the total of every chip on the board.
    let rouletteBets = null;
    if (game === 'roulette') {
      const raw = Array.isArray(choice && choice.bets) ? choice.bets : [];
      if (raw.length === 0) throw new UserError('Place at least one chip.');
      if (raw.length > 40) throw new UserError('Too many separate bets. Use bigger chips.');
      rouletteBets = raw.map((x) => ({ type: x.type, value: x.value, amount: Math.floor(Number(x.amount)) }));
      if (!rouletteBets.every((x) => validRouletteBet(x) && Number.isInteger(x.amount) && x.amount > 0)) {
        throw new UserError('One of those bets is not valid.');
      }
    }

    const w = rouletteBets ? rouletteBets.reduce((t, x) => t + x.amount, 0) : Math.floor(Number(wager));
    if (!Number.isInteger(w) || w < 1) throw new UserError('Enter a wager.');
    if (w < settings.min_bet) throw new UserError(`The minimum wager is ${settings.min_bet}${rouletteBets ? ' in total' : ''}.`);
    if (w > settings.max_bet) throw new UserError(`The maximum wager is ${settings.max_bet}${rouletteBets ? ' in total' : ''}.`);

    // Validate the pick before taking the lock.
    let resolve;
    if (game === 'coinflip') {
      if (!['heads', 'tails'].includes(choice)) throw new UserError('Pick Yang or Yin.');
      resolve = () => resolveCoinFlip(w, choice, edge);
    } else if (game === 'dragondice') {
      const target = Math.floor(Number(choice && choice.target));
      const direction = choice && choice.direction;
      if (!['over', 'under'].includes(direction)) throw new UserError('Pick over or under.');
      if (!Number.isInteger(target) || target < 2 || target > 98) throw new UserError('The target must be between 2 and 98.');
      resolve = () => resolveDragonDice(w, target, direction, edge);
    } else if (game === 'lanternslots') {
      resolve = () => resolveLanternSlots(w, edge);
    } else if (game === 'skywheel') {
      if (!WHEEL_SEGMENTS.includes(choice)) throw new UserError('Pick a faction.');
      resolve = () => resolveSkyWheel(w, choice, edge);
    } else if (game === 'roulette') {
      resolve = () => resolveRoulette(rouletteBets);
    } else {
      throw new UserError('Unknown game.');
    }

    const result = await withMemberLock(b, found.id, async () => {
      // Re-read inside the lock so the checks use the latest balance.
      const member = await b.asServiceRole.entities.Member.get(found.id);
      if (member.banned) throw new UserError('You are banned from the games.', 403);
      if (w > (member.points || 0)) throw new UserError('Not enough points for that wager.');

      const today = todayStr();
      const usedToday = member.daily_bet_date === today ? (member.daily_bet_total || 0) : 0;
      if (usedToday + w > settings.daily_bet_cap) {
        const left = Math.max(0, settings.daily_bet_cap - usedToday);
        throw new UserError(left ? `Daily wager limit: ${left} left today.` : 'Daily wager limit reached. It resets at 00:00 UTC.');
      }

      const r = resolve();
      const net = r.payout - w;
      const { balance } = await changePoints(b, member.id, net, 'game', `${GAME_LABEL[game]} ${r.won ? 'win' : 'loss'}`, null);
      await b.asServiceRole.entities.Member.update(member.id, { daily_bet_total: usedToday + w, daily_bet_date: today });
      await b.asServiceRole.entities.Bet.create({
        member_id: member.id,
        discord_id: member.discord_id,
        game,
        wager: w,
        payout: r.payout,
        won: r.won,
        outcome: r.outcome
      });
      await postFeed(b, member, { game, game_name: GAME_LABEL[game], wager: w, payout: r.payout, detail: feedDetail(game, r.outcome) });
      return { ...r, balance, wager: w, net, wageredToday: usedToday + w };
    });

    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
function feedDetail(game, o) {
  switch (game) {
    case 'coinflip': return `Called ${o.choice === 'tails' ? 'Yin' : 'Yang'}, landed ${o.side === 'tails' ? 'Yin' : 'Yang'}`;
    case 'dragondice': return `Rolled ${o.roll}, ${o.direction} ${o.target}`;
    case 'lanternslots': return (o.reels || []).join(' ');
    case 'skywheel': return `Backed ${o.pick}, landed ${o.landed}`;
    case 'roulette': return `Ball on ${o.number}`;
    default: return '';
  }
}