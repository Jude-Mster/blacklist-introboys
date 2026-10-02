import React from "react";
import { cn } from "@/lib/utils";

// A game window: black panel with a red top edge and an optional brush-lettered
// title bar. Pass `title` to get the bar; leave it out for a plain frame.
export default function Panel({ title, action, className, bodyClassName, compactTitle, children, as: As = "section", ...rest }) {
  return (
    <As className={cn("gw", className)} {...rest}>
      {title && (
        <header className={cn("gw-title", compactTitle && "gw-title-compact")}>
          <h2>{title}</h2>
          {action && <div className="absolute right-2 top-1/2 -translate-y-1/2">{action}</div>}
        </header>
      )}
      <div className={cn(title ? "p-4 sm:p-5" : "", bodyClassName)}>{children}</div>
    </As>
  );
}