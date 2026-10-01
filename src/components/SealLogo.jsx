import React from "react";
import { cn } from "@/lib/utils";

// Small red lacquer seal stamp reading "BI" — used as crest + favicon motif.
export function Seal({ size = 36, className }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center font-heading font-bold text-gold bg-crimson rotate-[-4deg] shadow-md", className)}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        border: "2px solid hsl(var(--gold))",
        fontSize: size * 0.42,
        letterSpacing: "0.02em",
        boxShadow: "0 0 12px hsl(352 82% 39% / 0.45)"
      }}
      aria-label="BLACKLIST INTROBOYS seal"
    >
      BI
    </span>
  );
}

// Full header logo: gold Cinzel capitals over a red ink brush stroke, with the seal crest.
export default function SealLogo({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <Seal size={compact ? 30 : 38} />
      <div className="relative">
        <svg
          viewBox="0 0 320 56"
          className="absolute inset-0 w-full h-full -z-0"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M6 34 C 60 20, 120 40, 180 26 S 300 30, 314 22 L 312 40 C 250 50, 180 34, 120 44 S 40 48, 8 42 Z"
            fill="hsl(352 82% 39%)"
            opacity="0.92"
          />
        </svg>
        <h1
          className={cn(
            "relative z-10 font-heading font-bold tracking-[0.18em] text-gold uppercase leading-none",
            compact ? "text-[15px]" : "text-lg sm:text-xl"
          )}
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
        >
          Blacklist Introboys
        </h1>
      </div>
    </div>
  );
}