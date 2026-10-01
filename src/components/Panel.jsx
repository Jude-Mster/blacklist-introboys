import React from "react";
import { cn } from "@/lib/utils";

// A TwelveSky-style game window: bronze frame, gilt corner filigree, and an
// optional title bar. Pass `title` to get the bar; leave it out for a plain frame.
export default function Panel({ title, action, className, bodyClassName, children, as: As = "section", ...rest }) {
  return (
    <As className={cn("gw", className)} {...rest}>
      <Corner className="left-0 top-0" />
      <Corner className="right-0 top-0 -scale-x-100" />
      <Corner className="bottom-0 left-0 -scale-y-100" />
      <Corner className="bottom-0 right-0 -scale-100" />
      {title && (
        <header className="gw-title">
          <h2>{title}</h2>
          {action && <div className="absolute right-2 top-1/2 -translate-y-1/2">{action}</div>}
        </header>
      )}
      <div className={cn(title ? "p-4 sm:p-5" : "", bodyClassName)}>{children}</div>
    </As>
  );
}

function Corner({ className }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      className={cn("pointer-events-none absolute z-10", className)}
      aria-hidden="true"
    >
      <path d="M1 9 V1 H9" stroke="hsl(var(--gold))" strokeWidth="1.5" fill="none" />
      <path d="M4 7 V4 H7" stroke="hsl(var(--gold) / 0.6)" strokeWidth="1" fill="none" />
      <circle cx="1.5" cy="1.5" r="1.5" fill="hsl(var(--gold))" />
    </svg>
  );
}