import React, { useEffect, useState } from "react";
import MemberAvatar from "@/components/Avatar";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import { Points } from "@/components/SealLogo";
import RankBadge from "@/components/RankBadge";
import { cn } from "@/lib/utils";

const MEDAL = [
  { ring: "#D8B46A", label: "First", glyph: "壹" },
  { ring: "#B9C4CC", label: "Second", glyph: "貳" },
  { ring: "#B07A45", label: "Third", glyph: "參" }
];

export default function Leaderboard() {
  const { account } = useGuild();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const me = account && account.linked ? account.member.discord_id : null;

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getLeaderboard");
        setRows(res.data.leaderboard || []);
      } catch (e) {
        setError(errorText(e, "Couldn't load the rankings."));
        setRows([]);
      }
    })();
  }, []);

  if (!rows) return <LanternSpinner label="Summoning the ranks" className="py-24" />;

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="space-y-5">
      <header className="text-center">
        <h1 className="font-heading text-3xl font-extrabold gilt-text">Rankings</h1>
        <p className="mt-1 text-sm text-mist">The top 20 of the Blacklist by points.</p>
      </header>

      {error && <p role="alert" className="text-center text-sm text-ember">{error}</p>}
      {!error && rows.length === 0 && (
        <Panel title="No one ranked yet">
          <p className="text-center text-mist">Points from awards, games and the daily wheel will put names here.</p>
        </Panel>
      )}

      {podium.length > 0 && (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
          {[1, 0, 2].map((i) =>
            podium[i] ? <Podium key={i} m={podium[i]} place={i} me={podium[i].discord_id === me} /> : <div key={i} />
          )}
        </div>
      )}

      {rest.length > 0 && (
        <Panel title="The ranks">
          <ol className="divide-y divide-bronze/25" start={4}>
            {rest.map((m, i) => (
              <li
                key={m.id}
                className={cn("flex items-center gap-3 px-1 py-2.5", m.discord_id === me && "-mx-1 rounded bg-gold/10 px-2")}
              >
                <span className="w-7 text-center font-heading font-bold text-mist tabular-nums">{i + 4}</span>
                <Avatar url={m.avatar_url} name={m.discord_name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[hsl(var(--foreground))]">
                    {m.discord_name || m.discord_id}
                    {m.discord_id === me && <span className="ml-2 text-xs text-gold">You</span>}
                  </p>
                  <RankBadge role={m.role} className="mt-0.5" />
                </div>
                <Points value={m.points} className="font-heading font-bold text-gold" iconSize={15} />
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}

function Podium({ m, place, me }) {
  const medal = MEDAL[place];
  const heights = ["h-28 sm:h-32", "h-20 sm:h-24", "h-16 sm:h-20"];
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        {place === 0 && (
          <svg className="absolute -top-6 left-1/2 -translate-x-1/2" width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
            <path d="M2 20 L5 6 L12 13 L17 2 L22 13 L29 6 L32 20 Z" fill="#D8B46A" stroke="#8A6A3E" strokeWidth="1.2" />
          </svg>
        )}
        <div className="rounded-full p-[3px]" style={{ background: medal.ring }}>
          <Avatar url={m.avatar_url} name={m.discord_name} size={place === 0 ? 72 : 56} ring />
        </div>
      </div>
      <p className={cn("mt-2 w-full truncate px-1 text-sm font-bold", me ? "text-gold" : "text-[hsl(var(--foreground))]")}>
        {m.discord_name || m.discord_id}
      </p>
      <Points value={m.points} className="text-sm font-bold text-gold" iconSize={14} />
      <div
        className={cn(
          "mt-2 flex w-full items-start justify-center rounded-t-md border border-b-0 pt-2",
          heights[place]
        )}
        style={{
          borderColor: `${medal.ring}99`,
          background: `linear-gradient(180deg, ${medal.ring}33, transparent)`
        }}
      >
        <span className="font-heading text-2xl font-extrabold" style={{ color: medal.ring }} lang="zh-Hant" aria-label={`${medal.label} place`}>
          {medal.glyph}
        </span>
      </div>
    </div>
  );
}

function Avatar({ url, name, size = 36, ring }) {
  return (
    <MemberAvatar
      url={url}
      name={name}
      size={size}
      className={ring ? "border-2 border-[hsl(var(--ink))]" : "border border-bronze/50"}
    />
  );
}