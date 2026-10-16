import React from "react";
import { Link } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import BuySellChat from "@/components/buysell/BuySellChat";

// 6.25: the members portal's Market tab: the same Wuxen2 Buy and Sell as the home page, live. Members post
// under their own name with the gold INTROBOYS badge.
export default function Market() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-[0.06em] text-white sm:text-4xl">MARKET</h1>
          <p className="text-sm text-mist sm:text-base">Wuxen2 Buy and Sell, the same open chat as the home page. Buy, sell and trade with players from every guild. Your posts show your name with the gold INTROBOYS badge, so players know they're dealing with the guild.</p>
        </div>
        <Link to="/buysell" className="inline-flex h-11 items-center gap-2 rounded-md border border-bronze/60 px-4 font-heading text-[15px] font-bold tracking-[0.06em] hover:border-gold hover:text-gold">
          <Maximize2 className="h-4 w-4" /> OPEN FULL SCREEN
        </Link>
      </div>
      <div className="h-[calc(100svh-15rem)] min-h-[520px] md:h-[720px]">
        <BuySellChat member />
      </div>
    </div>
  );
}
