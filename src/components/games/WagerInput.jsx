import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function WagerInput({ wager, setWager, minBet, maxBet, balance, disabled }) {
  const set = (v) => setWager(Math.max(0, Math.floor(Number(v) || 0)));
  const half = Math.max(minBet, Math.floor(balance / 2));
  const max = Math.min(maxBet, balance);
  const quick = [
    { label: "Min", value: minBet },
    { label: "Half", value: half },
    { label: "Max", value: max }
  ];

  return (
    <div>
      <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Wager</label>
      <div className="mt-2 flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          value={wager}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
          className="bg-ink/60 border-gold/30 text-gold tabular-nums h-11"
        />
        {quick.map((q) => (
          <Button
            key={q.label}
            type="button"
            variant="outline"
            disabled={disabled || q.value <= 0}
            onClick={() => set(q.value)}
            className="border-gold/30 text-gold hover:bg-gold/10 h-11 px-3"
          >
            {q.label}
          </Button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Range {minBet.toLocaleString()}–{maxBet.toLocaleString()}
      </p>
    </div>
  );
}