import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getMemberByUserId, changePoints, withMemberLock, withRecordLock, randInt, UserError, errorResponse
} from '../../shared/points.ts';
import { postSystem, GUILD_CHANNEL } from '../../shared/chat.ts';
import { announceRaffle, announceRaffleOpen, announceRaffleResults, announceWebhookUrl } from '../../shared/discordPost.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import {
  checkCode, assertNewCode, codeFields, runStockLocked, takeFromStock, assignAndDeliver
} from '../../shared/prizeCodes.ts';
import { resilient } from '../../shared/points.ts';

// Raffles: the Guild Leader sets prizes, a ticket price and an end time.
// Members buy tickets with points; each ticket is one slice of the wheel.
// When the timer runs out the draw runs (from the "Raffle Draws" schedule every few
// minutes, or from the next visit, whichever comes first): one winner per prize (a
// member can win only once), and the ticket pot can go to first place.
// Each prize has a kind: 'points' (paid automatically, written like "150 points"),
// 'code' (a prize code such as a GP code, sent privately to the winner only) or 'item'
// (handed out in game by the Guild Leader). Codes are never stored on the Raffle row,
// which members can read: they live in PrizeCode rows (see shared/prizeCodes.ts).

const iso = (ms: number) => new Date(ms).toISOString();
// Shared secret only the scheduled "Raffle Draws" workflow knows.
const WORKFLOW_SECRET = '95c1addabf7f6562301524d5181e2e6b28ccef8dff38ef48';
const MAX_PRIZE_POINTS = 10000000;

// "150 points", "1,500 pts", "+200 guild points" -> the number; anything else -> 0.
function prizePoints(label: string): number {
  const m = String(label || '').match(/^\s*\+?\s*(\d[\d,]*)\s*(?:guild\s+)?(?:points?|pts?)\.?\s*$/i);
  if (!m) return 0;
  const v = Number(m[1].replace(/,/g, ''));
  return Number.isInteger(v) && v > 0 && v <= MAX_PRIZE_POINTS ? v : 0;
}

const KINDS = ['item', 'points', 'code'];
// The kind of prize `i`. Raffles made before kinds existed: "150 points" is points.
function kindOf(r, i: number) {
  const k = Array.isArray(r.prize_kinds) ? r.prize_kinds[i] : '';
  if (KINDS.includes(k)) return k;
  return prizePoints((r.prizes || [])[i]) > 0 ? 'points' : 'item';
}

const PrizeCodes = (b) => b.asServiceRole.entities.PrizeCode;
async function reservedFor(b, raffleId: string) {
  return (await PrizeCodes(b).filter({ raffle_id: raffleId, status: 'reserved' }, { limit: 20 })).items;
}
// Codes set aside for a raffle that won't be given go back to the stock.
async function releaseToStock(b, rows) {
  for (const row of rows) await PrizeCodes(b).update(row.id, { status: 'stock', source: '', raffle_id: '', raffle_title: '', place: 0 }).catch(() => {});
}
// A code being swapped out for another: one taken from stock goes back there; one typed
// in for this raffle is forgotten (it may have been the mistake being fixed).
async function discardReserved(b, rows) {
  for (const row of rows) {
    if (row.source === 'stock') await releaseToStock(b, [row]);
    else await PrizeCodes(b).delete(row.id).catch(() => {});
  }
}
// Set aside a code for prize `place` of raffle `r`: a typed code, or the oldest stock code
// with the prize's name. Call inside runStockLocked.
async function reserveCode(b, r, place: number, spec, by: string) {
  const label = r.prizes[place - 1];
  if (spec && spec.from_stock === true) {
    const s = await takeFromStock(b, label);
    if (!s) throw new UserError(`No "${label}" codes left in stock. Add some in the admin hall, or type the code.`);
    return PrizeCodes(b).update(s.id, { status: 'reserved', source: 'stock', raffle_id: r.id, raffle_title: r.title, place });
  }
  const code = checkCode(spec && spec.code);
  await assertNewCode(b, code);
  return PrizeCodes(b).create({ ...(await codeFields(code)), label, status: 'reserved', source: 'typed', raffle_id: r.id, raffle_title: r.title, place, added_by: by });
}

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
      const kind = kindOf(r, i);
      const prize_points = kind === 'points' ? prizePoints(r.prizes[i]) : 0;
      const pot_points = i === 0 && r.pot_to_first ? r.pot || 0 : 0;
      winners.push({ place: i + 1, prize: r.prizes[i], kind, member_id: w.member_id, name: w.name, avatar: w.avatar, tickets: w.count, prize_points, pot_points, points: prize_points + pot_points, paid: false, ...(kind === 'code' ? { code_status: 'pending' } : {}) });
    }
    // Record the draw BEFORE paying so it can never be drawn or paid twice.
    let updated = await b.asServiceRole.entities.Raffle.update(r.id, { status: 'drawn', winners, drawn_at: iso(Date.now()) });
    let anyPaid = false;
    for (const w of winners) {
      if (w.points > 0) {
        try {
          await withMemberLock(b, w.member_id, () => changePoints(b, w.member_id, w.points, 'raffle', `Raffle won (${w.prize}): ${r.title}`, null));
          w.paid = true;
          anyPaid = true;
        } catch (e) {
          console.error('raffle payout failed', r.id, w.member_id, w.points, String(e));
        }
      }
    }
    // Code prizes: give each winner the code set aside for their place (sent privately to
    // them only). A place nobody won puts its code back in the stock.
    const reserved = await reservedFor(b, r.id);
    const members = {};
    for (const w of winners) members[w.member_id] = await b.asServiceRole.entities.Member.get(w.member_id).catch(() => null);
    const saveWinners = async () => { updated = await b.asServiceRole.entities.Raffle.update(r.id, { winners }).catch(() => updated); };
    if (anyPaid) await saveWinners();
    const won = new Set(winners.map((w) => w.place));
    await releaseToStock(b, reserved.filter((x) => !won.has(Number(x.place))));
    for (const w of winners) {
      if (w.kind !== 'code') continue;
      const row = reserved.find((x) => Number(x.place) === w.place);
      const m = members[w.member_id];
      if (row && !m) {
        // The winner's account is gone: their code goes back to stock.
        await releaseToStock(b, [row]);
        w.code_status = 'returned';
        await saveWinners();
        continue;
      }
      if (!row) continue;
      try {
        await assignAndDeliver(b, row, m, { source: 'raffle', raffle_id: r.id, raffle_title: r.title, place: w.place, reason: '' });
        w.code_status = 'delivered';
      } catch (e) {
        console.error('raffle code delivery failed', r.id, w.place, String(e && e.message || e));
      }
      // Saved straight after each delivery, so a slow or cut-short draw never leaves a
      // delivered code looking undelivered.
      await saveWinners();
    }
    if (winners.length) {
      const list = winners.map((w) => `${w.place}. ${w.name} (${w.prize}${w.pot_points ? ` + ${w.pot_points} points pot` : ''})`).join(', ');
      await postSystem(b, GUILD_CHANNEL, `Raffle "${r.title}" drawn! ${list}`);
      const withIds = winners.map((w) => ({ ...w, discord_id: members[w.member_id] ? members[w.member_id].discord_id : '' }));
      await announceRaffle(r.title, withIds);
      await announceRaffleResults(r.title, withIds);
    } else {
      await postSystem(b, GUILD_CHANNEL, `Raffle "${r.title}" ended with no tickets sold.`);
      await announceRaffleResults(r.title, []);
    }
    return updated;
  }, 300000);
}

// Draw every raffle whose time is up. One that fails (busy) is tried again next time.
async function drawDue(b) {
  const { items: due } = await b.asServiceRole.entities.Raffle.filter({ status: 'open', ends_at: { $lte: iso(Date.now()) } }, { limit: 10 });
  let drawn = 0;
  for (const r of due) {
    try { await draw(b, r.id); drawn++; } catch (e) { console.log('raffle draw postponed', r.id, String(e && e.message || e)); }
  }
  return drawn;
}

// Refund every ticket. One member's refund failing doesn't stop the others; it is logged.
async function refundAll(b, r) {
  const pool = await tickets(b, r.id);
  let failed = 0;
  for (const t of pool) {
    const amount = t.count * r.ticket_price;
    try {
      await withMemberLock(b, t.member_id, () => changePoints(b, t.member_id, amount, 'raffle', `Raffle cancelled, refund: ${r.title}`, null));
    } catch (e) {
      failed++;
      console.error('raffle refund failed', r.id, t.member_id, amount, String(e && e.message || e));
    }
  }
  return failed;
}

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    let p; try { p = await req.clone().json(); } catch { p = {}; }

    // The "Raffle Draws" schedule: draws raffles whose time is up, even if nobody visits.
    if (p.action === 'sweep') {
      if (p.__wf_secret !== WORKFLOW_SECRET) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
      const drawn = await drawDue(b);
      return Response.json({ ok: true, drawn });
    }

    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    if (p.action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');
    const leader = me.role === 'leader';

    if (p.action === 'list') {
      // Draw any raffle whose time is up. If another visitor is drawing it right now this
      // page still loads (showing "Drawing"), and picks up the result on its next refresh.
      await drawDue(b);
      const [open, past] = await Promise.all([
        b.asServiceRole.entities.Raffle.filter({ status: 'open' }, { sort: 'ends_at', limit: 10 }),
        b.asServiceRole.entities.Raffle.filter({ status: 'drawn' }, { sort: '-drawn_at', limit: 6 })
      ]);
      const all = [...open.items, ...past.items];
      const withTickets = await Promise.all(
        all.map(async (r) => {
          const pool = await tickets(b, r.id);
          const mine = pool.find((t) => t.member_id === me.id);
          const out = { ...r, lock_token: undefined, lock_until: undefined, entrants: pool.map((t) => ({ member_id: t.member_id, name: t.name, avatar: t.avatar, role: t.role, count: t.count })), my_tickets: mine ? mine.count : 0 };
          // The Guild Leader sees which code prizes have a code ready: the last 4 characters only.
          if (leader && (r.prizes || []).some((_, i) => kindOf(r, i) === 'code')) {
            const rows = (await PrizeCodes(b).filter({ raffle_id: r.id }, { limit: 20 })).items;
            out.code_slots = (r.prizes || []).map((_, i) => {
              if (kindOf(r, i) !== 'code') return null;
              const row = rows.find((x) => Number(x.place) === i + 1 && (x.status === 'reserved' || x.status === 'assigned'));
              return { place: i + 1, last4: row ? row.last4 : '', status: row ? row.status : '', dm_status: row ? row.dm_status || '' : '' };
            });
          }
          return out;
        })
      );
      return Response.json({ raffles: withTickets, me: me.id, server_now: iso(Date.now()), discord_announce: leader ? !!announceWebhookUrl() : undefined });
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
        let { balance } = await withMemberLock(b, me.id, () => changePoints(b, me.id, -cost, 'raffle', `Raffle tickets x${count}: ${r.title}`, null));
        try {
          if (items[0]) await b.asServiceRole.entities.RaffleTicket.update(items[0].id, { count: have + count, name: me.discord_name, avatar: me.avatar_url || '', role: me.role });
          else await b.asServiceRole.entities.RaffleTicket.create({ raffle_id: r.id, member_id: me.id, name: me.discord_name || me.discord_id, avatar: me.avatar_url || '', role: me.role, count });
        } catch (e) {
          // The tickets couldn't be saved: hand the points straight back.
          console.error('raffle ticket save failed, refunding', r.id, me.id, String(e));
          ({ balance } = await withMemberLock(b, me.id, () => changePoints(b, me.id, cost, 'raffle', `Refund, tickets not saved: ${r.title}`, null)));
          throw new UserError("Your tickets couldn't be saved, so your points were returned. Try again.");
        }
        await b.asServiceRole.entities.Raffle.update(r.id, { pot: (r.pot || 0) + cost, tickets_sold: (r.tickets_sold || 0) + count });
        return { balance, tickets: have + count };
      });
      return Response.json({ ok: true, ...out });
    }

    // ----- Guild Leader controls -----
    if (!leader && ['create', 'cancel', 'drawNow', 'announce', 'setPrizeCode'].includes(p.action)) throw new UserError('Only the Guild Leader can run raffles.', 403);

    if (p.action === 'announce') {
      if (!announceWebhookUrl()) throw new UserError('Discord announcements are not connected yet. Add the DISCORD_ANNOUNCE_WEBHOOK_URL secret first.');
      const r = await b.asServiceRole.entities.Raffle.get(String(p.raffleId));
      if (r.status !== 'open') throw new UserError('Only an open raffle can be posted.');
      if (r.announced_at && Date.now() - Date.parse(r.announced_at) < 60000) throw new UserError('It was just posted. Wait a minute before posting again.');
      const ok = await announceRaffleOpen(r, p.ping === true);
      if (!ok) throw new UserError("Discord didn't accept the post. Check the announcements webhook and try again.");
      const at = iso(Date.now());
      await b.asServiceRole.entities.Raffle.update(r.id, { announced_at: at });
      return Response.json({ ok: true, announced_at: at });
    }

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
      const rawPrizes = Array.isArray(p.prizes) ? p.prizes : [];
      // Kinds and codes line up with the prizes as sent (blank prize lines are dropped).
      const keep = rawPrizes.length ? rawPrizes.map((x, i) => (String(x).trim() ? i : -1)).filter((i) => i >= 0).slice(0, 10) : prizes.map((_, i) => i);
      const kinds = keep.map((i) => (Array.isArray(p.prize_kinds) && KINDS.includes(p.prize_kinds[i]) ? p.prize_kinds[i] : (prizePoints(prizes[keep.indexOf(i)]) > 0 ? 'points' : 'item')));
      const specs = keep.map((i) => (Array.isArray(p.prize_codes) ? p.prize_codes[i] || null : null));
      kinds.forEach((k, i) => {
        if (k === 'points' && !prizePoints(prizes[i])) throw new UserError(`Write the ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'][i]} prize as a number of points, like "150 points".`);
      });
      // Check typed codes before anything is saved.
      const typed = new Set();
      for (let i = 0; i < kinds.length; i++) {
        const sp = specs[i];
        if (kinds[i] !== 'code' || !sp || sp.from_stock === true || !String(sp.code || '').trim()) continue;
        const code = checkCode(sp.code);
        if (typed.has(code.toUpperCase())) throw new UserError('The same code is used for two prizes.');
        typed.add(code.toUpperCase());
      }
      const r = await runStockLocked(b, async () => {
        const made = await b.asServiceRole.entities.Raffle.create({
          title, status: 'pending', ticket_price: price, max_tickets_per_member: max, ends_at: iso(ends), prizes, prize_kinds: kinds,
          pot_to_first: p.pot_to_first !== false, pot: 0, tickets_sold: 0, winners: [], created_by: me.id
        });
        const done = [];
        try {
          for (let i = 0; i < kinds.length; i++) {
            const sp = specs[i];
            if (kinds[i] !== 'code' || !sp || (sp.from_stock !== true && !String(sp.code || '').trim())) continue;
            done.push(await reserveCode(b, made, i + 1, sp, me.id));
          }
        } catch (e) {
          // Undo: nothing is half-made.
          await discardReserved(b, done);
          await b.asServiceRole.entities.Raffle.delete(made.id).catch(() => {});
          throw e;
        }
        // Only now can tickets be bought: nothing can be lost to a rollback.
        return b.asServiceRole.entities.Raffle.update(made.id, { status: 'open' });
      });
      await postSystem(b, GUILD_CHANNEL, `New raffle: "${title}". Tickets cost ${price} points. Top prize: ${prizes[0]}.`);
      let announced = false;
      if (p.announce === true && announceWebhookUrl()) {
        announced = await announceRaffleOpen(r, p.ping === true);
        if (announced) await b.asServiceRole.entities.Raffle.update(r.id, { announced_at: iso(Date.now()) }).catch(() => {});
      }
      return Response.json({ ok: true, raffle: r, announced });
    }

    // Add or change the code for a code prize. Before the draw it is set aside for that
    // place; after the draw (a winner whose code wasn't ready) it is sent to them at once.
    if (p.action === 'setPrizeCode') {
      const place = Math.floor(Number(p.place));
      const result = await withRecordLock(b, 'Raffle', String(p.raffleId), async () => {
        const r = await b.asServiceRole.entities.Raffle.get(String(p.raffleId)).catch(() => null);
        if (!r) throw new UserError('Raffle not found.', 404);
        if (!(place >= 1 && place <= (r.prizes || []).length) || kindOf(r, place - 1) !== 'code') throw new UserError('That prize is not a code prize.');
        const wantsNew = p.from_stock === true || !!String(p.code || '').trim();
        if (r.status === 'open') {
          if (!wantsNew) throw new UserError('Type the code, or take one from stock.');
          return runStockLocked(b, async () => {
            const old = (await reservedFor(b, r.id)).filter((x) => Number(x.place) === place);
            // Reserve the new one first, so a mistake leaves the old code in place.
            if (p.from_stock !== true) { const c = checkCode(p.code); await assertNewCode(b, c); }
            const row = await reserveCode(b, r, place, { code: p.code, from_stock: p.from_stock === true }, me.id);
            await discardReserved(b, old);
            return { last4: row.last4, status: 'reserved' };
          });
        }
        if (r.status !== 'drawn') throw new UserError('This raffle was cancelled.');
        const winners = Array.isArray(r.winners) ? r.winners.map((w) => ({ ...w })) : [];
        const w = winners.find((x) => x.place === place);
        if (!w) throw new UserError('Nobody won that prize.');
        if (w.code_status === 'returned') throw new UserError("The winner's account is gone, so their code went back to stock.");
        // Already sent (even if the raffle row didn't record it): never send a second code.
        const sentRow = (await PrizeCodes(b).filter({ raffle_id: r.id, status: 'assigned' }, { limit: 20 })).items.find((x) => Number(x.place) === place);
        if (sentRow) {
          if (w.code_status !== 'delivered') { w.code_status = 'delivered'; await b.asServiceRole.entities.Raffle.update(r.id, { winners }); }
          throw new UserError(`That winner already has their code (ends in ${sentRow.last4}). To fix a wrong code, use Replace in the admin hall, Prize codes.`);
        }
        if (w.code_status === 'delivered') throw new UserError('That winner already has a code. To fix a wrong code, use Replace in the admin hall, Prize codes.');
        const member = await b.asServiceRole.entities.Member.get(w.member_id).catch(() => null);
        if (!member) throw new UserError('The winner was not found.');
        const row = await runStockLocked(b, async () => {
          if (wantsNew) {
            const old = (await reservedFor(b, r.id)).filter((x) => Number(x.place) === place);
            const row = await reserveCode(b, r, place, { code: p.code, from_stock: p.from_stock === true }, me.id);
            await discardReserved(b, old);
            return row;
          }
          const waiting = (await reservedFor(b, r.id)).find((x) => Number(x.place) === place);
          if (!waiting) throw new UserError('Type the code, or take one from stock.');
          return waiting;
        });
        const given = await assignAndDeliver(b, row, member, { source: 'raffle', raffle_id: r.id, raffle_title: r.title, place, reason: '' });
        w.code_status = 'delivered';
        await b.asServiceRole.entities.Raffle.update(r.id, { winners });
        return { last4: given.last4, status: 'assigned', dm_status: given.dm_status };
      }, 60000);
      return Response.json({ ok: true, ...result });
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
        await releaseToStock(b, await reservedFor(b, r.id));
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