import React, { useCallback, useEffect, useState } from "react";
import { Gem, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const fmt = (n) => Number(n || 0).toLocaleString();
const where = (r) => (r.dungeon === "den" ? "LOD boss" : r.boss > 0 ? `Labyrinth boss ${r.boss}` : "Labyrinth");
function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso || "")) / 1000);
  if (!isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

// 6.42: what the member's IntroBoys Assistant picked up. The app reads each item's name from its label on the ground
// and reports it after every boss.
export default function LootPanel({ licensed }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seat, setSeat] = useState(0);

  const load = useCallback(async (s = seat) => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("botAuth", { action: "lootView", ...(s ? { seat: s } : {}) });
      setData(res.data); setError("");
    } catch (e) { setError(errorText(e, "Couldn't load your loot.")); }
    finally { setBusy(false); }
  }, [seat]);
  useEffect(() => { if (licensed) load(); }, [licensed, load]);

  if (!licensed) return null;
  const seats = (data && data.seats) || [];
  return (
    <Panel title="Loot">
      <div className="flex flex-wrap items-center gap-2">
        {seats.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Device">
            {[0, ...seats].map((s) => (
              <button key={s} type="button" onClick={() => setSeat(s)}
                className={cn("h-8 rounded-md border px-2.5 text-xs font-bold", seat === s ? "border-gold bg-gold/15 text-gold" : "border-bronze/50 text-mist hover:text-white")}>
                {s ? `Device ${s}` : "All devices"}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => load()} disabled={busy} className="ml-auto flex h-8 items-center gap-1.5 text-xs text-mist hover:text-white">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
      {!data ? (!error && <p className="mt-3 text-sm text-mist">Loading…</p>) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Today", data.today], ["Last 7 days", data.week], ["All time", data.total], ["Kinds of items", data.kinds]].map(([k, v]) => (
              <div key={k} className="rounded-md border border-bronze/50 bg-black/30 px-3 py-2">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-mist">{k}</dt>
                <dd className="font-heading text-xl font-extrabold text-white">{fmt(v)}</dd>
              </div>
            ))}
          </dl>
          {data.total === 0 ? (
            <p className="mt-3 text-sm text-mist">Nothing picked up yet. The app lists every item it loots here (version 4.10 and later).</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <section>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-mist">Most looted</h3>
                <ul className="divide-y divide-bronze/25 text-sm">
                  {data.items.slice(0, 15).map((i) => (
                    <li key={i.name} className="flex items-center gap-2 py-1.5">
                      <Gem className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-white" title={i.name}>{i.name}</span>
                      <span className="font-bold tabular-nums text-gold">×{fmt(i.qty)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-mist">Latest</h3>
                <ul className="divide-y divide-bronze/25 text-sm">
                  {data.recent.slice(0, 8).map((r, n) => (
                    <li key={n} className="py-1.5">
                      <span className="block truncate text-white" title={r.name}>{r.name}{r.qty > 1 ? ` ×${r.qty}` : ""}</span>
                      <span className="block text-xs text-mist">{where(r)}{seats.length > 1 ? ` · Device ${r.seat}` : ""} · {ago(r.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
