import React from "react";
import { cn } from "@/lib/utils";

// The guild mark: the white brush "S" cut from the BLACKLIST INTROBOYS logo.
export function Seal({ size = 36, className }) {
  return (
    <img
      src="https://base44.app/api/apps/6abe8bba244ec63c6d6d2855/files/mp/public/6abe8bba244ec63c6d6d2855/de4f11b7b_logo-mark.png"
      width={size}
      height={size}
      alt="BLACKLIST INTROBOYS"
      draggable={false}
      className={cn("shrink-0 select-none object-contain drop-shadow-[0_2px_8px_rgba(200,22,29,0.55)]", className)}
      style={{ width: size, height: size }}
    />
  );
}

// The full guild logo.
export function FullLogo({ className }) {
  return <img src="https://base44.app/api/apps/6abe8bba244ec63c6d6d2855/files/mp/public/6abe8bba244ec63c6d6d2855/68df4465e_logo.png" alt="BLACKLIST INTROBOYS, TwelveSky guild" draggable={false} className={cn("select-none", className)} />;
}

// The gold star that marks a points amount. (Still exported as Ingot so every
// page that already shows points picks up the new icon.)
export function Ingot({ className, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden="true">
      <path
        d="M12 2.2l2.9 6.2 6.7.8-4.9 4.7 1.3 6.7L12 17.3l-6 3.3 1.3-6.7-4.9-4.7 6.7-.8L12 2.2Z"
        fill="#F5C542"
        stroke="#B8860B"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Points amount with the gold star.
export function Points({ value, className, iconSize = 16 }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      <Ingot size={iconSize} />
      {Number(value || 0).toLocaleString()}
    </span>
  );
}

// Header logo: the brush mark with the guild name in the logo's red and white.
export default function SealLogo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <Seal size={compact ? 38 : 46} />
      <div className="leading-none">
        <span className={cn("brush-red block", compact ? "text-[23px] tracking-[0.03em]" : "text-2xl tracking-[0.05em]")}>Blacklist</span>
        <span className={cn("block font-display uppercase text-white", compact ? "mt-0.5 text-[12.5px] tracking-[0.2em]" : "mt-1 text-sm tracking-[0.32em]")}>
          Intro Boys
        </span>
      </div>
    </div>
  );
}

export { ROLE_TITLE } from "@/lib/ranks";