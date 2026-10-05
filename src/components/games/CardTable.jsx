import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import DealtCards, { DEAL_STEP_MS, DealerDeck } from "@/components/DealtCards";
import Avatar from "@/components/Avatar";
import { BetSpot, ChipRack, ChipTray, FeltPrint, CHIP_VALUES } from "./ChipBetting";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { ReactionBar, ReactionBubble, useReactions } from "./Reactions";
import { cn } from "@/lib/utils";
import { useTableGuard } from "@/lib/tableGuard";

// A shared card table (Blackjack, Lucky 9) with six chairs. Members sit down, then
// bet each round from their chair and play their own hand against the same dealer. The server deals and decides everything;
// this page only shows what it is told, and asks again every couple of seconds.
const POLL_MS = 2500;
const NO_TABLE = "Couldn't reach the table.";

const RESULT_TEXT = {
  blackjack: { text: "Blackjack!", win: true },
  win: { text: "You win", win: true },
  push: { text: "Tie. Your wager is returned.", win: null },
  lose: { text: "The house wins", win: false },
  void: { text: "Your bet arrived too late and was returned.", win: null }
};
const NOTE = { stood: "Stayed", bust: "Bust", blackjack: "Blackjack", drew: "Drew", doubled: "Doubled", split: "Split", timeout: "Timed out", dealer: "" };

// One chair at the table: empty (tap to sit) or a member with this round's hand.
function Chair({ chair, canSit, busy, onSit, hideResult, reaction }) {
  if (chair.empty) {
    return (
      <button
        type="button"
        onClick={() => onSit(chair.seat)}
        disabled={!canSit || !!busy}
        aria-label={canSit ? `Sit at seat ${chair.seat + 1}` : `Seat ${chair.seat + 1}, empty`}
        className={cn(
          "flex min-h-[112px] flex-col items-center justify-center rounded-md border border-dashed border-bronze/50 bg-black/20 px-1 py-2 text-center",
          canSit ? "text-gold hover:border-gold hover:bg-black/35" : "text-mist/50"
        )}
      >
        <span className="text-[11px] uppercase tracking-wide">Seat {chair.seat + 1}</span>
        <span className="mt-1 font-heading text-sm font-bold">{busy === "sit" ? "…" : canSit ? "Sit here" : "Empty"}</span>
      </button>
    );
  }
  const h = chair.hand;
  const r = h && h.result && !hideResult ? RESULT_TEXT[h.result] : null;
  return (
    <div className={cn(
      "relative flex min-h-[112px] flex-col items-center rounded-md border bg-black/30 px-1 py-2 text-center",
      chair.mine ? "border-gold shadow-[0_0_0_1px_hsl(var(--gold,45_90%_55%)/0.4)]" : "border-bronze/50",
      h && h.status === "playing" && "ring-1 ring-gold/60"
    )}>
      <ReactionBubble r={reaction} className="-top-3" />
      <Avatar url={chair.avatar} name={chair.name} size={28} />
      <p className={cn("mt-1 w-full truncate text-xs font-bold", chair.mine ? "text-gold" : "text-[hsl(var(--foreground))]")}>{chair.mine ? "You" : chair.name}</p>
      {h ? (
        <>
          <div className="mt-1 flex min-h-[30px] flex-wrap items-center justify-center gap-0.5">
            {h.hands ? h.hands.map((x, i) => (
              <span key={i} className={cn("flex items-center gap-0.5 rounded px-0.5", i === h.hand_ix && h.status === "playing" && "ring-1 ring-gold/60")}>
                <DealtCards cards={x.cards} size="xs" offset={chair.seat * 150} />
              </span>
            )) : <DealtCards cards={h.cards} size="xs" offset={chair.seat * 150} />}
          </div>
          <p className="mt-1 text-[11px] leading-tight text-mist">
            <Points value={h.staked} iconSize={10} />
            {h.hands ? <> · {h.hands.map((x) => x.total).join(" / ")}</> : h.total !== null && <> · {h.total}</>}
          </p>
          <p className={cn("text-[11px] font-bold leading-tight", r ? (r.win === true ? "text-gold" : r.win === false ? "text-ember" : "text-mist") : "text-mist")}>
            {r ? (h.net > 0 ? `+${h.net.toLocaleString()}` : h.net < 0 ? h.net.toLocaleString() : "Tie")
              : h.status === "playing" ? "Playing" : h.status === "done" ? (NOTE[h.note] || "Done") : "Bet placed"}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-mist/60">No bet</p>
      )}
    </div>
  );
}

function Cards({ cards, hidden = 0, size = "lg", empty }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", size === "lg" && "min-h-[88px]")}>
      <DealtCards cards={cards} hidden={hidden} size={size} />
      {cards.length === 0 && hidden === 0 && empty && <span className="text-sm text-mist/60">{empty}</span>}
    </div>
  );
}

export default function CardTable({ fn, title, dealerLabel = "Dealer", actions, rules, settings, balance, felt, winNote, sideBets, tips }) {
  const { setBalance, reload } = useGuild();
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [wager, setWager] = useState(0); // chips on the main spot
  const [chip, setChip] = useState(0);   // the chip picked up from the tray
  const [moves, setMoves] = useState([]); // chips put down, newest last (for Undo)
  const [chipNote, setChipNote] = useState("");
  const [sides, setSides] = useState({}); // optional side bets: { id: amount }
  const first = useRef(true);
  const paidRound = useRef(0);
  // The dealer's last cards are dealt one at a time; results wait until they're all down.
  const [shownRound, setShownRound] = useState(0);
  const dealerSeen = useRef({ round: 0, count: -1 });
  const busyRef = useRef("");
  const hasData = useRef(false);
  busyRef.current = busy;

  const newest = useRef(0); // server time of the newest answer shown
  const take = useCallback((d) => {
    if (!d || !d.table) return;
    // Answers can arrive out of order. One that is older than what is already on screen
    // would make chips just placed vanish, so it is dropped.
    const stamp = Date.parse(d.table.server_now) || 0;
    if (stamp && stamp < newest.current) return;
    newest.current = stamp;
    hasData.current = true;
    idle.current = d.table.status === "betting" && !d.table.bets_close_at && !d.mine;
    setData(d);
    setOffset(Date.parse(d.table.server_now) - Date.now());
    if (typeof d.balance === "number") setBalance(d.balance);
    if (d.table.status !== "settled") dealerSeen.current = { round: d.table.round_no, count: d.table.dealer.cards.length };
  }, [setBalance, reload]);

  const idle = useRef(false);
  const tickNo = useRef(0);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    // Nothing is happening at an empty table, so it only needs checking half as often.
    if (idle.current && tickNo.current++ % 2) return;
    try {
      const res = await base44.functions.invoke(fn, { action: "state", first: first.current });
      first.current = false;
      take(res.data);
      setError((prev) => (prev === NO_TABLE ? "" : prev));
    } catch (e) {
      // A missed background refresh isn't worth an error: the next one will catch up.
      if (!hasData.current && !(e && e.rateLimited)) setError(NO_TABLE);
    }
  }, [fn, take]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh]);

  // An emoji reaction, shown over the member's chair to everyone at the table.
  const reactionAt = useReactions(data && data.reactions);
  const react = useCallback(async (emoji) => {
    const res = await base44.functions.invoke(fn, { action: "react", emoji });
    if (res.data && res.data.reactions) setData((d) => (d ? { ...d, reactions: res.data.reactions } : d));
  }, [fn]);

  const send = useCallback(async (action, extra) => {
    if (busyRef.current) return;
    setBusy(action);
    setError("");
    try {
      const res = await base44.functions.invoke(fn, { action, ...(extra || {}) });
      take(res.data);
    } catch (e) {
      setError(errorText(e, "That didn't go through. Try again."));
    } finally {
      setBusy("");
    }
  }, [fn, take]);

  // Hold the result back while the dealer's new cards are being dealt, then show it
  // and refresh the member's points.
  const settledRound = data && data.table.status === "settled" ? data.table.round_no : 0;
  const dealerCards = data ? data.table.dealer.cards.length : 0;
  const iPlayed = !!(data && data.mine);
  useEffect(() => {
    if (!settledRound || shownRound === settledRound) return undefined;
    const seen = dealerSeen.current;
    const fresh = seen.round === settledRound && seen.count >= 0 ? Math.max(0, dealerCards - seen.count) : 0;
    const timer = setTimeout(() => {
      setShownRound(settledRound);
      if (iPlayed && paidRound.current !== settledRound) { paidRound.current = settledRound; reload(); }
    }, fresh ? fresh * DEAL_STEP_MS + 500 : 0);
    return () => clearTimeout(timer);
  }, [settledRound, shownRound, dealerCards, iPlayed, reload]);

  // Seated members are asked before they wander off to another game or page.
  const guardSeated = !!data && data.my_seat >= 0;
  const guardInHand = !!(data && data.mine && !data.mine.result);
  useTableGuard(guardSeated, {
    message: () => (guardInHand
      ? `Your hand at the ${title.replace(/^Blacklist /, "")} table is still in play. Finish this round before you leave.`
      : `You're seated at the ${title.replace(/^Blacklist /, "")} table. Leaving gives up your seat.`),
    canLeave: () => !guardInHand,
    leave: () => base44.functions.invoke(fn, { action: "leave" })
  });

  // ----- the chips ARE the bet: whatever sits on the spots is sent to the table by itself -----
  const keyOf = (w, sd) => JSON.stringify([w, Object.keys(sd).sort().filter((k) => sd[k] > 0).map((k) => [k, sd[k]])]);
  const sentKey = useRef(keyOf(0, {})); // what the table already has from us
  const syncing = useRef(false);
  const latest = useRef({ wager: 0, sides: {}, key: keyOf(0, {}) });
  const [syncNo, setSyncNo] = useState(0);
  const [lastBet, setLastBet] = useState(null);
  const tStatus = data ? data.table.status : "";
  const tRound = data ? data.table.round_no : 0;
  const closeAt = data && data.table.bets_close_at ? Date.parse(data.table.bets_close_at) : 0;
  // Chips can go down or come off only while bets are open. Once time is up they stay.
  const betOpen = !!data && data.my_seat >= 0 && tStatus === "betting" && data.open !== false && (!closeAt || closeAt - (now + offset) > 700);
  const cleanSides = Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))]).filter(([, v]) => v > 0));
  const localKey = keyOf(wager, cleanSides);
  latest.current = { wager, sides: cleanSides, key: localKey };
  const mineRow = data ? data.mine : null;

  // Follow the table whenever nothing of ours is waiting to be sent, and start each round empty.
  useEffect(() => {
    if (!data || syncing.current) return;
    if (mineRow && mineRow.status !== "waiting" && mineRow.wager > 0) setLastBet({ wager: mineRow.wager, sides: mineRow.sides || {} });
    const unsent = latest.current.key !== sentKey.current;
    if (tStatus === "betting" && unsent) return;
    const on = tStatus === "betting" && mineRow && mineRow.status === "waiting" ? { w: mineRow.wager || 0, sd: mineRow.sides || {} } : { w: 0, sd: {} };
    const k = keyOf(on.w, on.sd);
    sentKey.current = k;
    if (latest.current.key !== k) { setWager(on.w); setSides(on.sd); setMoves([]); }
  }, [data, tStatus, tRound]);

  // Send the spots to the table a moment after they change.
  useEffect(() => {
    if (!betOpen || localKey === sentKey.current) return undefined;
    if (wager > 0 && wager < settings.min_bet) return undefined; // waits for more chips
    if (Object.values(cleanSides).some((v) => v > wager)) return undefined;
    const timer = setTimeout(async () => {
      if (syncing.current) return;
      syncing.current = true;
      const want = latest.current;
      try {
        const res = await base44.functions.invoke(fn, { action: "bet", wager: want.wager, sides: want.sides });
        sentKey.current = want.key;
        syncing.current = false;
        take(res.data);
        setChipNote("");
      } catch (e) {
        syncing.current = false;
        setChipNote(errorText(e, "Those chips didn't go down."));
        // put the spots back to what the table really has
        const back = JSON.parse(sentKey.current);
        setWager(back[0]);
        setSides(Object.fromEntries(back[1]));
        setMoves([]);
        // The request may have failed after the chips were taken: ask the table what it really has.
        setTimeout(refresh, 300);
      } finally {
        setSyncNo((n) => n + 1);
      }
    }, closeAt && closeAt - (now + offset) < 2500 ? 0 : 450); // a burst of chips goes as one bet, unless time is nearly up
    return () => clearTimeout(timer);
  }, [localKey, betOpen, syncNo]);

  if (!data) return <Panel title={title}>{error ? <p role="alert" className="py-6 text-center text-sm text-ember">{error}</p> : <LanternSpinner label="Finding the table" className="py-12" />}</Panel>;

  const { table, chairs, mine } = data;
  const seated = data.my_seat >= 0;
  const bettors = chairs.filter((c) => c.hand).length;
  const sitting = chairs.filter((c) => !c.empty).length;
  const serverNow = now + offset;
  const left = (at) => (at ? Math.max(0, Math.ceil((Date.parse(at) - serverNow) / 1000)) : null);
  const betLeft = table.status === "betting" ? left(table.bets_close_at) : null;
  const actLeft = table.status === "playing" ? left(table.act_close_at) : null;
  const nextLeft = table.status === "settled" ? left(table.next_at) : null;
  // After a split the buttons act on the hand being played.
  const cur = mine && mine.hands ? mine.hands[mine.hand_ix] || mine.hands[0] : mine;
  const myTurn = table.status === "playing" && mine && mine.status === "playing";
  const drawing = table.status === "settled" && shownRound !== table.round_no;
  const res = mine && mine.result && !drawing ? RESULT_TEXT[mine.result] : null;
  const sideList = sideBets || [];
  const sideAmount = (id) => Math.max(0, Math.floor(Number(sides[id]) || 0));
  const sideTotal = sideList.reduce((t, b) => t + sideAmount(b.id), 0);
  const stake = wager + sideTotal;
  const sideProblem = sideList.some((b) => sideAmount(b.id) > wager) ? "A side bet can be at most the size of your main wager."
    : stake > settings.max_bet ? `Your wager and side bets together can be at most ${settings.max_bet.toLocaleString()}.`
    : "";
  // ----- chips -----
  const chipList = CHIP_VALUES.filter((v) => v <= settings.max_bet && v >= Math.min(10, settings.min_bet));
  const useChip = chipList.includes(chip) ? chip : chipList[0] || 0;
  const canChip = betOpen;
  // While bets are open the spots show the member's own chips; after that, what was dealt in.
  const spotAmount = (id) => (canChip ? (id === "main" ? wager : sideAmount(id)) : mine ? (id === "main" ? mine.wager : (mine.sides && mine.sides[id]) || 0) : 0);
  // Points already on the table this round are still theirs to move around.
  const onTable = mine && mine.status === "waiting" ? mine.staked || 0 : 0;
  const funds = balance + onTable;
  const spendable = Math.min(settings.max_bet, funds);
  const placed = canChip && localKey === sentKey.current && onTable > 0;
  const rebet = () => {
    if (!lastBet || !canChip) return;
    const total = lastBet.wager + Object.values(lastBet.sides || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    if (total > spendable) { setChipNote("You don't have enough points to repeat that bet."); return; }
    setChipNote(""); setWager(lastBet.wager); setSides({ ...(lastBet.sides || {}) }); setMoves([]);
  };
  const putChip = (id, value) => {
    if (!canChip || !value) return;
    if (stake + value > spendable) { setChipNote(stake + value > funds ? "You don't have enough points for that chip." : `Your bets together can be at most ${settings.max_bet.toLocaleString()}.`); return; }
    if (id !== "main" && sideAmount(id) + value > wager) { setChipNote("A side bet can be at most the size of your main bet. Put chips on BET first."); return; }
    setChipNote("");
    if (id === "main") setWager((w) => w + value); else setSides((cur) => ({ ...cur, [id]: (Math.floor(Number(cur[id])) || 0) + value }));
    setMoves((m) => [...m.slice(-60), { id, value }]);
  };
  const undoChip = () => {
    const last = moves[moves.length - 1];
    if (!last) return;
    setChipNote("");
    if (last.id === "main") setWager((w) => Math.max(0, w - last.value)); else setSides((cur) => ({ ...cur, [last.id]: Math.max(0, (Number(cur[last.id]) || 0) - last.value) }));
    setMoves((m) => m.slice(0, -1));
  };
  const clearChips = () => { setWager(0); setSides({}); setMoves([]); setChipNote(""); };
  const doubleChips = () => {
    if (stake * 2 > spendable) { setChipNote(stake * 2 > funds ? "You don't have enough points to double your bets." : `Your bets together can be at most ${settings.max_bet.toLocaleString()}.`); return; }
    setChipNote(""); setWager((w) => w * 2); setSides((cur) => Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, (Number(v) || 0) * 2]))); setMoves([]);
  };
  const inHand = mine && (!mine.result || drawing);
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  let banner;
  if (table.status === "betting") {
    banner = betLeft === null ? (seated ? "Put chips down to start the round." : "Take a seat to play.") : `Bets close in ${betLeft}s. ${bettors} in this round.`;
  } else if (table.status === "playing") {
    banner = myTurn ? `Play your hand: ${actLeft}s left.` : `Hands are being played: ${actLeft}s left.`;
  } else {
    banner = drawing ? `${dealerLabel} is drawing.` : nextLeft ? `Next round in ${nextLeft}s.` : "Next round is opening.";
  }

  return (
    <Panel title={title}>
      <div
        className={cn(
          "casino-felt mb-4 space-y-3 px-3 pb-12 pt-0 sm:px-5",
          res && res.win === true && "win-glow",
          res && res.win === false && "loss-shake"
        )}
        style={{ "--felt-hue": (felt && felt.hue) ?? 150 }}
        data-deal-table
      >
        <ChipRack />
        {/* the shoe the cards are dealt from */}
        <DealerDeck size="sm" className="!absolute right-3 top-7 rotate-12 sm:right-8" />
        <div className="flex flex-col items-center">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-white/70">
            {dealerLabel}
            {table.dealer.total !== null && !drawing && (
              <span className="ml-2 font-heading text-sm font-bold normal-case text-gold">{table.dealer.total}{table.dealer.hidden ? " showing" : ""}</span>
            )}
          </p>
          <div className="flex min-h-[88px] flex-wrap items-center justify-center gap-1.5">
            <DealtCards cards={table.dealer.cards} hidden={table.dealer.hidden} size="lg" />
            {table.dealer.cards.length === 0 && table.dealer.hidden === 0 && <span className="text-sm text-mist/60">Waiting for bets</span>}
          </div>
        </div>

        {felt && felt.lines && <FeltPrint lines={felt.lines} id={fn} />}

        <div className="grid grid-cols-3 gap-2">
          {chairs.map((c) => (
            <Chair key={c.seat} chair={c} canSit={!seated && data.open !== false} busy={busy} onSit={(seat) => send("sit", { seat })} hideResult={drawing} reaction={reactionAt(c.seat)} />
          ))}
        </div>

        <div role="status" aria-live="polite" className="min-h-[2.75rem] text-center">
          {res ? (
            <>
              <p className={cn("font-heading text-lg font-bold", res.win === true ? "text-gold" : res.win === false ? "text-ember" : "text-mist")}>{res.text}</p>
              <p className="text-sm text-mist">
                {mine.net > 0 ? <>You won <Points value={mine.net} className="font-bold text-gold" /></> : mine.net < 0 ? <>You lost <Points value={-mine.net} className="font-bold" /></> : "No points changed hands."}
                {" "}{banner}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/85">{banner}</p>
          )}
        </div>

        {mine && mine.cards.length > 0 && (
          <div className="rounded-md border border-white/20 bg-black/35 p-3">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-mist">
              Your hand
              {!mine.hands && mine.total !== null && <span className="ml-2 font-heading text-sm font-bold normal-case text-gold">{mine.total}</span>}
              <span className="ml-2 normal-case text-mist">· <Points value={mine.staked} iconSize={12} className="text-gold" /> on the table</span>
            </p>
            {mine.hands ? (
              <div className="space-y-2">
                {mine.hands.map((h, i) => {
                  const active = myTurn && i === mine.hand_ix;
                  const hr = h.result && !drawing ? h.result : null;
                  return (
                    <div key={i} className={cn("rounded-md border p-2", active ? "border-gold bg-gold/5" : "border-bronze/40")}>
                      <p className="mb-1 text-xs text-mist">
                        <span className="font-bold text-[hsl(var(--foreground))]">Hand {i + 1}</span>
                        <span className="ml-2 font-heading text-sm font-bold text-gold">{h.total}</span>
                        <span className="ml-2">· <Points value={h.stake} iconSize={11} className="text-gold" /></span>
                        <span className={cn("ml-2 font-bold", hr === "win" ? "text-gold" : hr === "lose" ? "text-ember" : active ? "text-gold" : "text-mist")}>
                          {hr ? (hr === "win" ? `Won +${h.stake.toLocaleString()}` : hr === "lose" ? "Lost" : "Tie") : active ? "Your move" : h.status === "playing" ? "Up next" : NOTE[h.note] || "Done"}
                        </span>
                      </p>
                      <Cards cards={h.cards} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <Cards cards={mine.cards} empty="Cards are dealt when betting closes" />
            )}
            {mine.side_total > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label="Your side bets">
                {sideList.filter((b) => mine.sides && mine.sides[b.id] > 0).map((b) => {
                  const w = mine.side_wins && mine.side_wins[b.id];
                  return (
                    <li key={b.id} className={cn("rounded-full border px-2 py-0.5", !w ? "border-bronze/50 text-mist" : w.win > 0 ? "border-gold bg-gold/15 font-bold text-gold" : "border-bronze/40 text-mist/70 line-through")}>
                      {b.name} · {mine.sides[b.id].toLocaleString()}
                      {w ? (w.win > 0 ? ` · ${w.name} +${(w.win - mine.sides[b.id]).toLocaleString()}` : " · no win") : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

        {/* the bet spots printed on the felt, and the chip tray on the rail */}
        {seated && (!mine || table.status === "betting") && (
          <div className="space-y-3 pt-1">
            <div className="flex items-start justify-center gap-3 sm:gap-6">
              {sideList[0] && <BetSpot id={sideList[0].id} label={sideList[0].name} sub={sideList[0].short} amount={spotAmount(sideList[0].id)} locked={!canChip} armed={!!useChip} bad={!mine && sideAmount(sideList[0].id) > wager} onTap={() => putChip(sideList[0].id, useChip)} />}
              <BetSpot id="main" label="Bet" sub={canChip ? "Drop chips here" : ""} amount={spotAmount("main")} big locked={!canChip} armed={!!useChip} onTap={() => putChip("main", useChip)} />
              {sideList[1] && <BetSpot id={sideList[1].id} label={sideList[1].name} sub={sideList[1].short} amount={spotAmount(sideList[1].id)} locked={!canChip} armed={!!useChip} bad={!mine && sideAmount(sideList[1].id) > wager} onTap={() => putChip(sideList[1].id, useChip)} />}
            </div>
            {canChip && (
              <>
                {/* reactions sit above the chips */}
                <ReactionBar onSend={react} />
                <ChipTray chips={chipList} selected={useChip} onSelect={setChip} onDrop={putChip} disabled={!!busy} />
                <div className="flex items-center justify-center gap-2">
                  <button type="button" onClick={undoChip} disabled={!moves.length} className="btn-bronze h-8 px-3 text-xs">Undo</button>
                  <button type="button" onClick={clearChips} disabled={!stake} className="btn-bronze h-8 px-3 text-xs">Remove all</button>
                  <button type="button" onClick={doubleChips} disabled={!stake} className="btn-bronze h-8 px-3 text-xs">Double</button>
                  {lastBet && !stake && <button type="button" onClick={rebet} className="btn-bronze h-8 px-3 text-xs">Same as last</button>}
                </div>
                {(chipNote || sideProblem) && <p role="alert" className="text-center text-xs font-bold text-ember">{chipNote || sideProblem}</p>}
                {/* no button to press: chips on the spots are the bet */}
                <p className="text-center text-sm font-bold text-white/90" aria-live="polite">
                  {!stake ? "Put chips on BET and you're in."
                    : wager < settings.min_bet ? `Add more chips: the minimum is ${settings.min_bet.toLocaleString()}.`
                    : placed ? <>Your bet is in: <Points value={onTable} className="text-gold" />. Add or remove chips until bets close{betLeft !== null ? ` in ${betLeft}s` : ""}.</>
                    : sideProblem ? "" : "Placing your chips…"}
                </p>
                <p className="text-center text-[11px] text-white/60">Drag a chip onto a spot, or tap a chip and then tap the spot. Use Undo or Remove all to take chips back.</p>
              </>
            )}
          </div>
        )}

        {seated && !canChip && <ReactionBar onSend={react} />}

        {myTurn ? (
          <>
            <div className={cn("grid gap-2", actions.length === 4 ? "grid-cols-4" : actions.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
              {actions.map((a) => {
                const blocked = (a.firstTwoOnly && (cur.cards.length !== 2 || cur.doubled || mine.wager > balance)) || (a.splitOnly && (!mine.can_split || mine.wager > balance));
                return (
                  <button key={a.id} onClick={() => send(a.id)} disabled={!!busy || blocked} className={cn(a.primary ? "btn-seal" : "btn-bronze", "h-12 px-1", actions.length === 4 ? "text-sm" : "text-base")}>
                    {busy === a.id ? Spin : a.label}
                  </button>
                );
              })}
            </div>
            {/* say why an option is greyed out, and what it costs when it isn't */}
            {actions.filter((a) => a.firstTwoOnly).map((a) => (
              <p key={a.id} className="mt-2 text-center text-xs text-mist">
                {cur.cards.length !== 2 || cur.doubled ? `${a.label} is only offered on your first two cards.`
                  : mine.wager > balance ? `${a.label} needs ${mine.wager.toLocaleString()} more points and you have ${balance.toLocaleString()}.`
                  : `${a.label}: put ${mine.wager.toLocaleString()} more on the hand, take exactly one more card, then stand.`}
              </p>
            ))}
            {mine.can_split && actions.filter((a) => a.splitOnly).map((a) => (
              <p key={a.id} className="mt-1 text-center text-xs text-mist">
                {mine.wager > balance ? `${a.label} needs ${mine.wager.toLocaleString()} more points and you have ${balance.toLocaleString()}.`
                  : `${a.label}: put ${mine.wager.toLocaleString()} more down and play your two cards as two separate hands.`}
              </p>
            ))}
          </>
        ) : !seated && !mine ? (
          <p className="rounded-md border border-white/20 bg-black/35 px-3 py-3 text-center text-sm text-white/85">
            {data.open === false ? "This table is closed right now."
              : sitting >= chairs.length ? "The table is full. A chair opens when someone stands up."
              : "Tap an empty seat to sit down, then place your bet."}
          </p>
        ) : mine && !canChip ? (
          <p className="rounded-md border border-white/20 bg-black/35 px-3 py-2 text-center text-sm text-white/85">
            {table.status === "betting" ? "Bets are closed. Your chips stay on the table."
              : table.status === "playing" ? "Your hand is finished. Waiting for the others."
              : drawing ? `${dealerLabel} is drawing.` : "Round over."}
          </p>
        ) : null}

        {seated && (
          <div className="flex flex-col items-center gap-2">
            <button onClick={() => send("leave")} disabled={!!busy || inHand} className="btn-bronze h-9 px-5 text-xs">
              {busy === "leave" ? Spin : inHand ? "Finish this round to stand up" : "Stand up"}
            </button>
          </div>
        )}
      </div>

      {winNote && <p className="mb-3 text-center text-sm text-mist">{winNote}</p>}
      {tips && (
        <details className="mb-3 rounded border border-bronze/30 bg-black/30 px-2.5 py-2">
          <summary className="cursor-pointer text-sm text-gold">How side bets and splitting work, and what they pay</summary>
          <div className="mt-2 text-xs text-mist">{tips}</div>
        </details>
      )}

      <p className="mt-4 text-xs text-mist/80">{rules}</p>
    </Panel>
  );
}
