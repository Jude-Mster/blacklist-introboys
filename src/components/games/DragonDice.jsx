import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Panel from "@/components/Panel";
import WagerInput from "./WagerInput";
import { cn } from "@/lib/utils";

export default function DragonDice({ settings, balance, onPlayed }) {
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState("under");
  const [wager, setWager] = useState(settings.min_bet);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState("");

  const chance = direction === "under" ? target - 1 : 100 - target;
  const multiplier = chance > 0 ? ((100 - settings.house_edge_pct) / chance).toFixed(2) : "0";

  const play = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await base44.functions.invoke("playGame", { game: "dragondice", wager, choice: { target, direction } });
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
      <h3 className="font-heading text-xl text-gold font-bold">Dragon Dice</h3>
      <p className="text-sm text-muted-foreground mt-1">Roll 1–100. Win pays <span className="text-gold">{multiplier}×</span> ({chance}% chance).</p>

      <div className="mt-4">
        <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Target: {target}</label>
        <input
          type="range" min={2} max={98} value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          disabled={busy}
          className="w-full mt-2 accent-[hsl(var(--crimson))]"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {["under", "over"].map((d) => (
          <Button
            key={d}
            variant={direction === d ? "default" : "outline"}
            onClick={() => setDirection(d)}
            disabled={busy}
            className={cn(
              "h-11 capitalize font-heading tracking-wider border",
              direction === d ? "bg-crimson text-gold border-gold/50" : "border-gold/30 text-gold hover:bg-gold/10"
            )}
          >
            Roll {d} {target}
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
        {busy ? "Rolling…" : `Roll for ${wager.toLocaleString()}`}
      </Button>

      {result && (
        <div className={cn("mt-4 p-4 rounded-md border border-gold/20 text-center", flash === "win" && "win-flash", flash === "loss" && "loss-flash")}>
          <p className="font-heading text-3xl text-gold tabular-nums">{result.outcome.roll}</p>
          <p className={cn("mt-1 font-medium", result.won ? "text-jade" : "text-ember")}>
            {result.won ? `You win +${(result.payout - wager).toLocaleString()}` : `You lose ${wager.toLocaleString()}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Balance: {result.balance.toLocaleString()}</p>
        </div>
      )}
    </Panel>
  );
}