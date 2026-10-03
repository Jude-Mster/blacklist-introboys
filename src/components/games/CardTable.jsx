import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import PlayingCard from "@/components/poker/PlayingCard";
import Avatar from "@/components/Avatar";
import WagerInput from "./WagerInput";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

// A shared card table (Blackjack, Lucky 9). Everyone who bets on a round plays
// their own hand against the same dealer. The server deals and decides everything;
// this page only shows what it is told, and asks again every couple of seconds.
const POLL_MS = 2000;

const RESULT_TEXT = {
  blackjack: { text: "Blackjack!", win: true },
  win: { text: "You win", win: true },
  push: { text: "Tie. Your wager is returned.", win: null },
  lose: { text: "The house wins", win: false },
  void: { text: "Your bet arrived too late and was returned.", win: null }
};
const NOTE = { stood: "Stayed", bust: "Bust", blackjack: "Blackjack", drew: "Drew", doubled: "Doubled", timeout: "Timed out", dealer: "" };

function Cards({ cards, hidden = 0, size = "lg", empty }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", size === "lg" && "min-h-[88px]")}>
      {cards.map((c, i) => <PlayingCard key={i + c} card={c} size={size} />)}
      {Array.from({ length: hidden }, (_, i) => <PlayingCard key={"b" + i} back size={size} />)}
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
  const busyRef = useRef("");
  busyRef.current = busy;

  const take = useCallback((d) => {
    if (!d || !d.table) return;
    setData(d);
    setOffset(Date.parse(d.table.server_now) - Date.now());
    if (typeof d.balance === "number") setBalance(d.balance);
    // When a round I played is settled, refresh my points once.
    if (d.table.status === "settled" && d.mine && paidRound.current !== d.table.round_no) {
      paidRound.current = d.table.round_no;
      reload();
    }
  }, [setBalance, reload]);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await base44.functions.invoke(fn, { action: "state", first: first.current });
      first.current = false;
      take(res.data);
    } catch (e) {
      setError((prev) => prev || errorText(e, "Couldn't reach the table."));
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

  if (!data) return <Panel title={title}>{error ? <p role="alert" className="py-6 text-center text-sm text-ember">{error}</p> : <LanternSpinner label="Finding the table" className="py-12" />}</Panel>;

  const { table, seats, mine } = data;
  const serverNow = now + offset;
  const left = (at) => (at ? Math.max(0, Math.ceil((Date.parse(at) - serverNow) / 1000)) : null);
  const betLeft = table.status === "betting" ? left(table.bets_close_at) : null;
  const actLeft = table.status === "playing" ? left(table.act_close_at) : null;
  const nextLeft = table.status === "settled" ? left(table.next_at) : null;
  const myTurn = table.status === "playing" && mine && mine.status === "playing";
  const res = mine && mine.result ? RESULT_TEXT[mine.result] : null;
  const canBet = table.status === "betting" && !mine && (betLeft === null || betLeft > 1) && wager >= settings.min_bet && wager <= settings.max_bet && wager <= balance;
  const others = seats.filter((s) => !s.mine);
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  let banner;
  if (table.status === "betting") {
    banner = betLeft === null ? "Place a bet to start the round." : `Bets close in ${betLeft}s. ${seats.length} at the table.`;
  } else if (table.status === "playing") {
    banner = myTurn ? `Play your hand: ${actLeft}s left.` : `Hands are being played: ${actLeft}s left.`;
  } else {
    banner = nextLeft ? `Next round in ${nextLeft}s.` : "Next round is opening.";
  }

  return (
    <Panel title={title}>
      <div
        className={cn(
          "mb-4 space-y-4 rounded-md border border-bronze/40 p-4",
          feltClass || "bg-[radial-gradient(circle_at_50%_30%,hsl(150_30%_14%),hsl(0_0%_6%))]",
          res && res.win === true && "win-glow",
          res && res.win === false && "loss-shake"
        )}
      >
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-mist">
            {dealerLabel}
            {table.dealer.total !== null && (
              <span className="ml-2 font-heading text-sm font-bold normal-case text-gold">{table.dealer.total}{table.dealer.hidden ? " showing" : ""}</span>
            )}
          </p>
          <Cards cards={table.dealer.cards} hidden={table.dealer.hidden} empty="Waiting for bets" />
        </div>

        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-mist">
            You
            {mine && mine.total !== null && <span className="ml-2 font-heading text-sm font-bold normal-case text-gold">{mine.total}</span>}
            {mine && <span className="ml-2 normal-case text-mist">· <Points value={mine.staked} iconSize={12} className="text-gold" /> on the table</span>}
          </p>
          <Cards cards={mine ? mine.cards : []} empty={mine ? "Cards are dealt when betting closes" : "You're not in this round"} />
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
            : "Round over."}
        </p>
      )}

      {others.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-mist">At the table ({seats.length})</p>
          <ul className="divide-y divide-bronze/25">
            {others.map((s, i) => {
              const r = s.result ? RESULT_TEXT[s.result] : null;
              return (
                <li key={i + s.name} className="flex items-center gap-3 py-2">
                  <Avatar url={s.avatar} name={s.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[hsl(var(--foreground))]">{s.name}</p>
                    <p className="text-xs text-mist">
                      <Points value={s.staked} iconSize={11} />
                      {s.total !== null && <> · {s.total}</>}
                      {s.status === "playing" && " · playing"}
                      {s.status === "done" && !r && NOTE[s.note] ? ` · ${NOTE[s.note]}` : ""}
                      {r && <span className={cn("ml-1 font-bold", r.win === true ? "text-gold" : r.win === false ? "text-ember" : "text-mist")}> · {s.net > 0 ? `+${s.net.toLocaleString()}` : s.net < 0 ? s.net.toLocaleString() : "tie"}</span>}
                    </p>
                  </div>
                  <Cards cards={s.cards} size="xs" />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-mist/80">{rules}</p>
    </Panel>
  );
}