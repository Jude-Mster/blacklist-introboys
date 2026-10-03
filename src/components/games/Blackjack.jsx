import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import PlayingCard from "@/components/poker/PlayingCard";
import WagerInput from "./WagerInput";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

// Blackjack against the house. The server deals and decides everything; this
// page only shows the cards it is told about. The dealer's second card and the
// rest of the deck never reach the browser until the hand is over.

const RESULT = {
  blackjack: { text: "Blackjack!", win: true },
  win: { text: "You win", win: true },
  push: { text: "Push. Your wager is returned.", win: null },
  lose: { text: "Dealer wins", win: false },
  bust: { text: "Bust", win: false },
  dealer_blackjack: { text: "Dealer has blackjack", win: false }
};

function Hand({ label, cards, total, soft, hidden }) {
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wide text-mist">
        {label}
        {cards.length > 0 && (
          <span className="ml-2 font-heading text-sm font-bold normal-case text-gold">
            {total}{soft ? " (soft)" : ""}{hidden ? " showing" : ""}
          </span>
        )}
      </p>
      <div className="flex min-h-[88px] flex-wrap items-center gap-1.5">
        {cards.map((c, i) => <PlayingCard key={i + c} card={c} size="lg" />)}
        {hidden && <PlayingCard back size="lg" />}
        {cards.length === 0 && <span className="text-sm text-mist/60">No cards yet</span>}
      </div>
    </div>
  );
}

export default function Blackjack({ settings, balance }) {
  const { setBalance, reload } = useGuild();
  const [hand, setHand] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [wager, setWager] = useState(settings.min_bet);

  // Pick up a hand left in play (for example after closing the page).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("blackjackAction", { action: "state" });
        if (alive && res.data) setHand(res.data.hand || null);
      } catch (e) {
        if (alive) setError(errorText(e, "Couldn't load the table."));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const send = useCallback(async (action, extra) => {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const res = await base44.functions.invoke("blackjackAction", { action, ...(extra || {}) });
      const h = res.data && res.data.hand;
      setHand(h || null);
      if (h && typeof h.balance === "number") setBalance(h.balance);
      if (h && h.status === "done") reload();
    } catch (e) {
      setError(errorText(e, "That didn't go through. Try again."));
    } finally {
      setBusy("");
    }
  }, [busy, setBalance, reload]);

  if (!ready) return <Panel title="Blacklist Blackjack"><LanternSpinner label="Shuffling" className="py-12" /></Panel>;

  const playing = hand && hand.status === "playing";
  const done = hand && hand.status === "done";
  const res = done ? RESULT[hand.result] : null;
  const canDeal = !playing && wager >= settings.min_bet && wager <= settings.max_bet && wager <= balance;
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <Panel title="Blacklist Blackjack">
      <div
        className={cn(
          "mb-5 space-y-4 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_30%,hsl(150_30%_14%),hsl(0_0%_6%))] p-4",
          res && res.win === true && "win-glow",
          res && res.win === false && "loss-shake"
        )}
      >
        <Hand label="Dealer" cards={hand ? hand.dealer : []} total={hand ? hand.dealer_total : 0} hidden={!!(hand && hand.dealer_hidden)} />
        <Hand label="You" cards={hand ? hand.player : []} total={hand ? hand.player_total : 0} soft={hand && hand.player_soft} />

        <div role="status" aria-live="polite" className="min-h-[2.75rem] text-center">
          {playing && (
            <p className="text-sm text-mist">
              On the table: <Points value={hand.staked} className="font-bold text-gold" />
            </p>
          )}
          {res && (
            <>
              <p className={cn("font-heading text-lg font-bold", res.win === true ? "text-gold" : res.win === false ? "text-ember" : "text-mist")}>{res.text}</p>
              <p className="text-sm text-mist">
                {hand.net > 0 ? <>You won <Points value={hand.net} className="font-bold text-gold" /></> : hand.net < 0 ? <>You lost <Points value={-hand.net} className="font-bold" /></> : "No points changed hands."}
              </p>
            </>
          )}
          {!hand && <p className="text-sm text-mist">Place a wager and deal.</p>}
        </div>
      </div>

      {error && <p role="alert" className="mb-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

      {playing ? (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => send("hit")} disabled={!!busy} className="btn-seal h-12 text-base">{busy === "hit" ? Spin : "Hit"}</button>
          <button onClick={() => send("stand")} disabled={!!busy} className="btn-bronze h-12 text-base">{busy === "stand" ? Spin : "Stand"}</button>
          <button
            onClick={() => send("double")}
            disabled={!!busy || !hand.can_double || hand.wager > balance}
            className="btn-bronze h-12 text-base"
            title={hand.wager > balance ? "Not enough points to double" : undefined}
          >
            {busy === "double" ? Spin : "Double"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={settings.max_bet} balance={balance} disabled={!!busy} />
          <button onClick={() => send("deal", { wager })} disabled={!!busy || !canDeal} className="btn-seal h-12 w-full text-base">
            {busy === "deal" ? <>{Spin} Dealing</> : done ? "Deal again" : "Deal"}
          </button>
        </div>
      )}

      <p className="mt-4 text-xs text-mist/80">
        Closest to 21 without going over wins. Blackjack pays 6:5. The dealer draws to 17 and hits a soft 17. You can double on your first two cards. A fresh six-deck shuffle every hand.
      </p>
    </Panel>
  );
}