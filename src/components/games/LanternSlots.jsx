import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Panel from "@/components/Panel";
import WagerInput from "./WagerInput";
import { SLOT_PAYOUT_TABLE } from "@/lib/slots";
import { cn } from "@/lib/utils";

const SYMBOLS = {
  crest: { glyph: "❖", label: "Crest", color: "text-gold" },
  lantern: { glyph: "🏮", label: "Lantern", color: "" },
  dragon: { glyph: "🐉", label: "Dragon", color: "" },
  maple: { glyph: "🍁", label: "Maple", color: "" },
  coin: { glyph: "🪙", label: "Coin", color: "" }
};

export default function LanternSlots({ settings, balance, onPlayed }) {
  const [wager, setWager] = useState(settings.min_bet);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState("");
  const [spinning, setSpinning] = useState(false);

  const play = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    setSpinning(true);
    try {
      const res = await base44.functions.invoke("playGame", { game: "lanternslots", wager });
      setSpinning(false);
      setResult(res.data);
      setFlash(res.data.won ? "win" : "loss");
      setTimeout(() => setFlash(null), 800);
      await onPlayed();
    } catch (e) {
      setSpinning(false);
      const data = e && e.response && e.response.data;
      setError(data && data.error ? data.error : e.message || "Bet failed.");
    } finally {
      setBusy(false);
    }
  };

  const reels = result ? result.outcome.reels : ["coin", "lantern", "dragon"];

  return (
    <Panel className="p-6">
      <h3 className="font-heading text-xl text-gold font-bold">Lantern Slots</h3>
      <p className="text-sm text-muted-foreground mt-1">Three reels of the festival. Three crests pays 25×.</p>

      <div className={cn("mt-4 grid grid-cols-3 gap-3 p-4 rounded-md border border-gold/20 bg-ink/40", flash === "win" && "win-flash", flash === "loss" && "loss-flash")}>
        {reels.map((s, i) => {
          const sym = SYMBOLS[s] || SYMBOLS.coin;
          return (
            <div key={i} className={cn("aspect-square flex flex-col items-center justify-center rounded-md border border-gold/20 bg-panel text-4xl", spinning && "animate-pulse")}>
              <span className={sym.color}>{sym.glyph}</span>
            </div>
          );
        })}
      </div>

      <details className="mt-3">
        <summary className="text-xs uppercase tracking-[0.2em] text-muted-foreground cursor-pointer">Payout table</summary>
        <ul className="mt-2 text-sm space-y-1">
          {SLOT_PAYOUT_TABLE.map((r) => (
            <li key={r.combo} className="flex justify-between border-b border-gold/10 pb-1">
              <span className="text-muted-foreground">{r.combo}</span>
              <span className="text-gold tabular-nums">{r.multiplier}×</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-4">
        <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={settings.max_bet} balance={balance} disabled={busy} />
      </div>

      {error && <p className="text-ember text-sm mt-3">{error}</p>}

      <Button
        onClick={play}
        disabled={busy}
        className="mt-4 w-full h-12 bg-crimson hover:bg-ember text-gold font-heading tracking-wider border border-gold/40"
      >
        {busy ? "Spinning…" : `Spin for ${wager.toLocaleString()}`}
      </Button>

      {result && (
        <div className="mt-3 text-center">
          <p className={cn("font-medium", result.won ? "text-jade" : "text-ember")}>
            {result.won ? `You win +${(result.payout - wager).toLocaleString()} (${result.outcome.multiplier}×)` : `You lose ${wager.toLocaleString()}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Balance: {result.balance.toLocaleString()}</p>
        </div>
      )}
    </Panel>
  );
}