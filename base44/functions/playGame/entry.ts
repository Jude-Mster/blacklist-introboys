import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, houseEdge, todayStr,
  resolveCoinFlip, resolveDragonDice, resolveLanternSlots, resolveSkyWheel,
  WHEEL_SEGMENTS, UserError, errorResponse
} from '../../shared/points.ts';
import { GAME_NAMES } from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { resolveFortune } from '../../shared/fortune.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

const GAME_LABEL = GAME_NAMES;

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    let payload; try { payload = await req.json(); } catch { payload = {}; }
    const { game, wager, choice } = payload;
    if (payload.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const found = await getMemberByUserId(b, user.id);
    if (!found) throw new UserError('Link your Discord first.');

    const settings = await getSettings(b);
    if (!Array.isArray(settings.games_enabled) || !settings.games_enabled.includes(game))
      throw new UserError('This game is closed right now.');
    const edge = houseEdge(settings);

    if (game === 'poker') throw new UserError('Poker is played at the tables.');

    if (game === 'roulette') throw new UserError('Roulette is played at the shared table now.');
    if (game === 'dragondice') throw new UserError('Dragon Dice is now Dragon Sic Bo, played at the shared table.');
    const w = Math.floor(Number(wager));
    if (!Number.isInteger(w) || w < 1) throw new UserError('Enter a wager.');
    if (w < settings.min_bet) throw new UserError(`The minimum wager is ${settings.min_bet}.`);
    if (w > settings.max_bet) throw new UserError(`The maximum wager is ${settings.max_bet}.`);

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
    } else if (game === 'fortune') {
      resolve = () => resolveFortune(w, edge);
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
        // The slot's spin-by-spin record is only needed by the page; keep the saved row small.
        outcome: game === 'fortune' ? { free_spins: r.outcome.free_spins, multiplier: r.outcome.multiplier, best: r.outcome.best, spins: r.outcome.spins.length } : r.outcome
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
    case 'lanternslots': return (o.reels || []).join(" ");
    case 'skywheel': return `Backed ${o.pick}, landed ${o.landed}`;
    case 'fortune': return o.free_spins ? `${o.free_spins} free spins, ${o.multiplier}× the bet` : o.best ? `${o.best.count} ${o.best.symbol}${o.multiplier ? `, ${o.multiplier}×` : ''}` : 'No win';
    default: return "";
  }
}