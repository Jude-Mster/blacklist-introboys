import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, UserError, errorResponse, nullSafe
} from '../../shared/points.ts';
import { act, forceFold, tick, newSeat, viewFor } from '../../shared/poker.ts';
import { postSystem, tableChannel, announceBigWin } from '../../shared/chat.ts';

const BETTING = ['preflop', 'flop', 'turn', 'river'];
const DEFAULT_TABLES = [
  { name: 'Jade Pavilion', small_blind: 5, big_blind: 10, min_buyin: 200, max_buyin: 2000 },
  { name: 'Dragon Peak', small_blind: 25, big_blind: 50, min_buyin: 1000, max_buyin: 10000 }
];
const PUBLIC_FIELDS = [
  'id', 'name', 'active', 'small_blind', 'big_blind', 'min_buyin', 'max_buyin', 'max_seats', 'seats', 'phase',
  'hand_no', 'dealer', 'turn', 'current_bet', 'min_raise', 'board', 'showdown', 'deadline', 'next_hand_at', 'log'
];

// Empty seats are stored as {} (entity arrays can't hold null); the engine uses null.
// A finished hand's result is stored as {} when there is none (and is only valid for
// the hand it belongs to), so a result can never be shown during a later hand.
const load = (row) => ({
  ...row,
  seats: (row.seats || []).map((s) => (s && s.member_id ? { ...s } : null)),
  showdown: row.showdown && row.showdown.winners && (row.showdown.hand_no === undefined || row.showdown.hand_no === row.hand_no) && row.phase === 'showdown' ? row.showdown : null,
  cashouts: Array.isArray(row.cashouts) ? row.cashouts : []
});
const tables = (b) => nullSafe(b.asServiceRole.entities.PokerTable, ['deadline', 'next_hand_at']);
const publicView = (t) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, t[k]]));
const seatOf = (t, memberId) => t.seats.findIndex((s) => s && s.member_id === memberId && !s.left);

async function getSecret(b, tableId) {
  const { items } = await b.asServiceRole.entities.PokerHand.filter({ table_id: tableId }, { limit: 1 });
  if (items[0]) return items[0];
  return await b.asServiceRole.entities.PokerHand.create({ table_id: tableId, hand_no: 0, deck: [], holes: {} });
}

async function save(b, t, secret) {
  const data = Object.fromEntries(PUBLIC_FIELDS.filter((k) => k !== 'id').map((k) => [k, t[k]]));
  data.seats = t.seats.map((s) => s || {});
  data.showdown = t.showdown || {};
  data.cashouts = t.cashouts || [];
  await tables(b).update(t.id, data);
  if (secret) {
    await b.asServiceRole.entities.PokerHand.update(secret.id, { hand_no: secret.hand_no, deck: secret.deck, holes: secret.holes });
  }
}

async function ensureTables(b) {
  const { items } = await tables(b).filter({}, { limit: 50 });
  if (items.length) return items;
  const created = [];
  for (const d of DEFAULT_TABLES) {
    created.push(await tables(b).create({
      ...d, active: true, max_seats: 6, seats: Array(6).fill({}), phase: 'waiting', hand_no: 0, dealer: -1, turn: -1,
      current_bet: 0, min_raise: d.big_blind, board: [], showdown: {}, log: []
    }));
  }
  return created;
}

// Points owed to players who have left the table. Each one is written on the table
// first and only removed once it is paid, so a failed request can't lose it: the next
// request to the table tries again. The points log is checked first so the same
// cash-out can never be paid twice.
async function settleCashouts(b, t) {
  for (const c of [...(t.cashouts || [])]) {
    if (!(c.amount > 0)) { t.cashouts = t.cashouts.filter((x) => x !== c); continue; }
    const reason = `Poker cash-out from ${t.name} [${t.id}:${c.ref}]`;
    try {
      await withMemberLock(b, c.member_id, async () => {
        const { items } = await b.asServiceRole.entities.PointLog.filter({ member_id: c.member_id, reason }, { limit: 1 });
        if (items.length === 0) await changePoints(b, c.member_id, c.amount, 'poker', reason, null);
      });
    } catch (e) {
      console.error('poker cash-out will be retried', c, e);
      continue;
    }
    t.cashouts = t.cashouts.filter((x) => x !== c);
    await tables(b).update(t.id, { cashouts: t.cashouts });
  }
}
const cashoutRef = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// Run the table under its lock: load, tick (timeouts / next hand), apply fn, save.
async function withTable(b, tableId, settings, fn) {
  return withRecordLock(b, 'PokerTable', tableId, async () => {
    const t = load(await tables(b).get(tableId));
    const secret = await getSecret(b, tableId);
    const owedBefore = t.cashouts.length;
    const before = { phase: t.phase, hand: t.hand_no };
    const now = Date.now();
    const ticked = tick(t, secret, now);
    const out = await fn(t, secret, now);
    if (out && out.dirty === false && !ticked) {
      if (owedBefore) await settleCashouts(b, t);
      return { t, secret, out };
    }
    tick(t, secret, Date.now()); // e.g. deal a hand now that a second player sat down
    await save(b, t, secret);
    // Pay anyone who left, only AFTER the table has been saved without their chips.
    if (t.cashouts.length) await settleCashouts(b, t);
    // Announce finished hands in the table chat.
    if (t.phase === 'showdown' && (before.phase !== 'showdown' || before.hand !== t.hand_no) && t.showdown && t.showdown.winners) {
      for (const w of t.showdown.winners) {
        const s = t.seats[w.seat];
        if (s) {
          await postSystem(b, tableChannel(t.id), `${s.name} wins ${w.amount}${w.hand ? ` with ${w.hand.toLowerCase()}` : ''}.`);
          const threshold = Number(settings.big_win_threshold) || 0;
          if (w.amount > 0 && w.amount >= threshold) {
            await announceBigWin(s.name, 'Poker Room', w.amount, w.hand ? `with ${w.hand.toLowerCase()}` : undefined);
          }
        }
      }
    }
    return { t, secret, out };
  });
}

// Lightweight read: only takes the lock if a turn timed out or the next hand is due.
function needsTick(row) {
  const now = Date.now();
  if (BETTING.includes(row.phase) && row.deadline && Date.parse(row.deadline) <= now) return true;
  if (row.phase === 'showdown' && row.next_hand_at && Date.parse(row.next_hand_at) <= now) return true;
  if (Array.isArray(row.cashouts) && row.cashouts.length) return true; // a cash-out is still owed
  return false;
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.');

    let p; try { p = await req.json(); } catch { p = {}; }
    const { action, tableId } = p;
    const settings = await getSettings(b);
    if (!(settings.games_enabled || []).includes('poker') && action !== 'leave') {
      throw new UserError('The poker room is closed right now.');
    }

    if (action === 'list') {
      const tables = (await ensureTables(b)).filter((t) => t.active !== false).map((row) => {
        const t = load(row);
        return {
          ...publicView(t),
          players: t.seats.filter(Boolean).length,
          seated_here: seatOf(t, me.id) >= 0
        };
      });
      return Response.json({ tables });
    }

    if (!tableId && action !== 'createTable') throw new UserError('Choose a table.');

    if (action === 'state') {
      let row = await tables(b).get(tableId);
      if (needsTick(row)) {
        const { t } = await withTable(b, tableId, settings, async () => ({ dirty: true }));
        row = t;
      }
      const t = load(row);
      const i = seatOf(t, me.id);
      const secret = i >= 0 && BETTING.concat('showdown').includes(t.phase) ? await getSecret(b, tableId) : null;
      return Response.json({ table: publicView(t), ...viewFor(t, secret, i) });
    }

    if (action === 'join') {
      if (me.banned) throw new UserError('You are banned from the games.', 403);
      const buyin = Math.floor(Number(p.buyin));
      // One table at a time.
      const { items: all } = await tables(b).filter({}, { limit: 50 });
      for (const row of all) {
        if (row.id !== tableId && seatOf(load(row), me.id) >= 0) throw new UserError(`You're already seated at ${row.name}. Leave it first.`);
      }
      const { t } = await withTable(b, tableId, settings, async (t) => {
        if (t.active === false) throw new UserError('This table is closed.');
        if (seatOf(t, me.id) >= 0) throw new UserError("You're already at this table.");
        if (!Number.isInteger(buyin) || buyin < t.min_buyin || buyin > t.max_buyin) {
          throw new UserError(`Buy in with ${t.min_buyin} to ${t.max_buyin} points.`);
        }
        let seat = Number.isInteger(p.seat) ? p.seat : t.seats.findIndex((s) => !s);
        if (seat < 0 || seat >= t.seats.length) throw new UserError('The table is full.');
        if (t.seats[seat]) throw new UserError('That seat was just taken. Pick another.');
        await withMemberLock(b, me.id, () => changePoints(b, me.id, -buyin, 'poker', `Poker buy-in at ${t.name}`, null));
        t.seats[seat] = newSeat(me, buyin);
        return {};
      });
      await postSystem(b, tableChannel(tableId), `${me.discord_name} sat down with ${buyin}.`);
      return Response.json({ ok: true, table: publicView(t) });
    }

    if (action === 'leave') {
      let refund = 0;
      let seated = false;
      let pending = false;
      const { t } = await withTable(b, tableId, settings, async (t, secret, now) => {
        const i = seatOf(t, me.id);
        if (i < 0) return { dirty: false };
        seated = true;
        const s = t.seats[i];
        const midHand = s.in_hand && !s.folded && BETTING.includes(t.phase);
        if (midHand && s.all_in) {
          // All in and leaving: the hand plays out with their cards. Whatever they win
          // is paid back to their points when the hand ends.
          s.left = true;
          pending = true;
          return {};
        }
        if (midHand) forceFold(t, secret, i, now, 'Left');
        refund = s.stack;
        s.stack = 0;
        if (refund > 0) t.cashouts = [...t.cashouts, { member_id: me.id, name: s.name, amount: refund, ref: cashoutRef() }];
        // A seat that was dealt into this hand stays until the hand ends, so the pot still adds up.
        if (s.in_hand && (BETTING.includes(t.phase) || t.phase === 'showdown')) s.left = true;
        else t.seats[i] = null;
        return {};
      });
      if (seated) await postSystem(b, tableChannel(tableId), pending ? `${me.discord_name} left the table while all in.` : `${me.discord_name} left the table${refund ? ` with ${refund}` : ''}.`);
      return Response.json({ ok: true, refund, pending, table: publicView(t) });
    }

    if (action === 'act') {
      const { t, secret } = await withTable(b, tableId, settings, async (t, secret, now) => {
        const i = seatOf(t, me.id);
        if (i < 0) throw new UserError("You're not seated at this table.");
        try {
          act(t, secret, i, String(p.move), Number(p.amount), now);
        } catch (e) {
          throw new UserError(e.message);
        }
        return {};
      });
      const i = seatOf(t, me.id);
      return Response.json({ table: publicView(t), ...viewFor(t, secret, i) });
    }

    if (action === 'topup') {
      const amount = Math.floor(Number(p.amount));
      const { t } = await withTable(b, tableId, settings, async (t) => {
        const i = seatOf(t, me.id);
        if (i < 0) throw new UserError("You're not seated at this table.");
        const s = t.seats[i];
        if (s.in_hand && BETTING.includes(t.phase)) throw new UserError('Add chips between hands.');
        if (!Number.isInteger(amount) || amount <= 0) throw new UserError('Enter how many points to add.');
        if (s.stack + amount > t.max_buyin) throw new UserError(`You can hold at most ${t.max_buyin} at this table.`);
        await withMemberLock(b, me.id, () => changePoints(b, me.id, -amount, 'poker', `Poker top-up at ${t.name}`, null));
        s.stack += amount;
        s.sitting_out = false;
        s.timeouts = 0;
        return {};
      });
      return Response.json({ ok: true, table: publicView(t) });
    }

    if (action === 'sitout' || action === 'sitin') {
      const { t } = await withTable(b, tableId, settings, async (t) => {
        const i = seatOf(t, me.id);
        if (i < 0) throw new UserError("You're not seated at this table.");
        const s = t.seats[i];
        if (action === 'sitin' && s.stack <= 0) throw new UserError('Add chips first.');
        s.sitting_out = action === 'sitout';
        s.timeouts = 0;
        return {};
      });
      return Response.json({ ok: true, table: publicView(t) });
    }

    // ----- Leader: create or close tables -----
    if (action === 'createTable' || action === 'closeTable') {
      if (me.role !== 'leader') throw new UserError('Only the Guild Leader can manage tables.', 403);
      if (action === 'createTable') {
        const n = (v) => Math.floor(Number(v));
        const d = { name: String(p.name || '').trim().slice(0, 40), small_blind: n(p.small_blind), big_blind: n(p.big_blind), min_buyin: n(p.min_buyin), max_buyin: n(p.max_buyin) };
        if (!d.name) throw new UserError('Name the table.');
        if (!(d.small_blind > 0 && d.big_blind >= d.small_blind && d.min_buyin >= d.big_blind * 10 && d.max_buyin >= d.min_buyin)) {
          throw new UserError('Blinds must be above 0, the minimum buy-in at least 10 big blinds, and the maximum at least the minimum.');
        }
        const row = await tables(b).create({
          ...d, active: true, max_seats: 6, seats: Array(6).fill({}), phase: 'waiting', hand_no: 0, dealer: -1, turn: -1,
          current_bet: 0, min_raise: d.big_blind, board: [], showdown: {}, log: []
        });
        return Response.json({ ok: true, table: publicView(load(row)) });
      }
      // closeTable: only between hands; everyone gets their chips back.
      await withTable(b, tableId, settings, async (t) => {
        if (BETTING.includes(t.phase)) throw new UserError('Wait for the current hand to finish.');
        for (let i = 0; i < t.seats.length; i++) {
          const s = t.seats[i];
          if (s && s.stack > 0) t.cashouts = [...t.cashouts, { member_id: s.member_id, name: s.name, amount: s.stack, ref: cashoutRef() }];
          t.seats[i] = null;
        }
        t.active = false;
        t.phase = 'waiting';
        return {};
      });
      return Response.json({ ok: true });
    }

    throw new UserError('Unknown poker action.');
  } catch (e) {
    return errorResponse(e);
  }
}