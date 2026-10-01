import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { Image } from "@/components/ui/image";
import { Crown, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getLeaderboard");
        setData(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LanternSpinner label="Summoning the ranks" className="py-24" />;

  const rows = (data && data.leaderboard) || [];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-heading text-3xl text-gold font-bold">Leaderboard</h1>
        <p className="text-muted-foreground text-sm mt-1">The top 20 of the Blacklist</p>
      </div>

      <Panel className="p-2 sm:p-4">
        <ol className="space-y-1">
          {rows.length === 0 && <li className="text-center text-muted-foreground py-8 text-sm">No members ranked yet.</li>}
          {rows.map((m, i) => <Row key={m.id} m={m} i={i} />)}
        </ol>
      </Panel>
    </div>
  );
}

function Row({ m, i }) {
  const rank = i + 1;
  const crown = rank <= 3;
  const crownColor = rank === 1 ? "text-gold" : rank === 2 ? "text-slate-300" : "text-amber-600";
  return (
    <li className={cn(
      "flex items-center gap-3 px-3 py-3 rounded-md",
      crown && "bg-gold/5 border border-gold/20"
    )}>
      <div className="w-8 text-center font-heading font-bold text-gold tabular-nums">
        {crown ? <Crown className={cn("w-5 h-5 mx-auto", crownColor)} /> : rank}
      </div>
      <Avatar url={m.avatar_url} name={m.discord_name || m.discord_id} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{m.discord_name || m.discord_id}</p>
        <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
      </div>
      <div className="font-heading font-bold text-gold tabular-nums text-lg">{m.points.toLocaleString()}</div>
    </li>
  );
}

function Avatar({ url, name }) {
  if (url) {
    return <Image src={url} fittingType="fill" className="w-9 h-9 rounded-full border border-gold/30 shrink-0" />;
  }
  const initial = (name || "?").charAt(0).toUpperCase();
  return <div className="w-9 h-9 rounded-full bg-crimson text-gold font-heading flex items-center justify-center shrink-0 border border-gold/30">{initial}</div>;
}