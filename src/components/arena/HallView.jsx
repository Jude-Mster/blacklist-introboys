import React, { useEffect, useState } from "react";
import { Loader2, Crown, Trophy, Swords, Target, Flame, Medal } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { errorText } from "@/lib/GuildContext";
import { PLACE } from "@/lib/prizes";
import { cn } from "@/lib/utils";
import { fmt, fmtPrice } from "./arenaUi";
import { TitleTag } from "./TourExtras";

// 6.22 Hall of Fame: every tournament champion, the leaders and the records, worked out from finished
// tournaments and grudge matches. Titles (Reigning Champion, 3× Champion) come from tournament wins.
const BOARDS = [
  ["wins", "Tournament wins", Trophy, (p) => fmt(p.wins)],
  ["podiums", "Podiums (top 3)", Medal, (p) => fmt(p.podiums)],
  ["match_wins", "Matches won", Swords, (p) => `${fmt(p.match_wins)}–${fmt(p.match_losses)}`],
  ["best_streak", "Best win streak", Flame, (p) => fmt(p.best_streak)],
  ["grudge_wins", "Grudge wins", Swords, (p) => `${fmt(p.grudge_wins)} · +${fmt(p.grudge_won_points)}`],
  ["predictions_won", "Perfect brackets", Target, (p) => fmt(p.predictions_won)]
];
const day = (iso) => (iso ? new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "");

export default function HallView({ member }) {
  const [hall, setHall] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    base44.functions.invoke("tournamentAction", { action: "hall" }).then((r) => { if (live) setHall(r.data.hall); }).catch((e) => { if (live) setErr(errorText(e, "Couldn't load the Hall of Fame.")); });
    return () => { live = false; };
  }, []);
  if (!hall) return <Panel title="Hall of Fame">{err ? <p role="alert" className="text-sm text-ember">{err}</p> : <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>}</Panel>;
  const titles = hall.titles || {};
  const r = hall.reigning;
  const rec = hall.records || {};
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0 space-y-4">
        <div className="relative overflow-hidden rounded-md border border-gold/60 bg-[radial-gradient(120%_120%_at_20%_0%,rgba(232,193,90,.25),#13141b_60%)] p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-crimson arena-label">Hall of Fame</p>
          {r ? (
            <div className="mt-2 flex items-center gap-4">
              <div className="relative shrink-0"><Avatar url={r.avatar} name={r.name} size={72} /><Crown className="absolute -top-4 left-1/2 h-7 w-7 -translate-x-1/2 text-gold drop-shadow" aria-hidden="true" /></div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-mist">Reigning Champion</p>
                <h2 className="arena-display truncate text-3xl font-black text-[#f1d38c]">{r.name}{r.member_id === member.id ? " (you)" : ""}</h2>
                <p className="text-sm text-mist">{titles[r.member_id]} · won "{hall.champions[0] && hall.champions[0].title}"</p>
              </div>
            </div>
          ) : <p className="mt-2 text-sm">No champion yet. Win the first tournament to open the Hall of Fame.</p>}
          <p className="mt-3 text-xs text-mist">{fmt(hall.tournaments)} tournaments · {fmt(hall.grudges)} grudge matches</p>
        </div>

        <Panel title="Champions">
          {hall.champions.length ? (
            <ol className="space-y-2">
              {hall.champions.map((c) => (
                <li key={c.tour_id} className="rounded border border-bronze/40 bg-black/30 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-heading font-bold text-gold">{c.title}</p>
                    <p className="text-xs text-mist">{day(c.at)} · {c.fighters} fighters{c.format === "double" ? " · double elimination" : ""}</p>
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {c.places.map((p) => <li key={p.place} className={cn("flex items-center gap-1.5", p.place === 1 && "font-bold")}><span className="font-heading text-gold">{PLACE[p.place - 1]}</span><Avatar url={p.avatar} name={p.name} size={18} />{p.name}</li>)}
                  </ul>
                  {c.prediction && c.prediction.winner && <p className="mt-1 text-xs text-jade">Perfect bracket: {c.prediction.winner}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-mist">No finished tournaments yet.</p>}
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        <Panel title="Records">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Biggest upset</dt><dd>{rec.upset ? <><b className="text-gold">{rec.upset.winner}</b> beat {rec.upset.loser} at {fmtPrice(rec.upset.price)} · {rec.upset.title}, {rec.upset.stage}</> : "—"}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Biggest grudge</dt><dd>{rec.biggest_grudge ? <><b className="text-gold">{rec.biggest_grudge.winner}</b> beat {rec.biggest_grudge.loser} for {fmt(rec.biggest_grudge.stake)} each</> : "—"}</dd></div>
          </dl>
        </Panel>
        {BOARDS.map(([key, title, Icon, val]) => {
          const list = (hall.leaders || {})[key] || [];
          if (!list.length) return null;
          return (
            <Panel key={key} title={title}>
              <ol className="space-y-1">
                {list.map((p, i) => (
                  <li key={p.member_id} className={cn("flex items-center gap-2 text-sm", p.member_id === member.id && "text-[#9fdcff]")}>
                    <span className="w-5 text-right font-heading font-bold tabular-nums text-gold">{i + 1}</span>
                    <Avatar url={p.avatar} name={p.name} size={20} />
                    <span className="flex min-w-0 flex-1 items-center truncate">{p.name}<TitleTag text={titles[p.member_id]} className="hidden sm:inline-flex" /></span>
                    <span className="flex items-center gap-1 tabular-nums text-mist"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{val(p)}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
