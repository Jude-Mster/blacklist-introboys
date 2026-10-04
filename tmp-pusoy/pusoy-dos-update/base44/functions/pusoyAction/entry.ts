import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, UserError, errorResponse } from '../../shared/points.ts';
import { postFeed } from '../../shared/feed.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { SEATS, HAND_SIZE, START_SECONDS, FULL_START_SECONDS, deal, play, pass, forfeit, tick, viewFor, seatedCount } from '../../shared/pusoy.ts';

// Pusoy Dos: members play each other. The loser pays the winner for every card
// left in hand; 2% of what the winner collects is removed from circulation.
//
// Money: when a game is dealt every player puts 13 x stake aside (the most they can
// lose). When it ends each player gets that back, less what they owe or plus what
// they won. Nothing is ever paid from a balance that might not be there.
//
// Everything that changes a table runs under that table's lock. Lock order is
// always table, then member.
const NAME = 'Pusoy Dos';
const MAX_TABLES = 8;
const EMPTY_MS = 2 * 60 * 1000;
const LOCK_MS = 60000;
const iso = (ms: number) => new Date(ms).toISOString();
const taken = (s) => !!(s && s.member_id);
const load = (row) => ({ ...row, seats: Array.from({ length: SEATS }, (_, i) => ({ ...((row.seats || [])[i] || {}) })), hands: { ...(row.hands || {}) }, last: row.last || {}, result: row.result || {}, log: row.log || [] });
const FIELDS = ['name', 'stake', 'status', 'game_no', 'seats', 'hands', 'turn', 'deadline', 'last', 'first', 'low_card', 'start_at', 'next_at', 'result', 'log', 'empty_since'];

export const stakeLimits = (settings) => {
  const max = Math.max(1, Math.floor((Number(settings.max_bet) || 0) / HAND_SIZE));
  const min = Math.min(max, Math.max(1, Math.ceil((Number(settings.min_bet) || 0) / HAND_SIZE)));
  return { min, max };
};

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    const action = String(p.action || '');
    if (action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.', 401);
    const settings = await getSettings(b);
    const open = (settings.games_enabled || []).includes('pusoy');
    const T = b.asServiceRole.entities.PusoyTable;
    const M = b.asServiceRole.entities.Member;
    const limits = stakeLimits(settings);

    const save = async (t) => {
      t.empty_since = t.seats.some(taken) ? null : (t.empty_since || iso(Date.now()));
      await T.update(t.id, Object.fromEntries(FIELDS.map((k) => [k, t[k] === undefined ? null : t[k]])));
    };

    // Give back what each player is owed. The amount is cleared and saved BEFORE the
    // points move, so a retry can never pay the same player twice.
    const payDue = async (t) => {
      for (let i = 0; i < SEATS; i++) {
        const s = t.seats[i];
        if (!taken(s) || !(s.due > 0)) continue;
        const amount = s.due;
        s.due = 0;
        await save(t);
        const row = (t.result.rows || []).find((r) => r.seat === i);
        const reason = row && row.net > 0 ? `${NAME} win at ${t.name}` : `${NAME} at ${t.name}: stake returned`;
        await withMemberLock(b, s.member_id, () => changePoints(b, s.member_id, amount, 'game', reason, null));
      }
    };

    // Take 13 x stake from everyone seated, then deal. Anyone who can't cover it stands up.
    const dealGame = async (t, now) => {
      if (!open) { t.start_at = null; await save(t); return; }
      const escrow = HAND_SIZE * t.stake;
      const inSeats: number[] = [];
      for (let i = 0; i < SEATS; i++) {
        const s = t.seats[i];
        if (!taken(s) || s.left) { t.seats[i] = {}; continue; }
        const ok = await withMemberLock(b, s.member_id, async () => {
          const m = await M.get(s.member_id);
          if (m.banned || m.no_access || (m.points || 0) < escrow) return false;
          await changePoints(b, s.member_id, -escrow, 'game', `${NAME} at ${t.name}: stake held`, null);
          return true;
        }).catch(() => false);
        if (ok) { s.escrow = escrow; inSeats.push(i); } else t.seats[i] = {};
      }
      if (inSeats.length < 2) {
        // Not enough players after all: hand the stakes straight back.
        for (const i of inSeats) { const s = t.seats[i]; s.due = s.escrow; s.escrow = 0; }
        t.start_at = null;
        await save(t);
        await payDueQuiet(t);
        return;
      }
      deal(t, inSeats, now);
      await save(t);
    };
    const payDueQuiet = async (t) => {
      for (let i = 0; i < SEATS; i++) {
        const s = t.seats[i];
        if (!taken(s) || !(s.due > 0)) continue;
        const amount = s.due; s.due = 0;
        await save(t);
        await withMemberLock(b, s.member_id, () => changePoints(b, s.member_id, amount, 'game', `${NAME} at ${t.name}: stake returned`, null));
      }
    };

    const announce = async (t) => {
      const r = t.result;
      if (!r || !r.rows) return;
      for (const row of r.rows) {
        const s = t.seats[row.seat];
        if (!taken(s)) continue;
        const wager = row.net < 0 ? -row.net : 0;
        await postFeed(b, { id: s.member_id, discord_name: s.name, avatar_url: s.avatar, role: s.role }, {
          game: 'pusoy', game_name: NAME, wager, payout: row.net > 0 ? row.net : 0,
          detail: row.net > 0 ? `Won at ${t.name}` : `${row.left} card${row.left === 1 ? '' : 's'} left`
        });
      }
    };

    // Run the table under its lock: load, do what the clock says, apply fn, save, pay.
    const withTable = async (tableId: string, fn?) => withRecordLock(b, 'PusoyTable', tableId, async () => {
      let row;
      try { row = await T.get(tableId); } catch { throw new UserError('That table has closed.', 404); }
      const t = load(row);
      const before = t.status;
      let dirty = false;
      if (t.status === 'finished' && t.seats.some((s) => taken(s) && s.due > 0)) await payDue(t); // interrupted payout
      let due = tick(t, Date.now());
      if (due === true) dirty = true;
      if (fn) {
        if ((await fn(t, Date.now())) !== false) dirty = true;
        due = tick(t, Date.now());
        if (due === true) dirty = true;
      }
      if (due === 'deal') await dealGame(t, Date.now());
      else if (dirty) await save(t);
      if (t.status === 'finished' && before !== 'finished') { await payDue(t); await announce(t); }
      return t;
    }, LOCK_MS);

    const needsTick = (row) => {
      const now = Date.now();
      if (row.status === 'playing') return row.deadline && Date.parse(row.deadline) <= now;
      if (row.status === 'finished') return (row.seats || []).some((s) => taken(s) && s.due > 0) || (row.next_at && Date.parse(row.next_at) <= now);
      const n = seatedCount(load(row));
      return (n >= 2 && (!row.start_at || Date.parse(row.start_at) <= now)) || (n < 2 && !!row.start_at);
    };

    const allTables = async () => (await T.filter({}, { limit: 50 })).items || [];
    const seatedAt = (row, memberId) => (row.seats || []).some((s) => taken(s) && s.member_id === memberId && !s.left);
    const oneTableOnly = async (exceptId?: string) => {
      for (const row of await allTables()) {
        if (row.id !== exceptId && seatedAt(row, me.id)) throw new UserError(`You're already seated at ${row.name}. Stand up there first.`);
      }
    };
    const chair = () => ({ member_id: me.id, name: me.discord_name || me.discord_id, avatar: me.avatar_url || '', role: me.role });
    const canAfford = async (stake: number) => {
      const m = await M.get(me.id);
      if ((m.points || 0) < stake * HAND_SIZE) throw new UserError(`You need ${(stake * HAND_SIZE).toLocaleString()} points to sit here (13 cards × ${stake}).`);
    };

    // ---------- lobby ----------
    if (action === 'list') {
      const rows = await allTables();
      const now = Date.now();
      const tables = [];
      for (const row of rows) {
        const people = (row.seats || []).filter(taken).length;
        // Tables left empty are cleared away.
        if (people === 0 && row.status === 'waiting' && row.empty_since && now - Date.parse(row.empty_since) > EMPTY_MS) {
          await withRecordLock(b, 'PusoyTable', row.id, async () => {
            const live = await T.get(row.id).catch(() => null);
            if (live && !(live.seats || []).some(taken) && live.status === 'waiting') await T.delete(row.id);
          }).catch(() => {});
          continue;
        }
        tables.push({ id: row.id, name: row.name, stake: row.stake, status: row.status, players: (row.seats || []).filter((s) => taken(s) && !s.left).length, max_seats: SEATS, seated_here: seatedAt(row, me.id) });
      }
      tables.sort((x, y) => x.stake - y.stake);
      return Response.json({ open, tables, limits, max_tables: MAX_TABLES });
    }

    if (action === 'create') {
      if (!open) throw new UserError(`${NAME} is closed right now.`);
      if (me.banned) throw new UserError('You are banned from the games.', 403);
      const stake = Math.floor(Number(p.stake));
      if (!Number.isInteger(stake) || stake < limits.min || stake > limits.max) throw new UserError(`Set the stake between ${limits.min} and ${limits.max} points per card.`);
      await canAfford(stake);
      // One at a time, so two members can't both take the last table slot or one member open two.
      const row = await withRecordLock(b, 'PusoyLobby', 'all', async () => {
        await oneTableOnly();
        if ((await allTables()).length >= MAX_TABLES) throw new UserError('Every table is in use. Join one, or wait for a table to close.');
        const seats = Array.from({ length: SEATS }, () => ({}));
        seats[0] = chair();
        return await T.create({ name: `${chair().name}'s table`.slice(0, 40), stake, status: 'waiting', game_no: 0, seats, hands: {}, turn: -1, last: {}, first: false, result: {}, log: [] });
      });
      return Response.json({ ok: true, id: row.id });
    }

    const tableId = String(p.tableId || '');
    if (!tableId) throw new UserError('Choose a table.');

    if (action === 'state') {
      let row;
      try { row = await T.get(tableId); } catch { throw new UserError('That table has closed.', 404); }
      const t = needsTick(row) ? await withTable(tableId) : load(row);
      const m = await M.get(me.id);
      return Response.json({ open, ...viewFor(t, me.id, Date.now()), balance: m.points || 0 });
    }

    if (action === 'sit') {
      if (!open) throw new UserError(`${NAME} is closed right now.`);
      if (me.banned) throw new UserError('You are banned from the games.', 403);
      const t = await withRecordLock(b, 'PusoyLobby', 'all', async () => {
        await oneTableOnly(tableId);
        return withTable(tableId, async (t, now) => {
          if (t.seats.some((s) => taken(s) && s.member_id === me.id)) throw new UserError("You're already at this table.");
          await canAfford(t.stake);
          const want = Number.isInteger(p.seat) ? p.seat : t.seats.findIndex((s) => !taken(s));
          if (want < 0 || want >= SEATS) throw new UserError('The table is full.');
          if (taken(t.seats[want])) throw new UserError('That seat was just taken. Pick another.');
          t.seats[want] = chair();
          // A new arrival restarts the short countdown so others can still join.
          if (t.status === 'waiting') { const n = seatedCount(t); t.start_at = n >= 2 ? iso(now + (n === SEATS ? FULL_START_SECONDS : START_SECONDS) * 1000) : null; }
        });
      });
      return Response.json({ open, ...viewFor(t, me.id, Date.now()) });
    }

    if (action === 'leave') {
      const t = await withTable(tableId, async (t, now) => {
        const i = t.seats.findIndex((s) => taken(s) && s.member_id === me.id && !s.left);
        if (i < 0) return false;
        const s = t.seats[i];
        if (t.status === 'playing' && s.in_game) {
          // Mid-game: leaving forfeits. They pay for every card still in hand.
          s.left = true;
          forfeit(t, i, now);
        } else if (t.status === 'finished' && s.in_game) {
          s.left = true; // seat clears when the result screen closes
        } else t.seats[i] = {};
      });
      return Response.json({ open, ...viewFor(t, me.id, Date.now()) });
    }

    if (action === 'play' || action === 'pass') {
      const cards = Array.isArray(p.cards) ? p.cards.map(String).slice(0, 5) : [];
      const t = await withTable(tableId, async (t, now) => {
        const i = t.seats.findIndex((s) => taken(s) && s.member_id === me.id && !s.left);
        if (i < 0 || !t.seats[i].in_game || t.seats[i].out) throw new UserError("You're not in this game.");
        try {
          if (action === 'play') play(t, i, cards, now); else pass(t, i, now);
        } catch (e) { throw new UserError(e.message); }
      });
      const m = await M.get(me.id);
      return Response.json({ open, ...viewFor(t, me.id, Date.now()), balance: m.points || 0 });
    }

    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
