import React from "react";
import { cn } from "@/lib/utils";

// The Assistant's work areas. One row of tabs that scrolls sideways on a phone.
export default function AreaTabs({ areas, value, onChange }) {
  return (
    <div role="tablist" aria-label="Assistant work areas" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {areas.map((a) => {
        const Icon = a.icon;
        const on = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(a.id)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 font-heading text-sm font-bold uppercase tracking-wide transition-colors",
              on ? "border-gold bg-white/10 text-gold" : "border-bronze/50 text-mist hover:text-white"
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}