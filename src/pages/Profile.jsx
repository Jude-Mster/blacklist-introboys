import React, { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import { useGuild } from "@/lib/GuildContext";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = { award: "Award", game: "Game", daily: "Daily", admin: "Admin", import: "Import" };
const SOURCES = ["all", "award", "game", "daily", "admin", "import"];

export default function Profile() {
  const { account, loading } = useGuild();
  const [logFilter, setLogFilter] = useState("all");
  const [betFilter, setBetFilter] = useState("all");

  if (loading) return <LanternSpinner label="Opening your scroll" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;

  const m = account.member;
  const logs = (account.recentLogs || []).filter((l) => logFilter === "all" || l.source === logFilter);
  const bets = (account.recentBets || []).filter((b) => betFilter === "all" || b.game === betFilter);

  return (
    <div className="space-y-6">
      <Panel className="p-6">
        <div className="flex items-center gap-4">
          {m.avatar_url ? (
            <Image src={m.avatar_url} fittingType="fill" className="w-16 h-16 rounded-full border border-gold/40" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-crimson text-gold font-heading flex items-center justify-center text-xl border border-gold/40">
              {(m.discord_name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-2xl text-gold font-bold truncate">{m.discord_name || m.discord_id}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2 capitalize">
              <Shield className="w-4 h-4" /> {m.role}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Balance</p>
            <p className="font-heading text-2xl text-gold tabular-nums">{m.points.toLocaleString()}</p>
          </div>
        </div>
        {(m.role === "officer" || m.role === "leader") && (
          <div className="mt-4 md:hidden">
            <Link to="/admin">
              <Button variant="outline" className="border-gold/40 text-gold hover:bg-gold/10 w-full">Open Admin</Button>
            </Link>
          </div>
        )}
      </Panel>

      <Panel className="p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="font-heading text-lg text-gold font-bold">Point history</h2>
          <FilterTabs value={logFilter} setValue={setLogFilter} options={SOURCES} />
        </div>
        <ul className="space-y-2">
          {logs.length === 0 && <li className="text-sm text-muted-foreground">No entries.</li>}
          {logs.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-sm border-b border-gold/10 pb-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate">
                  <span className={cn("font-medium", l.amount >= 0 ? "text-jade" : "text-ember")}>
                    {l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}
                  </span>{" "}
                  <span className="text-muted-foreground">{SOURCE_LABEL[l.source] || l.source}</span>
                </p>
                <p className="text-xs text-muted-foreground/70 truncate">{l.reason || "—"}</p>
              </div>
              <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0">{new Date(l.created_date).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="font-heading text-lg text-gold font-bold">Bet history</h2>
          <FilterTabs value={betFilter} setValue={setBetFilter} options={["all", "coinflip", "dragondice", "lanternslots"]} />
        </div>
        <ul className="space-y-2">
          {bets.length === 0 && <li className="text-sm text-muted-foreground">No bets yet.</li>}
          {bets.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 text-sm border-b border-gold/10 pb-2 last:border-0">
              <div>
                <p className="capitalize">{b.game} · wager {b.wager.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground/70">{new Date(b.created_date).toLocaleString()}</p>
              </div>
              <span className={cn("font-medium tabular-nums", b.won ? "text-jade" : "text-ember")}>
                {b.won ? `+${(b.payout - b.wager).toLocaleString()}` : `-${b.wager.toLocaleString()}`}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function FilterTabs({ value, setValue, options }) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => setValue(o)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap",
            value === o ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-gold"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}