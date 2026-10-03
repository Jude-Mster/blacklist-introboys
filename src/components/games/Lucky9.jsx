import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import PlayingCard from "@/components/poker/PlayingCard";
import WagerInput from "./WagerInput";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { coinMultiplier, edgeOf } from "@/lib/games";
import { cn } from "@/lib/utils";

// Lucky 9 against the banker. The server deals and decides everything. The
// banker's cards stay face down, and never reach the browser, until the hand ends.

const RESULT = {
  win: { text: "You win", win: true },
  tie: { text: "Tie. Your wager is returned.", win: null },
  lose: { text: "Banker wins", win: false }
};

function Hand({ label, cards, faceDown, total }) {
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wide text-mist">
        {label}
        {total !== null && total !== undefined && <span className="ml-2 font-heading text-sm font-bold text-gold">{total}</span>}
      </p>
      <div className="flex min-h-[88px] flex-wrap items-center gap-1.5">
        {cards.map((c, i) => <PlayingCard key={i + c} card={c} size="lg" />)}
        {Array.from({ length: faceDown || 0 }, (_, i) => <PlayingCard key={"b" + i} back size="lg" />)}
        {cards.length === 0 && !faceDown && <span className="text-sm text-mist/60">No cards yet</span>}
      </div>
    </div>
  );
}

export default function Lucky9({ settings, balance }) {
  const { setBalance, reload } = useGuild();
  const [hand, setHand] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [wager, setWager] = useState(settings.min_bet);
  const mult = coinMultiplier(edgeOf(settings));

  // Pick up a hand left in play (for example after closing the page).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("lucky9Action", { action: "state" });
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
      const res = await base44.functions.invoke("lucky9Action", { action, ...(extra || {}) });
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

  if (!ready) return <Panel title="Blacklist Lucky 9"><LanternSpinner label="Shuffling" className="py-12" /></Panel>;

  const playing = hand && hand.status === "playing";
  const done = hand && hand.status === "done";
  const res = done ? RESULT[hand.result] : null;
  const canDeal = !playing && wager >= settings.min_bet && wager <= settings.max_bet && wager <= balance;
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <Panel title="Blacklist Lucky 9">
      <div
        className={cn(
          "mb-5 space-y-4 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_30%,hsl(355_35%_14%),hsl(0_0%_6%))] p-4",
          res && res.win === true && "win-glow",
          res && res.win === false && "loss-shake"
        )}
      >
        <Hand label="Banker" cards={done ? hand.banker : []} faceDown={playing ? hand.banker_cards : 0} total={done ? hand.banker_total : null} />
        <Hand label="You" cards={hand ? hand.player : []} total={hand ? hand.player_total : null} />

        <div role="status" aria-live="polite" className="min-h-[2.75rem] text-center">
          {playing && (
            <p className="text-sm text-mist">
              On the table: <Points value={hand.wager} className="font-bold text-gold" />
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
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => send("draw")} disabled={!!busy || !hand.can_draw} className="btn-seal h-12 text-base">{busy === "draw" ? Spin : "Hirit (draw)"}</button>
          <button onClick={() => send("stand")} disabled={!!busy} className="btn-bronze h-12 text-base">{busy === "stand" ? Spin : "Good (stay)"}</button>
        </div>
      ) : (
        <div className="space-y-4">
          <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={settings.max_bet} balance={balance} disabled={!!busy} />
          <button onClick={() => send("deal", { wager })} disabled={!!busy || !canDeal} className="btn-seal h-12 w-full text-base">
            {busy === "deal" ? <>{Spin} Dealing</> : done ? "Deal again" : "Deal"}
          </button>
          <p className="text-center text-sm text-mist">A win returns {mult}× your wager.</p>
        </div>
      )}

      <p className="mt-4 text-xs text-mist/80">
        Closest to 9 wins. Aces count 1, tens and face cards count 0, and only the last digit of your total counts. You may take one extra card. The banker draws on 4 or less. A tie returns your wager.
      </p>
    </Panel>
  );
}