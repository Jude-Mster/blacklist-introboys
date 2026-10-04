// Pusoy Dos, guild rules. Pure functions: no database, no clock except the `now` passed in.
// Cards are two characters, rank then suit: "3d", "Ts", "2h".
//   - Singles only. Everyone is dealt 13 cards.
//   - Each player's highest card is shown; the highest of those goes first. (This is
//     the only place card and suit ranking matter: 2 high ... 3 low, then
//     Spade > Heart > Club > Diamond.) The cards stay in their hands.
//   - The first card played sets the suit in game. The next player must play a card
//     of that suit, or the same number in another suit, which changes the suit.
//   - Can't or won't play: pass. When everyone else passes, the last player to play
//     leads any card and sets a new suit.
//   - Every card played stays on the table (the pile). First to empty their hand wins.
import { randInt } from './points.ts';

export const RANK_ORDER = '3456789TJQKA2';
export const SUIT_ORDER = 'dchs';
export const SEATS = 4;
export const HAND_SIZE = 13;
export const TURN_SECONDS = 20;
export const START_SECONDS = 10;  // countdown once two players are seated
export const FULL_START_SECONDS = 3;
export const RESULT_SECONDS = 10;
export const MAX_TIMEOUTS = 3;
export const HOUSE_CUT_PCT = 2;

export const rankOf = (c: string) => RANK_ORDER.indexOf(c[0]);
export const suitOf = (c: string) => SUIT_ORDER.indexOf(c[1]);
export const cardValue = (c: string) => rankOf(c) * 4 + suitOf(c);
export const sortCards = (cards: string[]) => [...cards].sort((a, b) => cardValue(a) - cardValue(b));
const validCard = (c) => typeof c === 'string' && c.length === 2 && rankOf(c) >= 0 && suitOf(c) >= 0;

// May `card` be played on `top`? Same suit, or the same number (which changes the suit).
export function canFollow(card: string, top: string) {
  return validCard(card) && validCard(top) && card !== top && (card[1] === top[1] || card[0] === top[0]);
}
export const highestOf = (cards: string[]) => sortCards(cards)[cards.length - 1];

export function shuffledDeck() {
  const deck: string[] = [];
  for (const r of RANK_ORDER) for (const s of SUIT_ORDER) deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) { const j = randInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

const iso = (ms: number) => new Date(ms).toISOString();
const taken = (s) => !!(s && s.member_id);
const playing = (s) => taken(s) && s.in_game;
// Still holding cards and taking turns (not forfeited).
const active = (s) => playing(s) && !s.out;
// The most one player can lose in a game: the pot money plus all 13 cards.
export const maxLoss = (t) => (t.ante || 0) + HAND_SIZE * (t.stake || 0);
export const seatedCount = (t) => t.seats.filter((s) => taken(s) && !s.left).length;

function pushLog(t, entry) {
  t.log = [...(t.log || []), entry].slice(-12);
}

function setTurn(t, seat: number, now: number) {
  t.turn = seat;
  t.deadline = iso(now + TURN_SECONDS * 1000);
}

// Deal a new game to the seats in `seatNos` (already charged their escrow).
export function deal(t, seatNos: number[], now: number, deck = shuffledDeck()) {
  t.hands = {};
  // Everyone shows their highest card; the highest of those goes first.
  const opening = [];
  let best = null, bestSeat = -1;
  seatNos.forEach((i, k) => {
    const hand = sortCards(deck.slice(k * HAND_SIZE, (k + 1) * HAND_SIZE));
    t.hands[i] = hand;
    Object.assign(t.seats[i], { in_game: true, count: HAND_SIZE, passed: false, out: false, left: false, timeouts: 0, due: 0 });
    const high = highestOf(hand);
    opening.push({ seat: i, card: high });
    if (best === null || cardValue(high) > cardValue(best)) { best = high; bestSeat = i; }
  });
  t.opening = opening;
  t.pile = [];
  t.status = 'playing';
  t.game_no = (t.game_no || 0) + 1;
  t.last = {};
  t.first = false;
  t.low_card = null;
  t.result = {};
  t.start_at = null;
  t.next_at = null;
  t.log = [];
  setTurn(t, bestSeat, now);
}

function finish(t, winner: number, now: number) {
  const rows = [];
  let pot = 0;
  for (let i = 0; i < SEATS; i++) {
    const s = t.seats[i];
    if (!playing(s)) continue;
    const left = (t.hands[i] || []).length;
    // A loser gives up their pot money, plus the card value for each card left (if the table has one).
    const owes = i === winner ? 0 : (t.ante || 0) + left * (t.stake || 0);
    pot += owes;
    rows.push({ seat: i, member_id: s.member_id, name: s.name, left, owes, cards: t.hands[i] || [] });
  }
  const win = Math.floor((pot * (100 - HOUSE_CUT_PCT)) / 100); // rounds down; the rest leaves circulation
  for (const r of rows) {
    const s = t.seats[r.seat];
    r.net = r.seat === winner ? win : -r.owes;
    s.due = (s.escrow || 0) + r.net; // what goes back to their balance
    s.escrow = 0;
  }
  t.status = 'finished';
  t.turn = -1;
  t.deadline = null;
  t.next_at = iso(now + RESULT_SECONDS * 1000);
  t.result = { winner, winner_name: t.seats[winner].name, pot, win, cut: pot - win, rows };
}

// Move the turn on from `seat`. If going round the table reaches (or passes) the seat
// that made the last play, everyone else has passed and the next player leads anything.
function advance(t, seat: number, now: number) {
  let nxt = -1, cleared = false;
  for (let k = 1; k <= SEATS && nxt < 0; k++) {
    const i = (seat + k) % SEATS;
    if (t.last && t.last.cards && i === t.last.seat) cleared = true;
    if (active(t.seats[i])) nxt = i;
  }
  if (cleared) {
    t.last = {};
    for (const s of t.seats) if (taken(s)) s.passed = false;
  }
  setTurn(t, nxt, now);
}

// A player gives up the game: they stop taking turns and pay for every card they
// still hold. If only one player is left, that player wins.
export function forfeit(t, seat: number, now: number) {
  const s = t.seats[seat];
  if (t.status !== 'playing' || !active(s)) return;
  s.out = true;
  pushLog(t, { seat, name: s.name, forfeit: true });
  const rest = t.seats.map((x, i) => (active(x) ? i : -1)).filter((i) => i >= 0);
  if (rest.length === 1) return finish(t, rest[0], now);
  if (t.turn === seat) {
    advance(t, seat, now);
  }
}

const SUIT_NAME = { s: 'Spades', h: 'Hearts', c: 'Clubs', d: 'Diamonds' };

// Throws Error(message) for an illegal move; the message is shown to the player.
export function play(t, seat: number, cards: string[], now: number, byTimer = false) {
  if (t.status !== 'playing') throw new Error('No game is being played.');
  if (t.turn !== seat) throw new Error("It isn't your turn.");
  const hand: string[] = t.hands[seat] || [];
  if (!Array.isArray(cards) || cards.length !== 1 || !validCard(cards[0])) throw new Error('Play one card at a time.');
  const card = cards[0];
  if (!hand.includes(card)) throw new Error("You don't hold that card.");
  const top = t.last && t.last.cards ? t.last.cards[0] : null;
  if (top && !canFollow(card, top)) {
    const rank = top[0] === 'T' ? '10' : top[0];
    throw new Error(`${SUIT_NAME[top[1]]} are in game. Play one, or play a ${rank} of another suit to change the suit.`);
  }
  t.hands[seat] = hand.filter((c) => c !== card);
  const s = t.seats[seat];
  s.count = t.hands[seat].length;
  if (!byTimer) s.timeouts = 0;
  for (const x of t.seats) if (taken(x)) x.passed = false;
  const label = !top ? 'Lead' : card[1] === top[1] ? 'Followed suit' : 'Changed suit';
  t.last = { seat, cards: [card], label };
  t.pile = [...(t.pile || []), { seat, card }]; // every card played stays on the table
  pushLog(t, { seat, name: s.name, cards: [card], label });
  if (s.count === 0) return finish(t, seat, now);
  advance(t, seat, now);
}

export function pass(t, seat: number, now: number, byTimer = false) {
  if (t.status !== 'playing') throw new Error('No game is being played.');
  if (t.turn !== seat) throw new Error("It isn't your turn.");
  if (!(t.last && t.last.cards)) throw new Error("You're leading: play a card.");
  const s = t.seats[seat];
  s.passed = true;
  if (!byTimer) s.timeouts = 0;
  pushLog(t, { seat, name: s.name, pass: true });
  advance(t, seat, now);
}

// The turn timer ran out. Nothing is ever played for a player: they pass, or if they
// were leading the lead moves to the next player. Three in a row forfeits the game.
export function timeoutMove(t, now: number) {
  const seat = t.turn;
  const s = t.seats[seat];
  s.timeouts = (s.timeouts || 0) + 1;
  if (s.timeouts >= MAX_TIMEOUTS) return forfeit(t, seat, now);
  if (t.last && t.last.cards) return pass(t, seat, now, true);
  pushLog(t, { seat, name: s.name, skipped: true });
  advance(t, seat, now);
}

// Run whatever the clock says is due. Returns true if anything changed.
// Dealing needs points, so it's reported as 'deal' for the caller to do.
export function tick(t, now: number): boolean | 'deal' {
  let changed = false;
  if (t.status === 'playing') {
    let guard = 0;
    while (t.status === 'playing' && t.deadline && Date.parse(t.deadline) <= now && guard++ < 8) { timeoutMove(t, now); changed = true; }
    return changed;
  }
  if (t.status === 'finished') {
    if (t.seats.some((s) => taken(s) && s.due > 0)) return false; // still paying
    if (t.next_at && Date.parse(t.next_at) <= now) {
      // Back to waiting. Players who left or went idle give up their seats.
      t.seats = t.seats.map((s) => (taken(s) && !s.left && !s.out ? { member_id: s.member_id, name: s.name, avatar: s.avatar, role: s.role } : {}));
      Object.assign(t, { status: 'waiting', hands: {}, pile: [], opening: [], last: {}, turn: -1, deadline: null, next_at: null, start_at: null, first: false });
      changed = true;
    } else return false;
  }
  // waiting
  const n = seatedCount(t);
  if (n < 2) { if (t.start_at) { t.start_at = null; changed = true; } return changed; }
  if (!t.start_at) { t.start_at = iso(now + (n === SEATS ? FULL_START_SECONDS : START_SECONDS) * 1000); return true; }
  if (Date.parse(t.start_at) <= now) return 'deal';
  return changed;
}

// What one member is allowed to see.
export function viewFor(t, memberId: string, now: number) {
  const mySeat = t.seats.findIndex((s) => taken(s) && s.member_id === memberId && !s.left);
  const done = t.status === 'finished';
  return {
    table: {
      id: t.id, name: t.name, ante: t.ante || 0, stake: t.stake || 0, need: maxLoss(t), status: t.status, game_no: t.game_no || 0, turn: t.turn,
      deadline: t.deadline || null, start_at: t.start_at || null, next_at: t.next_at || null, server_now: iso(now),
      suit: t.status === 'playing' && t.last && t.last.cards ? t.last.cards[0][1] : null,
      pile: t.status === 'waiting' ? [] : (t.pile || []).map((x) => x.card), opening: t.status === 'waiting' ? [] : (t.opening || []),
      last: t.last && t.last.cards ? t.last : null, log: t.log || [], turn_seconds: TURN_SECONDS, cut_pct: HOUSE_CUT_PCT,
      seats: t.seats.map((s, i) => (taken(s)
        ? { seat: i, empty: false, name: s.name, avatar: s.avatar, role: s.role, mine: i === mySeat, in_game: !!s.in_game, count: s.in_game ? s.count : null, passed: !!s.passed, out: !!s.out, left: !!s.left }
        : { seat: i, empty: true })),
      result: done && t.result && t.result.rows
        ? { ...t.result, rows: t.result.rows.map((r) => ({ seat: r.seat, name: r.name, left: r.left, net: r.net, cards: r.cards, mine: r.member_id === memberId })) }
        : null
    },
    my_seat: mySeat,
    hand: mySeat >= 0 && t.status === 'playing' && t.hands ? (t.hands[mySeat] || []) : []
  };
}