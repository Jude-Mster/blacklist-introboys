import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, randInt, GAME_NAMES, UserError, errorResponse
} from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { postSystem, GUILD_CHANNEL } from '../../shared/chat.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

// 1v1 Yin Yang Toss. The creator puts up a wager and calls a side; anyone can
// accept by matching it. The coin decides who takes both stakes. No house cut.
const OPEN_MINUTES = 30;
const MAX_OPEN_PER_MEMBER = 3;
const NAME = GAME_NAMES.coinflip;
const sideName = (s) => (s === 'tails' ? 'Yin' : 'Yang');

// Refund challenges nobody took in time.
async function expireOld(b) {
  const { items } = await b.asServiceRole.entities.CoinDuel.filter({ status: 'open', expires_at: { $lte: new Date().toISOString() } }, { limit: 50 });
  for (const d of items) {
    await withRecordLock(b, 'CoinDuel', d.id, async () => {
      const cur = await b.asServiceRole.entities.CoinDuel.get(d.id);
      if (cur.status !== 'open') return;
      await b.asServiceRole.entities.CoinDuel.update(d.id, { status: 'expired', resolved_at: new Date().toISOString() });
      await withMemberLock(b, cur.creator_id, () => changePoints(b, cur.creator_id, cur.wager, 'duel', `${NAME} duel expired, refund`, null));
    }).catch((e) => console.error('expire failed', e));
  }
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');
    const settings = await getSettings(b);
    if (!(settings.games_enabled || []).includes('coinflip')) throw new UserError('Yin Yang Toss is closed right now.');

    if (p.action === 'list') {
      await expireOld(b);
      const [open, done] = await Promise.all([
        b.asServiceRole.entities.CoinDuel.filter({ status: 'open' }, { sort: '-created_date', limit: 30 }),
        b.asServiceRole.entities.CoinDuel.filter({ status: 'done' }, { sort: '-resolved_at', limit: 12 })
      ]);
      return Response.json({ open: open.items, recent: done.items, me: me.id });
    }

    if (p.action === 'create') {
      const wager = Math.floor(Number(p.wager));
      const side = p.side === 'tails' ? 'tails' : 'heads';
      const cap = settings.duel_max_wager > 0 ? settings.duel_max_wager : settings.max_bet;
      if (!Number.isInteger(wager) || wager < settings.min_bet || wager > cap) throw new UserError(`Duel stakes are ${settings.min_bet} to ${cap}.`);
      const { items: mineOpen } = await b.asServiceRole.entities.CoinDuel.filter({ status: 'open', creator_id: me.id }, { limit: 10 });
      if (mineOpen.length >= MAX_OPEN_PER_MEMBER) throw new UserError(`You can have ${MAX_OPEN_PER_MEMBER} open challenges at once.`);
      const duel = await withMemberLock(b, me.id, async () => {
        const member = await b.asServiceRole.entities.Member.get(me.id);
        if (member.banned) throw new UserError('You are banned from the games.', 403);
        if (wager > member.points) throw new UserError('Not enough points for that stake.');
        await changePoints(b, member.id, -wager, 'duel', `${NAME} duel stake`, null);
        return b.asServiceRole.entities.CoinDuel.create({
          status: 'open', wager, creator_id: member.id, creator_name: member.discord_name || member.discord_id,
          creator_avatar: member.avatar_url || '', creator_side: side,
          expires_at: new Date(Date.now() + OPEN_MINUTES * 60000).toISOString()
        });
      });
      await postSystem(b, GUILD_CHANNEL, `${me.discord_name} challenges anyone to a ${wager}-point Yin Yang duel. They call ${sideName(side)}.`);
      return Response.json({ ok: true, duel });
    }

    if (p.action === 'cancel') {
      const duel = await withRecordLock(b, 'CoinDuel', String(p.id), async () => {
        const d = await b.asServiceRole.entities.CoinDuel.get(String(p.id));
        if (d.creator_id !== me.id) throw new UserError('Only the challenger can cancel.', 403);
        if (d.status !== 'open') throw new UserError('Someone already accepted this duel.');
        await b.asServiceRole.entities.CoinDuel.update(d.id, { status: 'cancelled', resolved_at: new Date().toISOString() });
        await withMemberLock(b, me.id, () => changePoints(b, me.id, d.wager, 'duel', `${NAME} duel cancelled, refund`, null));
        return d;
      });
      return Response.json({ ok: true, refund: duel.wager });
    }

    if (p.action === 'accept') {
      const result = await withRecordLock(b, 'CoinDuel', String(p.id), async () => {
        const d = await b.asServiceRole.entities.CoinDuel.get(String(p.id));
        if (d.status !== 'open') throw new UserError('This duel is no longer open.');
        if (d.creator_id === me.id) throw new UserError("You can't accept your own challenge.");
        if (Date.parse(d.expires_at) <= Date.now()) throw new UserError('This challenge has expired.');

        // Take the acceptor's stake first; if that fails nothing else happens.
        await withMemberLock(b, me.id, async () => {
          const member = await b.asServiceRole.entities.Member.get(me.id);
          if (member.banned) throw new UserError('You are banned from the games.', 403);
          if (d.wager > member.points) throw new UserError('Not enough points to match this stake.');
          await changePoints(b, member.id, -d.wager, 'duel', `${NAME} duel stake`, null);
        });

        const side = randInt(2) === 0 ? 'heads' : 'tails';
        const creatorWins = side === d.creator_side;
        const winnerId = creatorWins ? d.creator_id : me.id;
        const winnerName = creatorWins ? d.creator_name : me.discord_name;
        const pot = d.wager * 2;
        // Close the duel BEFORE paying the pot, so it can never be cancelled, expired
        // or accepted again after someone has already been paid.
        const updated = await b.asServiceRole.entities.CoinDuel.update(d.id, {
          status: 'done', acceptor_id: me.id, acceptor_name: me.discord_name || me.discord_id, acceptor_avatar: me.avatar_url || '',
          result_side: side, winner_id: winnerId, winner_name: winnerName, resolved_at: new Date().toISOString()
        });
        await withMemberLock(b, winnerId, () => changePoints(b, winnerId, pot, 'duel', `${NAME} duel won`, null));
        return { duel: updated, side, winnerId, pot, creatorWins };
      });
      const d = result.duel;
      const creator = { id: d.creator_id, discord_name: d.creator_name, avatar_url: d.creator_avatar };
      const acceptor = { id: me.id, discord_name: me.discord_name, avatar_url: me.avatar_url, role: me.role };
      const detail = `Duel: ${d.creator_name} vs ${d.acceptor_name}, landed ${sideName(result.side)}`;
      await postFeed(b, creator, { game: 'coinflip', game_name: `${NAME} duel`, wager: d.wager, payout: result.creatorWins ? result.pot : 0, detail });
      await postFeed(b, acceptor, { game: 'coinflip', game_name: `${NAME} duel`, wager: d.wager, payout: result.creatorWins ? 0 : result.pot, detail });
      await postSystem(b, GUILD_CHANNEL, `${d.winner_name} wins the ${result.pot}-point Yin Yang duel against ${result.creatorWins ? d.acceptor_name : d.creator_name}.`);
      return Response.json({ ok: true, duel: d, won: result.winnerId === me.id });
    }

    throw new UserError('Unknown duel action.');
  } catch (e) {
    return errorResponse(e);
  }
}