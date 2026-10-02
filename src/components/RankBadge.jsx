import React from "react";
import { Crown, ShieldCheck, Swords } from "lucide-react";
import { ROLE_TITLE, ROLE_SHORT } from "@/lib/ranks";
import { cn } from "@/lib/utils";

const STYLE = {
  leader: "border-gold/80 bg-gold/15 text-gold",
  officer: "border-jade/70 bg-jade/10 text-jade",
  guild_member: "border-azure/70 bg-azure/10 text-azure",
  member: "border-bronze/60 bg-black/30 text-mist",
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