import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { cn } from "@/lib/utils";

const rows = (res) => (Array.isArray(res) ? res : (res && res.items) || []);
// "just now", "4m ago", then the clock time; the full date and time on hover.
const clockTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
function when(iso, now) {
  const t = Date.parse(iso);
  if (!t) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  const sameDay = new Date(t).toDateString() === new Date(now).toDateString();
  return sameDay ? clockTime(iso) : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + clockTime(iso);
}
const POLL_MS = 30000;

// What the guild is winning and losing right now, across every game.
export default function LiveFeed({ className, limit = 14 }) {
  const [items, setItems] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const merge = useCallback(
    (incoming) =>
      setItems((cur) => {
        const byId = new Map((cur || []).map((x) => [x.id, x]));
        for (const x of incoming) if (x && x.id) byId.set(x.id, x);
        return [...byId.values()].sort((a, b) => (a.created_date < b.created_date ? 1 : -1)).slice(0, limit);
      }),
    [limit]
  );

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await base44.functions.invoke("getGameFeed", { limit });
        if (alive) merge(rows(res.data));
      } catch {
        if (alive) setItems((cur) => cur || []);
      }
    };
    load();
    let unsub = () => {};
    try {
      unsub = base44.entities.GameFeed.subscribe((ev) => {
        if (ev && ev.type === "create" && ev.data) merge([{ ...ev.data, id: ev.data.id || ev.id }]);
      });
    } catch {
      /* polling covers it */
    }
    const poll = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
      unsub && unsub();
    };
  }, [limit, merge]);

  return (
    <Panel title="Live plays" className={className}>
      {items === null ? (
        <p className="py-4 text-center text-sm text-mist">Loading</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-mist">No plays yet. Be the first at the tables.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <Avatar url={f.avatar} name={f.name} size={24} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate">
                  <span className="font-bold">{f.name}</span>
                </p>
                <p className="truncate text-xs text-mist">
                  {String(f.game_name || "").replace(/^Blacklist /, "")}
                  {f.detail ? ` · ${f.detail}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right leading-tight">
                <p className={cn("font-heading font-bold tabular-nums", f.net > 0 ? "text-jade" : f.net < 0 ? "text-ember" : "text-mist")}>
                  {f.net > 0 ? "+" : f.net < 0 ? "−" : ""}
                  {Math.abs(f.net || 0).toLocaleString()}
                </p>
                <time dateTime={f.created_date} title={new Date(f.created_date).toLocaleString()} className="block text-[11px] text-mist/80">
                  {f.net > 0 ? "won" : f.net < 0 ? "lost" : "tied"} {when(f.created_date, now)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}