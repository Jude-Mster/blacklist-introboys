import React from "react";
import SlotSymbol from "@/components/games/SlotSymbol";

// Small marks for each game, shared by the sidebar, tab bars and game tabs.
export const GAME_ICONS = {
  coinflip: (
    <span className="whitespace-nowrap font-heading text-[11px] font-extrabold leading-none text-gold" lang="zh-Hant" aria-hidden="true">
      陰陽
    </span>
  ),
  dragondice: (
    <span className="font-heading text-base font-extrabold leading-none text-jade" lang="zh-Hant" aria-hidden="true">
      龍
    </span>
  ),
  lanternslots: <SlotSymbol id="lantern" size={22} />,
  skywheel: (
    <span className="font-heading text-base font-extrabold leading-none text-azure" lang="zh-Hant" aria-hidden="true">
      天
    </span>
  ),
  roulette: (
    <span
      className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-gold bg-[#2E7F5E] text-[9px] font-extrabold leading-none text-[hsl(0_0%_92%)]"
      aria-hidden="true"
    >
      0
    </span>
  ),
  blackjack: (
    <span className="font-heading text-[13px] font-extrabold leading-none text-gold" aria-hidden="true">
      21
    </span>
  ),
  lucky9: (
    <span className="font-heading text-base font-extrabold leading-none text-ember" aria-hidden="true">
      9
    </span>
  ),
  poker: (
    <span className="text-lg leading-none text-ember" aria-hidden="true">
      ♠
    </span>
  ),
  fortune: (
    <span className="font-heading text-base font-extrabold leading-none text-gold" lang="zh-Hant" aria-hidden="true">
      福
    </span>
  ),
  pusoy: (
    <span className="font-heading text-base font-extrabold leading-none text-gold" aria-hidden="true">
      2
    </span>
  )
};