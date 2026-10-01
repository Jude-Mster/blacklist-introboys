import React from "react";
import { cn } from "@/lib/utils";

// Red seal stamp reading "BI", matching the Discord bot icon.
export function Seal({ size = 36, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn("shrink-0 -rotate-6 drop-shadow-[0_2px_6px_rgba(163,22,31,0.45)]", className)}
      role="img"
      aria-label="BLACKLIST INTROBOYS seal"
    >
      <rect x="2" y="2" width="36" height="36" rx="3" fill="#A3161F" />
      <rect x="2" y="2" width="36" height="36" rx="3" fill="none" stroke="#D8B46A" strokeWidth="1.2" />
      <rect x="5.5" y="5.5" width="29" height="29" rx="1.5" fill="none" stroke="#E9E0C9" strokeWidth="1.4" />
      <text
        x="20"
        y="26.5"
        textAnchor="middle"
        fontFamily="'Shippori Mincho B1', serif"
        fontWeight="800"
        fontSize="17"
        fill="#E9E0C9"
      >
        BI
      </text>
    </svg>
  );
}

// The gold yuanbao ingot that marks a points amount.
export function Ingot({ className, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden="true">
      <path d="M3 12c0-2 2-3 4-3l1.5 2.5h7L17 9c2 0 4 1 4 3 0 3-4 6-9 6s-9-3-9-6Z" fill="#D8B46A" />
      <path d="M8.5 11.5C9 8 10.5 6 12 6s3 2 3.5 5.5Z" fill="#F0D795" />
      <path d="M3 12c0 3 4 6 9 6s9-3 9-6" fill="none" stroke="#8A6A3E" strokeWidth="1" />
    </svg>
  );
}

// Points amount with the ingot mark.
export function Points({ value, className, iconSize = 16 }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      <Ingot size={iconSize} />
      {Number(value || 0).toLocaleString()}
    </span>
  );
}

// Header logo: seal + guild name set in the calligraphic serif.
export default function SealLogo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <Seal size={compact ? 30 : 38} />
      <div className="leading-none">
        <span
          className={cn(
            "block font-heading font-extrabold gilt-text",
            compact ? "text-[15px] tracking-[0.08em]" : "text-xl tracking-[0.1em]"
          )}
        >
          BLACKLIST
        </span>
        <span
          className={cn(
            "block font-heading font-semibold text-mist",
            compact ? "mt-0.5 text-[10.5px] tracking-[0.32em]" : "mt-1 text-xs tracking-[0.36em]"
          )}
        >
          INTROBOYS
        </span>
      </div>
    </div>
  );
}

export const ROLE_TITLE = { leader: "Guild Master", officer: "Elder", member: "Disciple" };