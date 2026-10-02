import React from "react";
import { Crown, ShieldCheck, Swords } from "lucide-react";
import { ROLE_TITLE, ROLE_SHORT } from "@/lib/ranks";
import { cn } from "@/lib/utils";

const STYLE = {
  leader: "border-crimson bg-crimson text-white",
  officer: "border-white/80 bg-white text-black",
  guild_member: "border-[#E0474D]/80 bg-crimson/15 text-[#FF6B70]",
  member: "border-bronze bg-black/30 text-mist",
  guest: "border-[#5865F2]/70 bg-[#5865F2]/15 text-[#A5ADFF]"
};
const ICON = { leader: Crown, officer: ShieldCheck, guild_member: Swords };

// Small tag showing a member's guild rank. `short` uses one word for tight rows.
export default function RankBadge({ role, short = false, className }) {
  const key = STYLE[role] ? role : "member";
  const Icon = ICON[key];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-wide", STYLE[key], className)}
      title={ROLE_TITLE[key]}
    >
      {Icon && <Icon className="h-2.5 w-2.5" aria-hidden="true" />}
      {short ? ROLE_SHORT[key] : ROLE_TITLE[key]}
    </span>
  );
}