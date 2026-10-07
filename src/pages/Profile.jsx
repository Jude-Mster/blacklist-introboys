import React, { useState } from "react";
import Avatar from "@/components/Avatar";
import { Navigate, Link } from "react-router-dom";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import NotificationSettings from "@/components/NotificationSettings";
import ActivityList from "@/components/ActivityList";
import { useGuild } from "@/lib/GuildContext";
import { Points, ROLE_TITLE } from "@/components/SealLogo";
import { GAME_NAME, FACTIONS } from "@/lib/games";
import { cn } from "@/lib/utils";

const SOURCES = [
  { id: "all", label: "All" },
  { id: "award", label: "Awards" },
  { id: "game", label: "Games" },
  { id: "daily", label: "Daily" },
  { id: "poker", label: "Poker" },
  { id: "import", label: "Starting" }
];

function describe(b) {
  const o = b.outcome || {};
  switch (b.game) {
    case "coinflip":
      return `Called ${o.choice === "tails" ? "Yin" : "Yang"}, landed ${o.side === "tails" ? "Yin" : "Yang"}`;
    case "dragondice":
      // Newer rows are Dragon Sic Bo (three dice); older ones are the 1 to 100 roll.
      return Array.isArray(o.dice) ? `Rolled ${o.dice.join(" · ")} = ${o.total} · ${(o.bets || []).length} bet${(o.bets || []).length === 1 ? "" : "s"}` : `Rolled ${o.roll} · needed ${o.direction} ${o.target}`;
    case "lanternslots":
      return (o.reels || []).join(" · ");
    case "roulette":
      // Older rows are from the numbered wheel; newer ones name the pocket.
      return o.kind
        ? `Landed on ${{ red: "Red", black: "Black", green: "Green", dragon: "the Dragon", tiger: "the Tiger" }[o.kind] || o.kind} · ${(o.bets || []).length} bet${(o.bets || []).length === 1 ? "" : "s"}`
        : `Ball on ${o.number} · ${(o.bets || []).length} bet${(o.bets || []).length === 1 ? "" : "s"}`;
    case "fortune":
      return o.free_spins ? `${o.free_spins} free spins · ${o.multiplier}× the bet` : o.best ? `${o.best.count} × ${o.best.symbol} · ${o.multiplier}× the bet` : "No win";
    case "skywheel":
      return `Backed ${FACTIONS[o.pick]?.name || o.pick}, landed ${FACTIONS[o.landed]?.name || o.landed}`;
    case "blackjack":
      return o.result === "blackjack" ? "Blackjack!" : `Your ${o.player_total ?? "hand"} against the dealer's ${o.dealer_total ?? "hand"}${o.doubled ? " · doubled" : ""}`;
    case "lucky9":
      return `Your ${o.player_total} against the banker's ${o.banker_total}`;
    default:
      return "";
  }
}

export default function Profile() {
  const { account, loading } = useGuild();
  const [logFilter, setLogFilter] = useState("all");

  if (loading) return <LanternSpinner label="Opening your scroll" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;

  const m = account.member;
  const logs = (account.recentLogs || []).filter((l) => logFilter === "all" || l.source === logFilter);
  const bets = account.recentBets || [];

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex items-center gap-4 p-5">
          <Avatar url={m.avatar_url} name={m.discord_name} size={64} className="border-2 border-gold/70" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-2xl font-bold">{m.discord_name || m.discord_id}</h1>
            <p className="text-sm">
              <span className="text-gold">{ROLE_TITLE[m.role] || ROLE_TITLE.member}</span>
              <span className="text-mist"> · rank #{account.rank}</span>
            </p>
            {m.discord_username && <p className="truncate text-xs text-mist">@{m.discord_username}</p>}
          </div>
          <Points value={m.points} className="hidden font-heading text-2xl font-extrabold text-gold sm:inline-flex" iconSize={22} />
        </div>
        {(m.role === "officer" || m.role === "leader") && (
          <div className="border-t border-bronze/40 p-3 md:hidden">
            <Link to="/admin" className="btn-bronze h-10 w-full text-sm">Open the admin hall</Link>
          </div>
        )}
      </Panel>

      <NotificationSettings />

      <Panel title="Point history">
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Filter history">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={logFilter === s.id}
              data-on={logFilter === s.id}
              onClick={() => setLogFilter(s.id)}
              className="btn-bronze h-8 shrink-0 px-3 text-xs"
            >
              {s.label}
            </button>
          ))}
        </div>
        <ActivityList logs={logs} />
        <p className="mt-2 text-center text-xs text-mist/70">Showing your latest 50 changes.</p>
      </Panel>

      <Panel title="Games played">
        {bets.length === 0 ? (
          <p className="py-4 text-center text-sm text-mist">
            No games yet. <Link to="/games" className="text-gold hover:underline">Try your luck</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-bronze/25">
            {bets.map((b) => {
              const net = b.payout - b.wager;
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{GAME_NAME[b.game] || b.game}</span>
                      <span className="text-mist"> · wager {b.wager.toLocaleString()}</span>
                    </p>
                    <p className="truncate text-xs text-mist">
                      {describe(b)} · {new Date(b.created_date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={cn("shrink-0 font-heading font-bold tabular-nums", b.won ? "text-jade" : "text-ember")}>
                    {net >= 0 ? "+" : "−"}
                    {Math.abs(net).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}