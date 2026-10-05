import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import DealtCards, { DEAL_STEP_MS } from "@/components/DealtCards";
import Avatar from "@/components/Avatar";
import WagerInput from "./WagerInput";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
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
const NOTE = { stood: "Stayed", bust: "Bust", blackjack: "Blackjack", drew: "Drew", doubled: "Doubled", timeout: "Timed out", dealer: "" };

// One chair at the table: empty (tap to sit) or a member with this round's hand.
function Chair({ chair, canSit, busy, onSit, hideResult }) {
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
      "flex min-h-[112px] flex-col items-center rounded-md border bg-black/30 px-1 py-2 text-center",
      chair.mine ? "border-gold shadow-[0_0_0_1px_hsl(var(--gold,45_90%_55%)/0.4)]" : "border-bronze/50",
      h && h.status === "playing" && "ring-1 ring-gold/60"
    )}>
      <Avatar url={chair.avatar} name={chair.name} size={28} />
      <p className={cn("mt-1 w-full truncate text-xs font-bold", chair.mine ? "text-gold" : "text-[hsl(var(--foreground))]")}>{chair.mine ? "You" : chair.name}</p>
      {h ? (
        <>
          <div className="mt-1 flex min-h-[30px] flex-wrap items-center justify-center gap-0.5">
            <DealtCards cards={h.cards} size="xs" offset={chair.seat * 150} />
          </div>
          <p className="mt-1 text-[11px] leading-tight text-mist">
            <Points value={h.staked} iconSize={10} />
            {h.total !== null && <> · {h.total}</>}
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

export default function CardTable({ fn, title, dealerLabel = "Dealer", actions, rules, settings, balance, feltClass, winNote }) {
  const { setBalance, reload } = useGuild();
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [wager, setWager] = useState(settings.min_bet);
  const first = useRef(true);
  const paidRound = useRef(0);
  // The dealer's last cards are dealt one at a time; results wait until they're all down.
  const [shownRound, setShownRound] = useState(0);
  const dealerSeen = useRef({ round: 0, count: -1 });
  const busyRef = useRef("");
  const hasData = useRef(false);
  busyRef.current = busy;

  const take = useCallback((d) => {
    if (!d || !d.table) return;
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
  const myTurn = table.status === "playing" && mine && mine.status === "playing";
  const drawing = table.status === "settled" && shownRound !== table.round_no;
  const res = mine && mine.result && !drawing ? RESULT_TEXT[mine.result] : null;
  const canBet = seated && table.status === "betting" && !mine && (betLeft === null || betLeft > 1) && wager >= settings.min_bet && wager <= settings.max_bet && wager <= balance;
  const inHand = mine && (!mine.result || drawing);
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  let banner;
  if (table.status === "betting") {
    banner = betLeft === null ? (seated ? "Place a bet to start the round." : "Take a seat to play.") : `Bets close in ${betLeft}s. ${bettors} in this round.`;
  } else if (table.status === "playing") {
    banner = myTurn ? `Play your hand: ${actLeft}s left.` : `Hands are being played: ${actLeft}s left.`;
  } else {
    banner = drawing ? `${dealerLabel} is drawing.` : nextLeft ? `Next round in ${nextLeft}s.` : "Next round is opening.";
  }

  return (
    <Panel title={title}>
      <div
        className={cn(
          "mb-4 space-y-4 rounded-md border border-bronze/40 p-3 sm:p-4",
          feltClass || "bg-[radial-gradient(circle_at_50%_30%,hsl(150_30%_14%),hsl(0_0%_6%))]",
          res && res.win === true && "win-glow",
          res && res.win === false && "loss-shake"
        )}
      >
        <div className="flex flex-col items-center">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-mist">
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

        <div className="grid grid-cols-3 gap-2">
          {chairs.map((c) => (
            <Chair key={c.seat} chair={c} canSit={!seated && data.open !== false} busy={busy} onSit={(seat) => send("sit", { seat })} hideResult={drawing} />
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
            <p className="text-sm text-mist">{banner}</p>
          )}
        </div>
      </div>

      {mine && (
        <div className="mb-4 rounded-md border border-bronze/40 bg-black/25 p-3">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-mist">
            Your hand
            {mine.total !== null && <span className="ml-2 font-heading text-sm font-bold normal-case text-gold">{mine.total}</span>}
            <span className="ml-2 normal-case text-mist">· <Points value={mine.staked} iconSize={12} className="text-gold" /> on the table</span>
          </p>
          <Cards cards={mine.cards} empty="Cards are dealt when betting closes" />
        </div>
      )}

      {error && <p role="alert" className="mb-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

      {myTurn ? (
        <div className={cn("grid gap-2", actions.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {actions.map((a) => {
            const blocked = a.firstTwoOnly && (mine.cards.length !== 2 || mine.doubled || mine.wager > balance);
            return (
              <button key={a.id} onClick={() => send(a.id)} disabled={!!busy || blocked} className={cn(a.primary ? "btn-seal" : "btn-bronze", "h-12 text-base")}>
                {busy === a.id ? Spin : a.label}
              </button>
            );
          })}
        </div>
      ) : !seated && !mine ? (
        <p className="rounded-md border border-bronze/40 bg-black/25 px-3 py-3 text-center text-sm text-mist">
          {data.open === false ? "This table is closed right now."
            : sitting >= chairs.length ? "The table is full. A chair opens when someone stands up."
            : "Tap an empty seat to sit down, then place your bet."}
        </p>
      ) : table.status === "betting" && !mine ? (
        <div className="space-y-4">
          <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={settings.max_bet} balance={balance} disabled={!!busy} />
          <button onClick={() => send("bet", { wager })} disabled={!!busy || !canBet || data.open === false} className="btn-seal h-12 w-full text-base">
            {busy === "bet" ? <>{Spin} Placing bet</> : data.open === false ? "Table closed" : "Place bet"}
          </button>
          {winNote && <p className="text-center text-sm text-mist">{winNote}</p>}
        </div>
      ) : (
        <p className="rounded-md border border-bronze/40 bg-black/25 px-3 py-3 text-center text-sm text-mist">
          {table.status === "betting" ? "You're in. Waiting for betting to close."
            : table.status === "playing" ? (mine ? "Your hand is finished. Waiting for the others." : "A round is in progress. You can bet on the next one.")
            : drawing ? `${dealerLabel} is drawing.` : "Round over."}
        </p>
      )}

      {seated && (
        <button onClick={() => send("leave")} disabled={!!busy || inHand} className="btn-bronze mt-3 h-10 w-full text-sm">
          {busy === "leave" ? Spin : inHand ? "Finish this round to stand up" : "Stand up"}
        </button>
      )}

      <p className="mt-4 text-xs text-mist/80">{rules}</p>
    </Panel>
  );
}