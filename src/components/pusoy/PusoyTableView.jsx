import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import PlayingCard from "@/components/poker/PlayingCard";
import { Dealt, useDealDelays } from "@/components/DealtCards";
import Avatar from "@/components/Avatar";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { canFollow, sortByRank, sortBySuit, rankLabel, SUIT_SYMBOL, SUIT_NAME } from "@/lib/pusoy";
import { cn } from "@/lib/utils";
import SuitOrder from "./SuitOrder";
import { useTableGuard } from "@/lib/tableGuard";
import ChatBox from "@/components/chat/ChatBox";
import { ReactionBar, ReactionBubble, useReactions } from "@/components/games/Reactions";

// A live Pusoy Dos table. The server deals, checks every play and runs the clock;
// this page shows what it is told and asks again every second or so.
const POLL_MS = 2000;
const cardRank = (c) => "3456789TJQKA2".indexOf(c[0]) * 4 + "dchs".indexOf(c[1]);

function Seat({ s, table, left, canSit, busy, onSit, firstSeat, reaction }) {
  if (s.empty) {
    return (
      <button
        type="button"
        onClick={() => onSit(s.seat)}
        disabled={!canSit || !!busy}
        className={cn(
          "flex min-h-[116px] flex-col items-center justify-center rounded-md border border-dashed border-bronze/50 bg-black/20 px-1 py-2 text-center",
          canSit ? "text-gold hover:border-gold hover:bg-black/35" : "text-mist/50"
        )}
      >
        <span className="text-[11px] uppercase tracking-wide">Seat {s.seat + 1}</span>
        <span className="mt-1 font-heading text-sm font-bold">{canSit ? "Sit here" : "Empty"}</span>
      </button>
    );
  }
  const turn = table.status === "playing" && table.turn === s.seat;
  const won = table.result && table.result.winner === s.seat;
  const shown = (table.opening || []).find((o) => o.seat === s.seat);
  const high = table.status === "playing" && shown ? shown.card : null;
  const first = high && firstSeat === s.seat;
  let note = "";
  if (table.status === "playing") {
    note = !s.in_game ? "Next game" : s.out ? "Forfeited" : turn ? `${left}s` : s.passed ? "Passed" : "";
  } else if (table.status === "finished") note = won ? "Winner" : "";
  return (
    <div className={cn(
      "relative flex min-h-[116px] flex-col items-center rounded-md border bg-black/30 px-1 py-2 text-center",
      turn ? "border-gold ring-1 ring-gold/70" : s.mine ? "border-gold/70" : "border-bronze/50",
      won && "win-glow"
    )}>
      <ReactionBubble r={reaction} className="-top-3" />
      <Avatar url={s.avatar} name={s.name} size={28} />
      <p className={cn("mt-1 w-full truncate text-xs font-bold", s.mine ? "text-gold" : "text-[hsl(var(--foreground))]")}>{s.mine ? "You" : s.name}</p>
      {s.count !== null && (
        <p className="mt-0.5 text-[11px] leading-tight text-mist"><span className="font-heading text-sm font-bold text-[hsl(var(--foreground))]">{s.count}</span> card{s.count === 1 ? "" : "s"}</p>
      )}
      <p className={cn("text-[11px] font-bold leading-tight", turn || won ? "text-gold" : "text-mist")}>{note}</p>
      {high && (
        <p className="mt-1 flex items-center gap-1 text-[10px] leading-none text-mist" title="Highest card, shown at the deal. Hidden again once play starts.">
          High <PlayingCard card={high} size="xs" className={first ? "ring-1 ring-gold" : ""} />
        </p>
      )}
    </div>
  );
}

export default function PusoyTableView({ tableId }) {
  const { setBalance, reload } = useGuild();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [gone, setGone] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState([]);
  const [bySuit, setBySuit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const busyRef = useRef("");
  const leaving = useRef(false); // the member pressed Stand up themselves: no second question
  const paidGame = useRef(0);
  busyRef.current = busy;

  const take = useCallback((d) => {
    if (!d || !d.table) return;
    idle.current = d.table.status === "waiting" && !d.table.start_at;
    setData(d);
    setOffset(Date.parse(d.table.server_now) - Date.now());
    if (typeof d.balance === "number") setBalance(d.balance);
    setPicked((p) => p.filter((c) => (d.hand || []).includes(c)));
    if (d.table.status === "finished" && paidGame.current !== d.table.game_no) {
      paidGame.current = d.table.game_no;
      reload();
    }
  }, [setBalance, reload]);

  const idle = useRef(false);
  const tickNo = useRef(0);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    // A table still waiting for a second player only needs checking half as often.
    if (idle.current && tickNo.current++ % 2) return;
    try {
      const res = await base44.functions.invoke("pusoyAction", { action: "state", tableId });
      take(res.data);
    } catch (e) {
      if (e && e.response && e.response.status === 404) setGone(true);
    }
  }, [tableId, take]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh]);

  const send = useCallback(async (action, extra) => {
    if (busyRef.current) return null;
    setBusy(action);
    setError("");
    try {
      const res = await base44.functions.invoke("pusoyAction", { action, tableId, ...(extra || {}) });
      take(res.data);
      return res.data;
    } catch (e) {
      setError(errorText(e, "That didn't go through. Try again."));
      return null;
    } finally {
      setBusy("");
    }
  }, [tableId, take]);

  const reactionAt = useReactions(data && data.reactions);
  const react = useCallback(async (emoji) => {
    const res = await base44.functions.invoke("pusoyAction", { action: "react", tableId, emoji });
    if (res.data && res.data.reactions) setData((d) => (d ? { ...d, reactions: res.data.reactions } : d));
  }, [tableId]);

  const hand = useMemo(() => (data ? (bySuit ? sortBySuit(data.hand) : sortByRank(data.hand)) : []), [data, bySuit]);
  // The 13 cards are dealt into the hand one at a time.
  const dealDelay = useDealDelays(hand.map((c) => `${data ? data.table.game_no : 0}:${c}`), 160);

  // Seated members are asked before they move to another page.
  const gSeat = data && data.my_seat >= 0 ? data.table.seats[data.my_seat] : null;
  const gPlaying = !!(gSeat && data.table.status === "playing" && gSeat.in_game && !gSeat.out);
  const gCost = data ? data.table.ante + (data.hand || []).length * data.table.stake : 0;
  useTableGuard(!!gSeat && !leaving.current, {
    message: () => (gPlaying
      ? `A game is in progress. Leaving now forfeits it and you lose ${gCost.toLocaleString()} points.`
      : "You're seated at this Pusoy Dos table. Leaving gives up your seat."),
    leave: () => base44.functions.invoke("pusoyAction", { action: "leave", tableId })
  });

  if (gone) {
    return (
      <Panel title="Table closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">This table has closed.</p>
        <Link to="/pusoy" className="btn-seal mx-auto mt-4 h-11 w-full max-w-xs">Back to the tables</Link>
      </Panel>
    );
  }
  if (!data) return <LanternSpinner label="Finding the table" className="py-24" />;

  const { table } = data;
  const seated = data.my_seat >= 0;
  const me = seated ? table.seats[data.my_seat] : null;
  const serverNow = now + offset;
  const left = (at) => (at ? Math.max(0, Math.ceil((Date.parse(at) - serverNow) / 1000)) : null);
  const turnLeft = left(table.deadline);
  const myTurn = table.status === "playing" && seated && table.turn === data.my_seat;
  const leading = !table.last;
  const top = table.last ? table.last.cards[0] : null;
  const picked1 = picked[0] || null;
  const pickOk = !!picked1 && canFollow(picked1, top);
  const playable = hand.filter((c) => canFollow(c, top));
  // Who showed the highest card at the deal (they went first).
  const firstSeat = (table.opening || []).reduce((best, o) => (best === null || cardRank(o.card) > cardRank(best.card) ? o : best), null)?.seat ?? -1;
  const players = table.seats.filter((s) => !s.empty).length;
  const turnName = table.status === "playing" && table.seats[table.turn] ? (table.seats[table.turn].mine ? "You" : table.seats[table.turn].name) : "";
  const res = table.result;
  const myRow = res ? res.rows.find((r) => r.mine) : null;
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  const toggle = (c) => setPicked((p) => (p.includes(c) ? [] : [c])); // one card at a time
  const playNow = async () => { const out = await send("play", { cards: picked }); if (out) setPicked([]); };
  const inGame = table.status === "playing" && seated && me.in_game && !me.out;
  const standUp = async () => {
    // Leaving mid-game costs points, so it takes a second tap.
    if (inGame && !confirmLeave) { setConfirmLeave(true); return; }
    leaving.current = true;
    const out = await send("leave");
    if (out) { reload(); navigate("/pusoy"); } else leaving.current = false;
  };

  let banner;
  if (table.status === "waiting") {
    const s = left(table.start_at);
    banner = players < 2 ? "Waiting for another player to sit down." : s !== null ? `Dealing in ${s}s.` : "Dealing.";
  } else if (table.status === "playing") {
    banner = myTurn
      ? (leading
        ? (table.pile.length === 0 ? "You showed the highest card, so you go first. Lead any card." : "Everyone passed. Lead any card to set a new suit.")
        : playable.length ? `Play a ${SUIT_NAME[top[1]].slice(0, -1).toLowerCase()}, or a ${rankLabel(top)} of another suit to change the suit.` : "You have nothing to play. Pass.")
      : `${turnName}${turnName === "You" ? "r" : "'s"} turn.`;
  } else {
    const s = left(table.next_at);
    banner = s ? `Next game in ${s}s.` : "Setting up the next game.";
  }

  return (
    <div className="mx-auto grid max-w-[64rem] gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/pusoy" className="flex items-center gap-1 text-sm text-mist hover:text-gold"><ArrowLeft className="h-4 w-4" /> Tables</Link>
        <p className="text-right text-sm text-mist">Pot money <Points value={table.ante} iconSize={12} className="font-bold text-gold" />{table.stake > 0 && <> · <Points value={table.stake} iconSize={12} className="font-bold text-gold" /> per card</>}</p>
      </div>

      <Panel title={table.name}>
        <SuitOrder className="mb-3" />

        <div className="space-y-3 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_30%,hsl(215_30%_15%),hsl(0_0%_6%))] p-3 sm:p-4">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {table.seats.map((s) => (
              <Seat key={s.seat} s={s} table={table} left={turnLeft} firstSeat={firstSeat} canSit={!seated && data.open !== false} busy={busy} onSit={(seat) => send("sit", { seat })} reaction={reactionAt(s.seat)} />
            ))}
          </div>

          <div className="flex min-h-[132px] flex-col items-center justify-center rounded-md border border-bronze/30 bg-black/25 p-2 text-center">
            {table.status === "finished" && res && (
              <div className="mb-2">
                <p className="font-heading text-lg font-bold text-gold">{myRow && myRow.net > 0 ? "You win!" : `${res.winner_name} wins`}</p>
                <p className="text-sm text-mist">
                  {myRow ? (myRow.net > 0 ? <>You won <Points value={myRow.net} className="font-bold text-gold" /></> : <>You lose <Points value={-myRow.net} className="font-bold text-ember" />{table.stake > 0 && <> (pot money + {myRow.left} card{myRow.left === 1 ? "" : "s"})</>}</>) : <>The winner collects <Points value={res.win} className="font-bold text-gold" /></>}
                </p>
              </div>
            )}
            {table.status === "playing" && (
              <p className="mb-1.5 text-xs text-mist">
                {top ? (
                  <>
                    Suit in game{" "}
                    <span className={cn("font-heading text-base font-bold", top[1] === "h" || top[1] === "d" ? "text-ember" : "text-[hsl(var(--foreground))]")}>{SUIT_SYMBOL[top[1]]} {SUIT_NAME[top[1]]}</span>
                    {" · "}<span className="font-bold text-[hsl(var(--foreground))]">{table.seats[table.last.seat].mine ? "You" : table.seats[table.last.seat].name}</span> played
                  </>
                ) : table.pile.length ? "No suit in game: the next card sets it" : "No cards played yet"}
              </p>
            )}
            {table.pile.length > 0 ? (
              // Every card played stays on the table: older cards stacked small, the newest on top.
              <div className="flex max-w-full flex-wrap items-end justify-center pl-1" aria-label={`${table.pile.length} cards on the table`}>
                {table.pile.map((c, i) => {
                  const newest = i === table.pile.length - 1;
                  return <span key={c} className={newest ? "card-deal inline-flex" : "inline-flex"}><PlayingCard card={c} size={newest ? "md" : "xs"} highlight={newest && !!top} className={cn("mb-1", newest ? "ml-1.5" : "-ml-1 opacity-80")} /></span>;
                })}
              </div>
            ) : (
              table.status !== "finished" && <p className="text-sm text-mist/70">{table.status === "playing" ? "" : "No cards on the table"}</p>
            )}
            {table.pile.length > 0 && <p className="mt-1 text-[11px] text-mist/80">{table.pile.length} card{table.pile.length === 1 ? "" : "s"} on the table</p>}
          </div>

          {seated && <ReactionBar onSend={react} />}

          <p role="status" aria-live="polite" className={cn("text-center text-sm", myTurn ? "font-bold text-gold" : "text-mist")}>
            {banner}{myTurn && turnLeft !== null ? ` ${turnLeft}s` : ""}
          </p>
        </div>

        {error && <p role="alert" className="mt-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

        {table.status === "finished" && res && (
          <ul className="mt-3 divide-y divide-bronze/25 rounded-md border border-bronze/40 bg-black/25 px-3">
            {res.rows.map((r) => (
              <li key={r.seat} className="flex items-center gap-2 py-2 text-sm">
                <span className={cn("min-w-0 flex-1 truncate font-bold", r.mine && "text-gold")}>{r.mine ? "You" : r.name}</span>
                <span className="flex flex-wrap justify-end gap-0.5">{r.cards.map((c) => <PlayingCard key={c} card={c} size="xs" />)}</span>
                <span className={cn("w-16 shrink-0 text-right font-heading font-bold tabular-nums", r.net > 0 ? "text-gold" : "text-ember")}>{r.net > 0 ? "+" : ""}{r.net.toLocaleString()}</span>
              </li>
            ))}
            <li className="py-2 text-xs text-mist">Winnings {res.pot.toLocaleString()} · {table.cut_pct}% removed from circulation ({res.cut.toLocaleString()})</li>
          </ul>
        )}

        {inGame && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-mist">Your hand · {hand.length}</p>
              <button type="button" onClick={() => setBySuit((v) => !v)} className="text-xs text-mist underline hover:text-gold">Sort by {bySuit ? "rank" : "suit"}</button>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {hand.map((c) => {
                const ok = canFollow(c, top);
                return (
                  <Dealt key={c} delay={dealDelay(`${table.game_no}:${c}`)}>
                    <button type="button" onClick={() => toggle(c)} aria-pressed={picked.includes(c)} className="rounded-[5px] pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                      <PlayingCard card={c} size="md" highlight={picked.includes(c)} dim={myTurn && !ok} className="!h-[60px] !w-[40px]" />
                    </button>
                  </Dealt>
                );
              })}
            </div>
            <p className="mt-2 min-h-[1.25rem] text-center text-xs text-mist">
              {!picked1 ? (myTurn && top ? `${playable.length} card${playable.length === 1 ? "" : "s"} you can play.` : "Tap a card to choose it.")
                : pickOk ? (!top ? "Leads and sets the suit." : picked1[1] === top[1] ? "Follows the suit." : `Changes the suit to ${SUIT_NAME[picked1[1]]}.`)
                : `Not playable: ${SUIT_NAME[top[1]]} are in game.`}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={playNow} disabled={!!busy || !myTurn || !pickOk} className="btn-seal h-12 text-base">{busy === "play" ? Spin : "Play"}</button>
              <button onClick={() => send("pass")} disabled={!!busy || !myTurn || leading} className="btn-bronze h-12 text-base">{busy === "pass" ? Spin : "Pass"}</button>
            </div>
          </div>
        )}

        {!seated && (
          <p className="mt-3 rounded-md border border-bronze/40 bg-black/25 px-3 py-3 text-center text-sm text-mist">
            {players >= table.seats.length ? "You're watching. The table is full." : `You're watching. Tap an empty seat to join (you need ${table.need.toLocaleString()} points).`}
          </p>
        )}
        {seated && table.status === "playing" && me.in_game && me.out && (
          <p className="mt-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-3 text-center text-sm text-ember">You ran out of time three turns in a row and forfeited this game.</p>
        )}
        {seated && table.status === "playing" && !me.in_game && (
          <p className="mt-3 rounded-md border border-bronze/40 bg-black/25 px-3 py-3 text-center text-sm text-mist">You're seated. You'll be dealt in when this game ends.</p>
        )}

        {seated && (
          <>
            <button onClick={standUp} disabled={!!busy} className={cn("btn-bronze mt-3 h-10 w-full text-sm", inGame && confirmLeave && "border-ember text-ember")}>
              {busy === "leave" ? Spin : inGame ? (confirmLeave ? `Tap again to forfeit and lose ${(table.ante + hand.length * table.stake).toLocaleString()}` : "Leave and forfeit") : "Stand up"}
            </button>
            {inGame && confirmLeave && (
              <button onClick={() => setConfirmLeave(false)} className="mt-2 w-full text-center text-xs text-mist underline hover:text-gold">Keep playing</button>
            )}
          </>
        )}

        <p className="mt-4 text-xs text-mist/80">
          Everyone puts in {table.ante.toLocaleString()} pot money and the first to empty their hand takes it.{table.stake > 0 ? ` Each loser also pays ${table.stake.toLocaleString()} for every card left.` : ""} {table.cut_pct}% of the winnings is removed from circulation. When a game is dealt, {table.need.toLocaleString()} points are held from each player and whatever isn't lost comes straight back. You have {table.turn_seconds} seconds a turn; run out three times in a row, or leave mid-game, and you forfeit: you lose your pot money{table.stake > 0 ? " and pay for every card you hold" : ""}.
        </p>
      </Panel>
    </div>

      {/* game chat: this table's own channel, plus the guild chat */}
      <div className="lg:sticky lg:top-24">
        <ChatBox channels={[{ id: `table:${tableId}`, label: "Table" }, { id: "guild", label: "Guild" }]} height="h-72 lg:h-[26rem]" />
      </div>
    </div>
  );
}