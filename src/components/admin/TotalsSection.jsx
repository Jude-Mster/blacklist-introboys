import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { cn } from "@/lib/utils";

export default function TotalsSection() {
  const [totals, setTotals] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("adminAction", { action: "totals" });
        setTotals(res.data.totals);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  if (failed) return null;
  if (!totals) {
    return (
      <Panel title="Last 7 days">
        <LanternSpinner label="Tallying the ledger" className="py-6" />
      </Panel>
    );
  }

  const items = [
    { label: "Awarded", value: totals.award },
    { label: "Daily wheel", value: totals.daily },
    { label: "Games net", value: totals.game, signed: true },
    { label: "Games played", value: totals.bets, plain: true },
    { label: "Wagered", value: totals.wagered, plain: true }
  ];

  return (
    <Panel title="Last 7 days">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="rounded-md border border-bronze/40 bg-black/20 px-3 py-2.5 text-center">
            <dt className="text-xs text-mist">{it.label}</dt>
            <dd
              className={cn(
                "mt-0.5 font-heading text-lg font-bold tabular-nums",
                it.signed ? ((it.value || 0) >= 0 ? "text-jade" : "text-ember") : "text-gold"
              )}
            >
              {it.signed && (it.value || 0) > 0 ? "+" : ""}
              {(it.value || 0).toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-mist">
        {totals.count.toLocaleString()} point changes logged. Games net is what members won minus what they lost.
      </p>
    </Panel>
  );
}