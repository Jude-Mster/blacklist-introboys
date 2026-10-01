import React from "react";
import { cn } from "@/lib/utils";

// A swinging red lantern used as the loading spinner.
export default function LanternSpinner({ label = "Loading", className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} role="status">
      <div className="lantern-swing">
        <svg width="40" height="56" viewBox="0 0 46 60" aria-hidden="true">
          <line x1="23" y1="0" x2="23" y2="9" stroke="hsl(var(--gold))" strokeWidth="1.5" />
          <rect x="14" y="9" width="18" height="4" rx="1" fill="hsl(var(--gold))" />
          <ellipse cx="23" cy="32" rx="16" ry="19" fill="hsl(var(--crimson))" stroke="hsl(var(--gold))" strokeWidth="1.5" />
          <path d="M23 13 V51 M13 22 Q23 32 13 42 M33 22 Q23 32 33 42" stroke="hsl(var(--gold) / 0.5)" strokeWidth="1" fill="none" />
          <rect x="12" y="50" width="22" height="4" rx="1" fill="hsl(var(--gold))" />
          <line x1="23" y1="54" x2="23" y2="60" stroke="hsl(var(--gold))" strokeWidth="1.5" />
          <ellipse cx="23" cy="32" rx="6" ry="9" fill="hsl(45 90% 65%)" opacity="0.85" className="ember-pulse" />
        </svg>
      </div>
      {label && <p className="text-sm text-mist">{label}</p>}
    </div>
  );
}