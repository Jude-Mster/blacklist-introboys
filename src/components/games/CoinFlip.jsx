import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Panel from "@/components/Panel";
import WagerInput from "./WagerInput";
import { cn } from "@/lib/utils";

export default function CoinFlip({ settings, balance, onPlayed }) {
  const [choice, setChoice] = useState("heads");
  const [wager, setWager] = useState(settings.min_bet);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState("");

  const multiplier = (2 * (1 - settings.house_edge_pct / 100)).toFixed(2);

  const play = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await base44.functions.invoke("playGame", { game: "coinflip", wager, choice });
      setResult(res.data);
      setFlash(res.data.won ? "win" : "loss");
      setTimeout(() => setFlash(null), 800);
      await onPlayed();
    } catch (e) {
      const data = e && e.response && e.response.data;
      setError(data && data.error ? data.error : e.message || "Bet failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6">
      <h3 className="font-heading text-xl text-gold font-bold">Coin Flip</h3>
      <p className="text-sm text-muted-foreground mt-1">Call the side. Win pays <span className="text-gold">{multiplier}×</span> your wager.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {["heads", "tails"].map((c) => (
          <Button
            key={c}
            variant={choice === c ? "default" : "outline"}
            onClick={() => setChoice(c)}
            disabled={busy}
            className={cn(
              "h-11 capitalize font-heading tracking-wider border",
              choice === c ? "bg-crimson text-gold border-gold/50" : "border-gold/30 text-gold hover:bg-gold/10"
            )}
          >
            {c}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={settings.max_bet} balance={balance} disabled={busy} />
      </div>

      {error && <p className="text-ember text-sm mt-3">{error}</p>}

      <Button
        onClick={play}
        disabled={busy}
        className="mt-4 w-full h-12 bg-crimson hover:bg-ember text-gold font-heading tracking-wider border border-gold/40"
      >
        {busy ? "Flipping…" : `Flip for ${wager.toLocaleString()}`}
      </Button>

      {result && (
        <div className={cn("mt-4 p-4 rounded-md border border-gold/20 text-center", flash === "win" && "win-flash", flash === "loss" && "loss-flash")}>
          <p className="font-heading text-2xl capitalize text-gold">{result.outcome.side}</p>
          <p className={cn("mt-1 font-medium", result.won ? "text-jade" : "text-ember")}>
            {result.won ? `You win +${(result.payout - wager).toLocaleString()}` : `You lose ${wager.toLocaleString()}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Balance: {result.balance.toLocaleString()}</p>
        </div>
      )}
    </Panel>
  );
}