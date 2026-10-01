import React from "react";
import { cn } from "@/lib/utils";

// A lacquered-wood panel: dark panel with a thin antique-gold border and small corner ornaments.
export default function Panel({ className, children, as: As = "div", ...rest }) {
  return (
    <As
      className={cn(
        "relative bg-panel/90 backdrop-blur-sm border border-gold/40 rounded-lg",
        className
      )}
      {...rest}
    >
      {/* corner ornaments */}
      <Corner className="top-0 left-0" />
      <Corner className="top-0 right-0 rotate-90" />
      <Corner className="bottom-0 right-0 rotate-180" />
      <Corner className="bottom-0 left-0 -rotate-90" />
      {children}
    </As>
  );
}

function Corner({ className }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className={cn("absolute pointer-events-none text-gold/70", className)}
      aria-hidden="true"
    >
      <path d="M1 1 H6 M1 1 V6 M1 1 L4 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}