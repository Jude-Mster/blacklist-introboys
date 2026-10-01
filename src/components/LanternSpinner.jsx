import React from "react";
import { cn } from "@/lib/utils";

// A swinging red lantern used as the loading spinner.
export default function LanternSpinner({ label = "Loading", className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="lantern-swing">
        <svg width="46" height="60" viewBox="0 0 46 60" aria-hidden="true">
          <line x1="23" y1="0" x2="23" y2="9" stroke="hsl(var(--gold))" strokeWidth="1.5" />
          <rect x="14" y="9" width="18" height="4" rx="1" fill="hsl(var(--gold))" />
          <ellipse cx="23" cy="32" rx="16" ry="19" fill="hsl(352 82% 39%)" stroke="hsl(var(--gold))" strokeWidth="1.5" />
          <rect x="12" y="50" width="22" height="4" rx="1" fill="hsl(var(--gold))" />
          <line x1="23" y1="54" x2="23" y2="60" stroke="hsl(var(--gold))" strokeWidth="1.5" />
          <ellipse cx="23" cy="32" rx="6" ry="9" fill="hsl(45 90% 65%)" opacity="0.85" className="ember-pulse" />
        </svg>
      </div>
      {label && <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{label}</p>}
    </div>
  );
}