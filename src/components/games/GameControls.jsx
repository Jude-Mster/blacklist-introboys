import React from "react";
import { Loader2 } from "lucide-react";
import WagerInput from "./WagerInput";
import { Ingot } from "@/components/SealLogo";
import { cn } from "@/lib/utils";

// The controls every game shares: wager, play button, result line, history strip.
export default function GameControls({
  settings,
  balance,
  wager,
  setWager,
  game,
  onPlay,
  playLabel,
  busyLabel,
  potential,
  children
}) {
  const { busy, result, error, history } = game;
  const canPlay = wager >= settings.min_bet && wager <= settings.max_bet && wager <= balance;

  return (
    <div className="space-y-4">
      {children}

      <WagerInput
        wager={wager}
        setWager={setWager}
        minBet={settings.min_bet}
        maxBet={settings.max_bet}
        balance={balance}
        disabled={busy}
      />

      {error && (
        <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
          {error}
        </p>
      )}

      <button onClick={onPlay} disabled={busy || !canPlay} className="btn-seal h-12 w-full text-base">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel}
          </>
        ) : (
          <>
            {playLabel}
            {potential > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 text-sm font-medium text-[hsl(43_70%_90%/0.8)]">
                · win <Ingot size={14} /> {potential.toLocaleString()}
              </span>
            )}
          </>
        )}
      </button>

      <div aria-live="polite" className="min-h-[1.5rem] text-center">
        {result && (
          <p className={cn("font-heading text-lg font-bold", result.won ? "text-jade" : "text-ember")}>
            {result.won
              ? `Victory! +${result.net.toLocaleString()} points`
              : `Defeat. −${result.wager.toLocaleString()} points`}
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-hidden" aria-label="Your last results">
          {history.map((h) => (
            <span
              key={h.key}
              title={h.won ? `+${h.net}` : `${h.net}`}
              className={cn(
                "h-2.5 w-2.5 shrink-0 rotate-45 border",
                h.won ? "border-jade bg-jade/70" : "border-ember/70 bg-ember/25"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}