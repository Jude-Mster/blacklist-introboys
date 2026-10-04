import React from "react";
import { cn } from "@/lib/utils";

// The card order for this table, shown wherever the game is played.
export default function SuitOrder({ className }) {
  return (
    <div className={cn("rounded-md border border-bronze/40 bg-black/30 px-3 py-2 text-center text-xs text-mist", className)}>
      <p>
        <span className="uppercase tracking-wide">Suits, high to low</span>{" "}
        <span className="whitespace-nowrap font-heading text-sm font-bold">
          <span className="text-[hsl(var(--foreground))]">♠ Spade</span>
          <span className="mx-1 text-mist">›</span>
          <span className="text-ember">♥ Heart</span>
          <span className="mx-1 text-mist">›</span>
          <span className="text-[hsl(var(--foreground))]">♣ Club</span>
          <span className="mx-1 text-mist">›</span>
          <span className="text-ember">♦ Diamond</span>
        </span>
      </p>
      <p className="mt-0.5">Cards: 2 is highest, then A, K, Q, J, 10 … down to 3.</p>
    </div>
  );
}