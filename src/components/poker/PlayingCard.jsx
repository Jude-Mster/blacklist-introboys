import React from "react";
import { cn } from "@/lib/utils";

const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_NAME = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
const RANK_NAME = { T: "10", J: "Jack", Q: "Queen", K: "King", A: "Ace" };
const SIZES = {
  xs: "h-9 w-[26px] text-[11px]",
  sm: "h-12 w-[34px] text-sm",
  md: "h-16 w-[46px] text-base",
  lg: "h-[88px] w-[63px] text-xl"
};

// A playing card. `card` like "As" or "Td"; pass `back` (or no card) for a face-down card.
export default function PlayingCard({ card, size = "md", back, highlight, dim, className }) {
  if (!card || back) {
    return (
      <div
        className={cn("relative shrink-0 overflow-hidden rounded-[5px] border border-gold/70 shadow-md", SIZES[size], className)}
        style={{
          background:
            "repeating-linear-gradient(45deg, #8E141C 0 4px, #C8161D 4px 8px), #C8161D"
        }}
        aria-label="Face-down card"
        role="img"
      >
        <span className="absolute inset-[3px] rounded-[3px] border border-[hsl(0_0%_85%/0.55)]" />
        <span className="absolute inset-0 flex items-center justify-center font-heading font-extrabold text-[hsl(0_0%_85%/0.8)]">BI</span>
      </div>
    );
  }
  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1];
  const red = suit === "h" || suit === "d";
  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col items-center justify-center rounded-[5px] border font-heading font-extrabold leading-none shadow-md transition-[opacity,transform]",
        SIZES[size],
        highlight ? "-translate-y-1 border-gold ring-2 ring-gold" : "border-[hsl(0_0%_70%)]",
        dim && "opacity-45",
        className
      )}
      style={{ background: "linear-gradient(180deg, #FBF6E9, #EDE3CB)", color: red ? "#B3191F" : "#141A1C" }}
      role="img"
      aria-label={`${RANK_NAME[card[0]] || rank} of ${SUIT_NAME[suit]}`}
    >
      <span>{rank}</span>
      <span className="mt-0.5 text-[1.15em]">{SUIT[suit]}</span>
    </div>
  );
}