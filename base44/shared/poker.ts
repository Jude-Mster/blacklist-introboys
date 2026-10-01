// Texas Hold'em engine for the guild poker tables.
// Pure functions on two objects:
//   table  - public state everyone can see (PokerTable entity)
//   secret - deck and hole cards only the server reads (PokerHand entity)
// Every function mutates the objects it is given and returns nothing unless noted.

import { randInt } from "./points.ts";

export const ACTION_SECONDS = 25;
export const SHOWDOWN_SECONDS = 6;
export const FOLD_WIN_SECONDS = 3;
const RANKS = "23456789TJQKA";
const SUITS = "shdc";

// ---------- Cards ----------

export function newDeck() {
  const d: string[] = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const rankOf = (c: string) => RANKS.indexOf(c[0]) + 2; // 2..14

// Score a 5-card hand: [category, ...tiebreakers]; bigger compares higher.
function score5(cards: string[]) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // groups sorted by size then rank
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);

  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, ...byGroup];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, ...byGroup];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroup];
  if (groups[0][1] === 2) return [1, ...byGroup];
  return [0, ...ranks];
}

export function compareScores(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

const HAND_NAMES = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];

// Best 5 of up to 7 cards.
export function bestHand(cards: string[]) {
  let best: number[] | null = null;
  let bestCards: string[] = [];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const s = score5(five);
            if (!best || compareScores(s, best) > 0) {
              best = s;
              bestCards = five;
            }
          }
  const s = best as number[];
  const name = s[0] === 8 && s[1] === 14 ? "Royal flush" : HAND_NAMES[s[0]];
  return { score: s, name, cards: bestCards };
}

// ---------- Table helpers ----------

export function newSeat(member, stack: number) {
  return {
    member_id: member.id,
    name: member.discord_name || member.discord_id,
    avatar: member.avatar_url || "",
    stack,
    bet: 0, // chips put in on this street
    committed: 0, // chips put in this hand
    in_hand: false,
    folded: false,
    all_in: false,
    acted: false,
    sitting_out: false,
    left: false,
    timeouts: 0,
    last_action: ""
  };
}

const occupied = (t) => t.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
const inHand = (t) => occupied(t).filter((i) => t.seats[i].in_hand && !t.seats[i].folded);
const canAct = (t) => inHand(t).filter((i) => !t.seats[i].all_in);
export const potTotal = (t) => t.seats.reduce((sum, s) => sum + (s && s.in_hand ? s.committed : 0), 0);

// Next seat index after `from` (clockwise) that passes `ok`.
function nextSeat(t, from: number, ok: (i: number) => boolean) {
  const n = t.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (ok(i)) return i;
  }
  return -1;
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function log(t, text: string) {
  t.log = [...(t.log || []), text].slice(-8);
}

function pay(seat, amount: number) {
  const x = Math.min(amount, seat.stack);
  seat.stack -= x;
  seat.bet += x;
  seat.committed += x;
  if (seat.stack === 0) seat.all_in = true;
  return x;
}

// ---------- Hand flow ----------

// Seats that can be dealt into the next hand.
export const dealable = (t) =>
  occupied(t).filter((i) => {
    const s = t.seats[i];
    return !s.left && !s.sitting_out && s.stack > 0;
  });

// Start a new hand if at least two players can play. Returns true if dealt.
export function startHand(t, secret, now: number) {
  // Clear seats of players who left during the last hand.
  t.seats = t.seats.map((s) => (s && s.left ? null : s));
  for (const i of occupied(t)) {
    Object.assign(t.seats[i], { bet: 0, committed: 0, in_hand: false, folded: false, all_in: false, acted: false, last_action: "" });
  }
  t.board = [];
  t.showdown = null;
  t.current_bet = 0;
  t.min_raise = t.big_blind;

  const players = dealable(t);
  if (players.length < 2) {
    t.phase = "waiting";
    t.turn = -1;
    t.deadline = null;
    t.next_hand_at = null;
    return false;
  }

  t.hand_no = (t.hand_no || 0) + 1;
  const ok = (i) => players.includes(i);
  t.dealer = nextSeat(t, typeof t.dealer === "number" ? t.dealer : -1, ok);
  for (const i of players) t.seats[i].in_hand = true;

  const deck = newDeck();
  const holes = {};
  for (const i of players) holes[i] = [deck.pop(), deck.pop()];
  secret.hand_no = t.hand_no;
  secret.deck = deck;
  secret.holes = holes;

  // Heads-up: the dealer posts the small blind and acts first before the flop.
  const sb = players.length === 2 ? t.dealer : nextSeat(t, t.dealer, ok);
  const bb = nextSeat(t, sb, ok);
  pay(t.seats[sb], t.small_blind);
  t.seats[sb].last_action = "Small blind";
  pay(t.seats[bb], t.big_blind);
  t.seats[bb].last_action = "Big blind";
  t.current_bet = Math.max(t.seats[sb].bet, t.seats[bb].bet);
  t.min_raise = t.big_blind;
  t.phase = "preflop";
  log(t, `Hand ${t.hand_no} begins.`);

  t.turn = nextSeat(t, bb, (i) => canAct(t).includes(i));
  t.deadline = iso(now + ACTION_SECONDS * 1000);
  t.next_hand_at = null;
  advance(t, secret, now, true);
  return true;
}

// Apply a player's move. Throws an Error with a user-facing message if illegal.
export function act(t, secret, seatIdx: number, move: string, amount: number, now: number) {
  if (!["preflop", "flop", "turn", "river"].includes(t.phase)) throw new Error("No hand is being played.");
  if (t.turn !== seatIdx) throw new Error("It isn't your turn.");
  const s = t.seats[seatIdx];
  const toCall = t.current_bet - s.bet;

  if (move === "allin") {
    const target = s.bet + s.stack;
    move = target > t.current_bet ? "raise" : "call";
    amount = target;
  }

  if (move === "fold") {
    s.folded = true;
    s.last_action = "Fold";
  } else if (move === "check") {
    if (toCall > 0) throw new Error(`You need ${toCall} to call.`);
    s.last_action = "Check";
  } else if (move === "call") {
    if (toCall <= 0) {
      s.last_action = "Check";
    } else {
      const paid = pay(s, toCall);
      s.last_action = s.all_in ? `All in ${s.bet}` : `Call ${paid}`;
    }
  } else if (move === "raise") {
    const target = Math.floor(Number(amount));
    if (!Number.isInteger(target) || target <= t.current_bet) throw new Error(`Raise to more than ${t.current_bet}.`);
    const maxTarget = s.bet + s.stack;
    if (target > maxTarget) throw new Error("You don't have that many chips.");
    const size = target - t.current_bet;
    const isAllIn = target === maxTarget;
    if (size < t.min_raise && !isAllIn) throw new Error(`The smallest raise is to ${t.current_bet + t.min_raise}.`);
    pay(s, target - s.bet);
    if (size >= t.min_raise) {
      t.min_raise = size;
      // A full raise reopens the action for everyone else.
      for (const i of canAct(t)) if (i !== seatIdx) t.seats[i].acted = false;
    }
    t.current_bet = target;
    s.last_action = s.all_in ? `All in ${target}` : t.current_bet === size ? `Bet ${target}` : `Raise to ${target}`;
  } else {
    throw new Error("Unknown move.");
  }
  s.acted = true;
  s.timeouts = move === "timeout" ? s.timeouts : 0;
  advance(t, secret, now, false);
}

// Fold a player who leaves or runs out of time, whether or not it's their turn.
export function forceFold(t, secret, seatIdx: number, now: number, label = "Fold") {
  const s = t.seats[seatIdx];
  if (!s || !s.in_hand || s.folded) return;
  s.folded = true;
  s.acted = true;
  s.last_action = label;
  if (["preflop", "flop", "turn", "river"].includes(t.phase)) advance(t, secret, now, false);
}

// Move the hand forward: next player, next street, or showdown.
function advance(t, secret, now: number, justDealt: boolean) {
  const live = inHand(t);
  if (live.length === 1) return winUncontested(t, live[0], now);

  const actors = canAct(t);
  const needs = (i) => !t.seats[i].acted || t.seats[i].bet < t.current_bet;
  const roundOver = actors.filter(needs).length === 0 || (actors.length === 1 && t.seats[actors[0]].bet >= t.current_bet && !justDealt) || actors.length === 0;

  if (!roundOver) {
    // Keep the turn where it is if that player still has to act
    // (e.g. someone else folded out of turn); otherwise pass it on.
    if (!(actors.includes(t.turn) && needs(t.turn))) {
      t.turn = nextSeat(t, t.turn, (i) => actors.includes(i) && needs(i));
      t.deadline = iso(now + ACTION_SECONDS * 1000);
    }
    return;
  }

  // Close the street.
  for (const i of occupied(t)) {
    t.seats[i].bet = 0;
    t.seats[i].acted = false;
  }
  t.current_bet = 0;
  t.min_raise = t.big_blind;

  if (t.phase === "river") return showdown(t, secret, now);
  dealStreet(t, secret);

  // Nobody (or only one player) can still bet: run the board out.
  if (canAct(t).length <= 1) {
    while (t.phase !== "river") dealStreet(t, secret);
    return showdown(t, secret, now);
  }
  t.turn = nextSeat(t, t.dealer, (i) => canAct(t).includes(i));
  t.deadline = iso(now + ACTION_SECONDS * 1000);
}

function dealStreet(t, secret) {
  secret.deck.pop(); // burn
  if (t.phase === "preflop") {
    t.board = [secret.deck.pop(), secret.deck.pop(), secret.deck.pop()];
    t.phase = "flop";
  } else if (t.phase === "flop") {
    t.board = [...t.board, secret.deck.pop()];
    t.phase = "turn";
  } else if (t.phase === "turn") {
    t.board = [...t.board, secret.deck.pop()];
    t.phase = "river";
  }
}

function winUncontested(t, winner: number, now: number) {
  const pot = potTotal(t);
  t.seats[winner].stack += pot;
  t.showdown = { revealed: {}, winners: [{ seat: winner, amount: pot, hand: "" }], pot };
  log(t, `${t.seats[winner].name} wins ${pot}.`);
  endHand(t, now, FOLD_WIN_SECONDS);
}

// Split the pot into a main pot and side pots by how much each player put in.
export function buildPots(t) {
  const contributors = occupied(t).filter((i) => t.seats[i].in_hand && t.seats[i].committed > 0);
  const levels = [...new Set(contributors.map((i) => t.seats[i].committed))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const i of contributors) amount += Math.max(0, Math.min(t.seats[i].committed, level) - prev);
    const eligible = contributors.filter((i) => !t.seats[i].folded && t.seats[i].committed >= level);
    if (amount > 0) {
      // A level only folded players reached goes to the pot below it.
      if (eligible.length === 0 && pots.length) pots[pots.length - 1].amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  return pots;
}

function showdown(t, secret, now: number) {
  t.phase = "showdown";
  t.turn = -1;
  const live = inHand(t);
  const hands = {};
  for (const i of live) hands[i] = bestHand([...secret.holes[i], ...t.board]);

  const won = {};
  const pots = buildPots(t);
  for (const p of pots) {
    const contenders = p.eligible.length ? p.eligible : live;
    let best: number[] | null = null;
    let winners: number[] = [];
    for (const i of contenders) {
      const c = best ? compareScores(hands[i].score, best) : 1;
      if (c > 0) {
        best = hands[i].score;
        winners = [i];
      } else if (c === 0) winners.push(i);
    }
    const share = Math.floor(p.amount / winners.length);
    let odd = p.amount - share * winners.length;
    // Odd chips go to the first winners left of the dealer.
    const order = winners.sort((a, b) => ((a - t.dealer + t.seats.length) % t.seats.length) - ((b - t.dealer + t.seats.length) % t.seats.length));
    for (const i of order) {
      const extra = odd > 0 ? 1 : 0;
      odd -= extra;
      t.seats[i].stack += share + extra;
      won[i] = (won[i] || 0) + share + extra;
    }
  }

  const revealed = {};
  for (const i of live) revealed[i] = { cards: secret.holes[i], hand: hands[i].name, best: hands[i].cards };
  const winners = Object.entries(won).map(([seat, amount]) => ({ seat: Number(seat), amount, hand: hands[seat].name }));
  t.showdown = { revealed, winners, pot: potTotal(t) };
  for (const w of winners) log(t, `${t.seats[w.seat].name} wins ${w.amount} with ${w.hand.toLowerCase()}.`);
  endHand(t, now, SHOWDOWN_SECONDS);
}

function endHand(t, now: number, pauseSeconds: number) {
  t.phase = "showdown";
  t.turn = -1;
  t.deadline = null;
  t.next_hand_at = iso(now + pauseSeconds * 1000);
  t.current_bet = 0;
  for (const i of occupied(t)) {
    const s = t.seats[i];
    // Busted players sit out until they add chips.
    if (s.stack === 0 && !s.left) s.sitting_out = true;
  }
}

// Called on every request: handles expired turns and starts the next hand.
// Returns true if anything changed.
export function tick(t, secret, now: number) {
  let changed = false;
  for (let guard = 0; guard < 12; guard++) {
    if (["preflop", "flop", "turn", "river"].includes(t.phase) && t.deadline && Date.parse(t.deadline) <= now) {
      const i = t.turn;
      const s = t.seats[i];
      if (s) {
        s.timeouts = (s.timeouts || 0) + 1;
        if (s.timeouts >= 2) s.sitting_out = true;
        if (t.current_bet - s.bet <= 0) {
          s.acted = true;
          s.last_action = "Check (time)";
          advance(t, secret, now, false);
        } else {
          forceFold(t, secret, i, now, "Fold (time)");
        }
        changed = true;
        continue;
      }
    }
    if ((t.phase === "showdown" && t.next_hand_at && Date.parse(t.next_hand_at) <= now) || t.phase === "waiting") {
      const before = t.phase;
      const dealt = startHand(t, secret, now);
      if (dealt || before !== t.phase) changed = true;
      if (dealt) continue;
    }
    break;
  }
  return changed;
}

// What a given member may see: the public table plus their own cards.
export function viewFor(t, secret, seatIdx: number) {
  const mine = seatIdx >= 0 && secret && secret.hand_no === t.hand_no && secret.holes ? secret.holes[seatIdx] || null : null;
  return { my_seat: seatIdx, my_cards: mine };
}