import React from "react";
import { Navigate } from "react-router-dom";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild } from "@/lib/GuildContext";
import CoinFlip from "@/components/games/CoinFlip";
import DragonDice from "@/components/games/DragonDice";
import LanternSlots from "@/components/games/LanternSlots";

export default function Games() {
  const { account, settings, loading, reload } = useGuild();

  if (loading) return <LanternSpinner label="Rolling out the tables" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;
  if (!settings) return <LanternSpinner label="Loading rules" className="py-24" />;

  const enabled = settings.games_enabled || [];
  const balance = account.member.points;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-heading text-3xl text-gold font-bold">Games of Fortune</h1>
        <p className="text-muted-foreground text-sm mt-1">Wager your hard-earned points. House edge {settings.house_edge_pct}%.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {enabled.includes("coinflip") && <CoinFlip settings={settings} balance={balance} onPlayed={reload} />}
        {enabled.includes("dragondice") && <DragonDice settings={settings} balance={balance} onPlayed={reload} />}
        {enabled.includes("lanternslots") && <LanternSlots settings={settings} balance={balance} onPlayed={reload} />}
        {enabled.length === 0 && (
          <Panel className="p-6 md:col-span-3 text-center text-muted-foreground">No games are enabled right now.</Panel>
        )}
      </div>
    </div>
  );
}