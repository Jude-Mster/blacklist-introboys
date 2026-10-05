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

// The gold coin that marks a points amount. (Still exported as Ingot so every
// page that already shows points picks up the new icon.)
export function Ingot({ className, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden="true">
      <defs>
        <radialGradient id="bi-coin" cx="36%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFE9A3" />
          <stop offset="0.45" stopColor="#F5C542" />
          <stop offset="1" stopColor="#B8860B" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#bi-coin)" stroke="#8A6508" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="7.3" fill="none" stroke="#8A6508" strokeOpacity="0.55" strokeWidth="1" />
      {/* square hole, like an old cash coin */}
      <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="0.6" fill="#7A5A07" fillOpacity="0.85" />
      <path d="M6.2 8.2a7 7 0 0 1 4.1-3.1" fill="none" stroke="#FFF6D6" strokeOpacity="0.8" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

// Points amount with the gold coin.
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