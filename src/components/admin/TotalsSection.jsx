import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";

export default function TotalsSection() {
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("adminAction", { action: "totals" });
      setTotals(res.data.totals);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading || !totals) return <Panel className="p-6"><LanternSpinner label="Tallying" /></Panel>;

  const items = [
    { label: "Awards", value: totals.award, color: "text-gold" },
    { label: "Games (net)", value: totals.game, color: "text-ember" },
    { label: "Daily", value: totals.daily, color: "text-jade" },
    { label: "Admin", value: totals.admin, color: "text-gold" },
    { label: "Import", value: totals.import, color: "text-gold" }
  ];

  return (
    <Panel className="p-6">
      <h2 className="font-heading text-xl text-gold font-bold mb-1">Last 7 days</h2>
      <p className="text-sm text-muted-foreground mb-4">{totals.count} point changes logged.</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {items.map((it) => (
          <div key={it.label} className="p-3 rounded-md border border-gold/20 bg-ink/40 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{it.label}</p>
            <p className={`mt-1 font-heading text-lg tabular-nums ${it.color}`}>{(it.value || 0).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}