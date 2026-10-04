import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

import { sessionUser } from '../../shared/session.ts';
import {
  getMemberByUserId, changePoints, withMemberLock, withRecordLock, randInt, UserError, errorResponse
} from '../../shared/points.ts';
import { postSystem, GUILD_CHANNEL } from '../../shared/chat.ts';
import { announceRaffle } from '../../shared/discordPost.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';

// Raffles: the Guild Leader sets prizes, a ticket price and an end time.
// Members buy tickets with points; each ticket is one slice of the wheel.
// When the timer runs out the next visitor triggers the draw: one winner per
// prize (a member can win only once), and the ticket pot can go to first place.

const iso = (ms: number) => new Date(ms).toISOString();

async function tickets(b, raffleId) {
  const { items } = await b.asServiceRole.entities.RaffleTicket.filter({ raffle_id: raffleId }, { limit: 1000 });
  return items.filter((t) => t.count > 0).sort((a, c) => (a.member_id < c.member_id ? -1 : 1));
}

async function draw(b, raffleId) {
  return withRecordLock(b, 'Raffle', raffleId, async () => {
    const r = await b.asServiceRole.entities.Raffle.get(raffleId);
    if (r.status !== 'open') return r;
    const pool = await tickets(b, raffleId);
    const winners = [];
    const remaining = [...pool];
    for (let i = 0; i < (r.prizes || []).length; i++) {
      const total = remaining.reduce((a, t) => a + t.count, 0);
      if (total === 0) break;
      let pick = randInt(total);
      let idx = 0;
      for (; idx < remaining.length; idx++) {
        pick -= remaining[idx].count;
        if (pick < 0) break;
      }
      const w = remaining.splice(idx, 1)[0];
      const points = i === 0 && r.pot_to_first ? r.pot || 0 : 0;
      winners.push({ place: i + 1, prize: r.prizes[i], member_id: w.member_id, name: w.name, avatar: w.avatar, tickets: w.count, points });
    }
    // Record the draw BEFORE paying the pot so it can never be drawn or paid twice.
    const updated = await b.asServiceRole.entities.Raffle.update(r.id, { status: 'drawn', winners, drawn_at: iso(Date.now()) });
    for (const w of winners) {
      if (w.points > 0) {
        await withMemberLock(b, w.member_id, () => changePoints(b, w.member_id, w.points, 'raffle', `Raffle won: ${r.title}`, null));
      }
    }
    if (winners.length) {
      const list = winners.map((w) => `${w.place}. ${w.name} (${w.prize}${w.points ? ` + ${w.points} points` : ''})`).join(', ');
      await postSystem(b, GUILD_CHANNEL, `Raffle "${r.title}" drawn! ${list}`);
      const withIds = [];
      for (const w of winners) {
        const m = await b.asServiceRole.entities.Member.get(w.member_id).catch(() => null);
        withIds.push({ ...w, discord_id: m ? m.discord_id : '' });
      }
      await announceRaffle(r.title, withIds);
    } else {
      await postSystem(b, GUILD_CHANNEL, `Raffle "${r.title}" ended with no tickets sold.`);
    }
    return updated;
  }, 120000);
}

async function refundAll(b, r) {
  const pool = await tickets(b, r.id);
  for (const t of pool) {
    const amount = t.count * r.ticket_price;
    await withMemberLock(b, t.member_id, () => changePoints(b, t.member_id, amount, 'raffle', `Raffle cancelled, refund: ${r.title}`, null));
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
    const leader = me.role === 'leader';

    if (p.action === 'list') {
      // Draw any raffle whose time is up.
      const { items: due } = await b.asServiceRole.entities.Raffle.filter({ status: 'open', ends_at: { $lte: iso(Date.now()) } }, { limit: 10 });
      for (const r of due) await draw(b, r.id);
      const [open, past] = await Promise.all([
        b.asServiceRole.entities.Raffle.filter({ status: 'open' }, { sort: 'ends_at', limit: 10 }),
        b.asServiceRole.entities.Raffle.filter({ status: 'drawn' }, { sort: '-drawn_at', limit: 6 })
      ]);
      const all = [...open.items, ...past.items];
      const withTickets = await Promise.all(
        all.map(async (r) => {
          const pool = await tickets(b, r.id);
          const mine = pool.find((t) => t.member_id === me.id);
          return { ...r, lock_token: undefined, lock_until: undefined, entrants: pool.map((t) => ({ member_id: t.member_id, name: t.name, avatar: t.avatar, role: t.role, count: t.count })), my_tickets: mine ? mine.count : 0 };
        })
      );
      return Response.json({ raffles: withTickets, me: me.id, server_now: iso(Date.now()) });
    }

    if (p.action === 'buy') {
      const count = Math.floor(Number(p.count));
      if (!Number.isInteger(count) || count < 1 || count > 1000) throw new UserError('Buy between 1 and 1000 tickets.');
      if (me.banned) throw new UserError('You are banned from the games.', 403);
      const out = await withRecordLock(b, 'Raffle', String(p.raffleId), async () => {
        const r = await b.asServiceRole.entities.Raffle.get(String(p.raffleId));
        if (r.status !== 'open' || Date.parse(r.ends_at) <= Date.now()) throw new UserError('Ticket sales for this raffle have closed.');
        const { items } = await b.asServiceRole.entities.RaffleTicket.filter({ raffle_id: r.id, member_id: me.id }, { limit: 1 });
        const have = items[0] ? items[0].count : 0;
        if (r.max_tickets_per_member > 0 && have + count > r.max_tickets_per_member) {
          throw new UserError(`You can hold up to ${r.max_tickets_per_member} tickets (${r.max_tickets_per_member - have} left).`);
        }
        const cost = count * r.ticket_price;
        const { balance } = await withMemberLock(b, me.id, () => changePoints(b, me.id, -cost, 'raffle', `Raffle tickets x${count}: ${r.title}`, null));
        if (items[0]) await b.asServiceRole.entities.RaffleTicket.update(items[0].id, { count: have + count, name: me.discord_name, avatar: me.avatar_url || '', role: me.role });
        else await b.asServiceRole.entities.RaffleTicket.create({ raffle_id: r.id, member_id: me.id, name: me.discord_name || me.discord_id, avatar: me.avatar_url || '', role: me.role, count });
        await b.asServiceRole.entities.Raffle.update(r.id, { pot: (r.pot || 0) + cost, tickets_sold: (r.tickets_sold || 0) + count });
        return { balance, tickets: have + count };
      });
      return Response.json({ ok: true, ...out });
    }

    // ----- Guild Leader controls -----
    if (!leader && ['create', 'cancel', 'drawNow'].includes(p.action)) throw new UserError('Only the Guild Leader can run raffles.', 403);

    if (p.action === 'create') {
      const title = String(p.title || '').trim().slice(0, 60);
      const price = Math.floor(Number(p.ticket_price));
      const max = Math.max(0, Math.floor(Number(p.max_tickets_per_member) || 0));
      const ends = Date.parse(String(p.ends_at || ''));
      const prizes = (Array.isArray(p.prizes) ? p.prizes : String(p.prizes || '').split('\n'))
        .map((x) => String(x).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 10);
      if (!title) throw new UserError('Give the raffle a name.');
      if (!(price >= 1)) throw new UserError('Set a ticket price of at least 1 point.');
      if (!Number.isFinite(ends) || ends < Date.now() + 60000) throw new UserError('Pick an end time at least a minute from now.');
      if (ends > Date.now() + 60 * 24 * 3600000) throw new UserError('A raffle can run for up to 60 days.');
      if (!prizes.length) throw new UserError('Add at least one prize.');
      const r = await b.asServiceRole.entities.Raffle.create({
        title, status: 'open', ticket_price: price, max_tickets_per_member: max, ends_at: iso(ends), prizes,
        pot_to_first: p.pot_to_first !== false, pot: 0, tickets_sold: 0, winners: [], created_by: me.id
      });
      await postSystem(b, GUILD_CHANNEL, `New raffle: "${title}". Tickets cost ${price} points. Top prize: ${prizes[0]}.`);
      return Response.json({ ok: true, raffle: r });
    }

    if (p.action === 'drawNow') {
      const r = await draw(b, String(p.raffleId));
      return Response.json({ ok: true, raffle: r });
    }

    if (p.action === 'cancel') {
      await withRecordLock(b, 'Raffle', String(p.raffleId), async () => {
        const r = await b.asServiceRole.entities.Raffle.get(String(p.raffleId));
        if (r.status !== 'open') throw new UserError('Only an open raffle can be cancelled.');
        // Close the raffle BEFORE refunding so it can't be cancelled or drawn twice.
        await b.asServiceRole.entities.Raffle.update(r.id, { status: 'cancelled' });
        await refundAll(b, r);
        await postSystem(b, GUILD_CHANNEL, `Raffle "${r.title}" was cancelled. Everyone's tickets were refunded.`);
      }, 120000);
      return Response.json({ ok: true });
    }

    throw new UserError('Unknown raffle action.');
  } catch (e) {
    return errorResponse(e);
  }
}