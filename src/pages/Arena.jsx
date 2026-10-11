import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import LanternSpinner from "@/components/LanternSpinner";
import Panel from "@/components/Panel";
import TableBoundary from "@/components/TableBoundary";
import { useGuild } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";
import LiveArena from "@/components/arena/LiveArena";
import TournamentView from "@/components/arena/TournamentView";

// Blacklist Arena ("Fight" in the menu): the Live Arena, a fight every few minutes to bet on, and the
// Guild Leader's tournaments. This page (and the 3D arena with it) is only downloaded when a member opens it.
export default function Arena() {
  const { account, settings, loading } = useGuild();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "tournament" ? "tournament" : "live";

  if (loading) return <LanternSpinner label="Opening the arena" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;
  if (account.member.banned) {
    return (
      <Panel title="Games closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">A guild officer has closed the games for your account.</p>
      </Panel>
    );
  }
  if (!settings) return <LanternSpinner label="Loading the rules" className="py-24" />;
  const liveOpen = (settings.games_enabled || []).includes("arena");

  return (
    <div className="mx-auto max-w-[80rem] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <img src="/arena/guild-mark.png" alt="" aria-hidden="true" className="h-12 w-12 object-contain drop-shadow-[0_3px_10px_rgba(195,21,31,0.7)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-crimson">BLACKLIST INTROBOYS</p>
          <h1 className="font-heading text-2xl font-bold sm:text-3xl leading-tight text-white">Blacklist Arena</h1>
        </div>
        <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto" role="tablist" aria-label="Arena">
          {[["live", "Live Arena"], ["tournament", "Tournament"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setParams(id === "live" ? {} : { tab: id }, { replace: true })}
              className={cn("h-10 whitespace-nowrap rounded border px-3 font-heading sm:px-4 text-sm font-semibold uppercase tracking-wider", tab === id ? "border-gold bg-gold/15 text-gold" : "border-bronze/50 text-mist hover:border-gold")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <TableBoundary back="/games">
        {tab === "live"
          ? (liveOpen ? <LiveArena key="live" balance={account.member.points} /> : (
            <Panel title="Live Arena closed" className="mx-auto max-w-md">
              <p className="text-center text-mist">The Guild Leader has closed the Live Arena for now. Tournaments are still on the Tournament tab.</p>
            </Panel>
          ))
          : <TournamentView key="tour" balance={account.member.points} member={account.member} />}
      </TableBoundary>
    </div>
  );
}