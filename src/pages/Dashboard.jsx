import React, { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import { Ingot } from "@/components/SealLogo";
import RankBadge from "@/components/RankBadge";
import Wheel, { angleFor } from "@/components/games/Wheel";
import { GAMES } from "@/lib/games";
import { cn } from "@/lib/utils";
import { AlertTriangle, Ticket, ChevronRight } from "lucide-react";
import ActivityList from "@/components/ActivityList";

const DAY = 24 * 60 * 60 * 1000;
const WHEEL_COLORS = ["#C8161D", "#5C5C5C", "#3E7FB8", "#3FA796", "#7A2E5C", "#8C8C8C"];

export default function Dashboard() {
  const { account, settings, loading } = useGuild();
  const [params, setParams] = useSearchParams();
  const justLinked = params.get("linked") === "1";

  useEffect(() => {
    if (!justLinked) return;
    const t = setTimeout(() => setParams({}, { replace: true }), 6000);
    return () => clearTimeout(t);
  }, [justLinked, setParams]);

  if (loading) return <LanternSpinner label="Lighting the lanterns" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;

  const m = account.member;
  const isLeader = m.role === "leader";

  return (
    <div className="space-y-5">
      {justLinked && (
        <p role="status" className="rounded-md border border-jade/50 bg-jade/10 px-4 py-3 text-sm text-jade">
          Discord linked. Welcome to the hall, {m.discord_name}.
        </p>
      )}
      {isLeader && account.setup && !account.setup.guild_configured && (
        <Link
          to="/admin"
          className="flex items-start gap-3 rounded-md border border-gold/60 bg-gold/10 px-4 py-3 text-sm text-[hsl(var(--foreground))]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <span>
            <b className="text-gold">Finish setup:</b> add your Discord server ID in Admin so members can link. Until then, only you can get in.
          </span>
        </Link>
      )}

      <CharacterCard member={m} rank={account.rank} stats={account.stats} />

      <Link to="/raffle" className="flex items-center gap-3 rounded-md border border-bronze/50 bg-black/25 px-4 py-3 transition-colors hover:border-gold/70">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-bronze/50 bg-black/40 text-gold">
          <Ticket className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading font-bold text-gold">Guild raffle</span>
          <span className="block text-xs text-mist">Buy tickets with points and get your name on the wheel.</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-mist" aria-hidden="true" />
      </Link>

      <div className="grid gap-5 md:grid-cols-2">
        <DailyWheel member={m} settings={settings} />
        <Panel title="Games">
          <ul className="space-y-2">
            {GAMES.filter((g) => !settings || (settings.games_enabled || []).includes(g.id)).map((g) => (
              <li key={g.id}>
                <Link
                  to={g.href || `/games?game=${g.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-bronze/40 bg-black/20 px-3 py-2.5 transition-colors hover:border-gold/70"
                >
                  <span>
                    <span className="block font-heading font-bold text-gold">{g.name}</span>
                    <span className="block text-xs text-mist">{g.blurb}</span>
                  </span>
                  <span className="text-sm text-mist">Play</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent points">
        <ActivityList logs={(account.recentLogs || []).slice(0, 8)} />
        <Link to="/profile" className="mt-3 block text-center text-sm text-gold hover:underline">
          See full history
        </Link>
      </Panel>
    </div>
  );
}

function CharacterCard({ member: m, rank, stats }) {
  const winRate = stats && stats.played ? Math.round((stats.wins / stats.played) * 100) : null;
  return (
    <Panel>
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="rounded-full p-[3px]" style={{ background: "conic-gradient(#FFFFFF, #C8161D, #5C5C5C, #FFFFFF)" }}>
              <Avatar url={m.avatar_url} name={m.discord_name} size={80} className="border-2 border-[hsl(var(--ink))]" />
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-gold/70 bg-crimson px-1.5 text-[11px] font-bold text-[hsl(0_0%_90%)]">
              #{rank || "–"}
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-bold text-[hsl(var(--foreground))]">{m.discord_name || m.discord_id}</h1>
            <RankBadge role={m.role} className="mt-1" />
          </div>
        </div>

        <div className="sm:ml-auto sm:text-right">
          <p className="text-sm text-mist">Guild points</p>
          <p key={m.points} className="count-pop flex items-center gap-2 font-heading text-4xl font-extrabold text-gold sm:justify-end">
            <Ingot size={30} />
            <span className="tabular-nums">{m.points.toLocaleString()}</span>
          </p>
        </div>
      </div>
      {stats && stats.played > 0 && (
        <dl className="grid grid-cols-3 border-t border-bronze/40 text-center">
          <Stat label="Games played" value={stats.played} />
          <Stat label="Win rate" value={`${winRate}%`} />
          <Stat label="Net from games" value={`${stats.net >= 0 ? "+" : "−"}${Math.abs(stats.net).toLocaleString()}`} tone={stats.net >= 0 ? "text-jade" : "text-ember"} />
        </dl>
      )}
    </Panel>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="border-r border-bronze/30 px-2 py-3 last:border-r-0">
      <dt className="text-xs text-mist">{label}</dt>
      <dd className={cn("font-heading text-lg font-bold tabular-nums", tone || "text-[hsl(var(--foreground))]")}>{value}</dd>
    </div>
  );
}

function DailyWheel({ member, settings }) {
  const { setBalance, reload } = useGuild();
  const prizes = (settings && settings.daily_wheel_prizes && settings.daily_wheel_prizes.length
    ? settings.daily_wheel_prizes
    : [50, 100, 150, 250, 500, 1000]);
  const segments = prizes.map((p, i) => ({ label: String(p), color: WHEEL_COLORS[i % WHEEL_COLORS.length], fontSize: 13 }));
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [claimedAt, setClaimedAt] = useState(member.daily_claimed_at);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const nextAt = claimedAt ? Date.parse(claimedAt) + DAY : 0;
  const ready = !nextAt || now >= nextAt;

  const spin = async () => {
    setSpinning(true);
    setErr("");
    setMsg("");
    try {
      const res = await base44.functions.invoke("claimDaily");
      const { index, prize, balance } = res.data;
      setRotation((r) => angleFor(index, r, prizes.length, 5));
      await new Promise((r) => setTimeout(r, 3100));
      setMsg(`+${prize} points. Come back tomorrow for another spin.`);
      setBalance(balance);
      setClaimedAt(new Date().toISOString());
      reload();
    } catch (e) {
      setErr(errorText(e, "Couldn't spin the wheel."));
    } finally {
      setSpinning(false);
    }
  };

  return (
    <Panel title="Daily fortune">
      <div className="flex flex-col items-center">
        <Wheel segments={segments} rotation={rotation} spinning={spinning} spinMs={3000} size={200} />
        <div aria-live="polite" className="mt-3 min-h-[1.25rem] text-center text-sm">
          {msg && <p className="font-bold text-jade">{msg}</p>}
          {err && <p className="text-ember">{err}</p>}
        </div>
        <button onClick={spin} disabled={spinning || !ready} className="btn-seal mt-2 h-11 w-full text-base">
          {spinning ? "Spinning" : ready ? "Spin for free" : `Next spin in ${formatWait(nextAt - now)}`}
        </button>
      </div>
    </Panel>
  );
}

function formatWait(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.max(1, Math.ceil((ms % 3600000) / 60000));
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}