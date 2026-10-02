import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { cn } from "@/lib/utils";

const rows = (res) => (Array.isArray(res) ? res : (res && res.items) || []);
const POLL_MS = 12000;

// What the guild is winning and losing right now, across every game.
export default function LiveFeed({ className, limit = 14 }) {
  const [items, setItems] = useState(null);

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
        const res = await base44.entities.GameFeed.filter({}, { sort: "-created_date", limit });
        if (alive) merge(rows(res));
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
              <span className={cn("shrink-0 font-heading font-bold tabular-nums", f.net > 0 ? "text-jade" : f.net < 0 ? "text-ember" : "text-mist")}>
                {f.net > 0 ? "+" : f.net < 0 ? "−" : ""}
                {Math.abs(f.net || 0).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}