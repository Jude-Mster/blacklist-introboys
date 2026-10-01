import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild } from "@/lib/GuildContext";
import { Points } from "@/components/SealLogo";
import CoinFlip from "@/components/games/CoinFlip";
import DragonDice from "@/components/games/DragonDice";
import LanternSlots from "@/components/games/LanternSlots";
import SkyWheel from "@/components/games/SkyWheel";
import SlotSymbol from "@/components/games/SlotSymbol";
import { GAMES } from "@/lib/games";
import { cn } from "@/lib/utils";

const COMPONENTS = { coinflip: CoinFlip, dragondice: DragonDice, lanternslots: LanternSlots, skywheel: SkyWheel };
const ICONS = {
  coinflip: <span className="whitespace-nowrap font-heading text-sm font-extrabold text-gold" lang="zh-Hant">陰陽</span>,
  dragondice: <span className="font-heading text-xl font-extrabold text-jade" lang="zh-Hant">龍</span>,
  lanternslots: <SlotSymbol id="lantern" size={30} />,
  skywheel: <span className="font-heading text-xl font-extrabold text-azure" lang="zh-Hant">天</span>
};

export default function Games() {
  const { account, settings, loading } = useGuild();
  const [params, setParams] = useSearchParams();

  if (loading) return <LanternSpinner label="Setting out the tables" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;
  if (!settings) return <LanternSpinner label="Loading the rules" className="py-24" />;

  const enabled = GAMES.filter((g) => (settings.games_enabled || []).includes(g.id));
  const member = account.member;
  if (member.banned) {
    return (
      <Panel title="Games closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">An officer has closed the games for your account. Ask them in Discord if you think this is a mistake.</p>
      </Panel>
    );
  }
  if (enabled.length === 0) {
    return (
      <Panel title="Games closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">No games are open right now. Check back later.</p>
      </Panel>
    );
  }

  const current = enabled.find((g) => g.id === params.get("game")) || enabled[0];
  const Game = COMPONENTS[current.id];
  const usedToday = member.daily_bet_date === new Date().toISOString().slice(0, 10) ? member.daily_bet_total || 0 : 0;
  const left = Math.max(0, settings.daily_bet_cap - usedToday);

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Choose a game" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0">
        {enabled.map((g) => {
          const on = g.id === current.id;
          return (
            <button
              key={g.id}
              role="tab"
              aria-selected={on}
              onClick={() => setParams({ game: g.id }, { replace: true })}
              className={cn(
                "flex min-w-[9.5rem] shrink-0 items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                on ? "border-gold bg-bronze/25" : "border-bronze/45 bg-black/25 hover:border-bronze"
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-bronze/50 bg-black/40">
                {ICONS[g.id]}
              </span>
              <span className="min-w-0">
                <span className={cn("block font-heading text-sm font-bold", on ? "text-gold" : "text-[hsl(var(--foreground))]")}>{g.name}</span>
                <span className="block truncate text-xs text-mist">{g.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mx-auto grid max-w-[52rem] gap-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
        <div className="mx-auto w-full max-w-lg md:max-w-none">
          <Game key={current.id} settings={settings} balance={member.points} />
        </div>

        <Panel title="Your purse">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-mist">Balance</dt>
              <dd><Points value={member.points} className="font-heading text-lg font-bold text-gold" /></dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-mist">Wager left today</dt>
              <dd className="tabular-nums">{left.toLocaleString()}</dd>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/50">
              <div className="h-full bg-gold/70" style={{ width: `${Math.min(100, (usedToday / settings.daily_bet_cap) * 100)}%` }} />
            </div>
            <p className="text-xs text-mist/80">
              The daily limit resets at 00:00 UTC. Over time the games return {100 - (settings.house_edge_pct || 0)}% of what's wagered.
            </p>
          </dl>
        </Panel>
      </div>
    </div>
  );
}