import React from "react";
import { cn } from "@/lib/utils";

export const SOURCE_LABEL = { award: "Award", game: "Game", daily: "Daily wheel", admin: "Admin", import: "Starting balance", poker: "Poker", duel: "Duel", raffle: "Raffle" };

export default function ActivityList({ logs }) {
  if (!logs.length) {
    return <p className="py-4 text-center text-sm text-mist">No points yet. Spin the daily wheel or join a guild event.</p>;
  }
  return (
    <ul className="divide-y divide-bronze/25">
      {logs.map((l) => (
        <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="truncate text-[hsl(var(--foreground))]">{l.reason || SOURCE_LABEL[l.source] || l.source}</p>
            <p className="text-xs text-mist">
              {SOURCE_LABEL[l.source] || l.source} · {new Date(l.created_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          </div>
          <span className={cn("shrink-0 font-heading font-bold tabular-nums", l.amount >= 0 ? "text-jade" : "text-ember")}>
            {l.amount >= 0 ? "+" : "−"}
            {Math.abs(l.amount).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}