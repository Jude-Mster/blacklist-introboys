import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild } from "@/lib/GuildContext";
import { Gift, History, Dices } from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = { award: "Award", game: "Game", daily: "Daily", admin: "Admin", import: "Import" };

export default function Dashboard() {
  const { account, loading, reload } = useGuild();
  const [spinning, setSpinning] = useState(false);
  const [wheelMsg, setWheelMsg] = useState("");
  const [wheelErr, setWheelErr] = useState("");

  if (loading) return <LanternSpinner label="Lighting the lanterns" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;

  const member = account.member;
  const claimedRecently = member.daily_claimed_at && (Date.now() - new Date(member.daily_claimed_at).getTime()) < 24 * 60 * 60 * 1000;

  const spin = async () => {
    setSpinning(true);
    setWheelErr("");
    setWheelMsg("");
    try {
      const res = await base44.functions.invoke("claimDaily");
      setWheelMsg(`The lanterns favor you — +${res.data.prize} points!`);
      await reload();
    } catch (e) {
      const data = e && e.response && e.response.data;
      setWheelErr(data && data.error ? data.error : e.message || "Could not claim daily reward.");
    } finally {
      setSpinning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel className="p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Your balance</p>
        <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
          <div className="font-heading text-5xl font-bold text-gold tabular-nums">{member.points.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">points</div>
        </div>
      </Panel>

      <Panel className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <Gift className="w-5 h-5 text-crimson" />
          <h2 className="font-heading text-lg text-gold font-bold">Daily Wheel</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Spin once every 24 hours for a bonus from the wheel of fortune.</p>
        {wheelMsg && <p className="text-jade text-sm mb-3 font-medium">{wheelMsg}</p>}
        {wheelErr && <p className="text-ember text-sm mb-3">{wheelErr}</p>}
        <Button
          onClick={spin}
          disabled={spinning || claimedRecently}
          className="bg-crimson hover:bg-ember text-gold font-heading tracking-wider border border-gold/40"
        >
          {spinning ? "Spinning…" : claimedRecently ? "Claimed today" : "Spin the wheel"}
        </Button>
      </Panel>

      <div className="grid md:grid-cols-2 gap-6">
        <Panel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <History className="w-5 h-5 text-gold" />
            <h2 className="font-heading text-lg text-gold font-bold">Recent points</h2>
          </div>
          <ul className="space-y-2">
            {(!account.recentLogs || account.recentLogs.length === 0) && (
              <li className="text-sm text-muted-foreground">No activity yet.</li>
            )}
            {account.recentLogs && account.recentLogs.map((l) => (
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
                <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0">{new Date(l.created_date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Dices className="w-5 h-5 text-gold" />
            <h2 className="font-heading text-lg text-gold font-bold">Last 10 bets</h2>
          </div>
          <ul className="space-y-2">
            {(!account.recentBets || account.recentBets.length === 0) && (
              <li className="text-sm text-muted-foreground">No bets yet. Visit the games.</li>
            )}
            {account.recentBets && account.recentBets.map((b) => (
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
    </div>
  );
}