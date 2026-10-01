import React from "react";
import { Ingot } from "@/components/SealLogo";
import { cn } from "@/lib/utils";

// Wager entry: a number field plus quick-set chips.
export default function WagerInput({ wager, setWager, minBet, maxBet, balance, disabled }) {
  const cap = Math.max(0, Math.min(maxBet, balance));
  const clamp = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const chips = [
    { label: "Min", value: minBet },
    { label: "½", value: Math.max(minBet, Math.floor(wager / 2)), aria: "Halve wager" },
    { label: "×2", value: Math.min(cap, wager * 2), aria: "Double wager" },
    { label: "Max", value: cap }
  ];
  const tooHigh = wager > balance;
  const outOfRange = wager < minBet || wager > maxBet;

  return (
    <div>
      <label htmlFor="wager" className="label">Wager</label>
      <div className="relative">
        <Ingot size={18} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id="wager"
          type="number"
          inputMode="numeric"
          min={minBet}
          max={maxBet}
          value={wager || ""}
          onChange={(e) => setWager(clamp(e.target.value))}
          disabled={disabled}
          className={cn("field pl-10 text-lg font-bold text-gold", (tooHigh || outOfRange) && wager > 0 && "border-ember/80")}
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            aria-label={c.aria || `${c.label} wager`}
            disabled={disabled || c.value <= 0}
            onClick={() => setWager(c.value)}
            className="btn-bronze h-9 text-sm"
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className={cn("mt-1.5 text-xs", tooHigh ? "text-ember" : "text-mist/80")}>
        {tooHigh
          ? "That's more than your balance."
          : `Wager ${minBet.toLocaleString()} to ${maxBet.toLocaleString()}.`}
      </p>
    </div>
  );
}