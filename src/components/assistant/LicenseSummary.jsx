import React from "react";
import { Link } from "react-router-dom";
import Panel from "@/components/Panel";
import { cn } from "@/lib/utils";

const fmt = (n) => Number(n || 0).toLocaleString();
const WHY = {
  no_license: "No days yet. Buy some in the guild shop.",
  expired: "Your time has run out. Buy more days in the guild shop.",
  revoked: "Your license was switched off by the Guild Leader."
};

// The one line a member wants first: how long the Assistant runs, on how many devices, and whether it is up now.
export default function LicenseSummary({ license, devices = [], max = 5, appOnline }) {
  const lic = license || {};
  const active = !!lic.active;
  const stats = [
    ["Days left", active ? fmt(lic.days_left) : "0"],
    ["Devices", `${devices.length} of ${max}`],
    ["Assistant", appOnline ? "Running" : "Not running"]
  ];
  return (
    <Panel title="Your Assistant">
      <div className="grid grid-cols-3 gap-2">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-md border border-bronze/50 bg-black/30 px-3 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-mist">{k}</dt>
            <dd className={cn("font-heading text-xl font-extrabold", k === "Assistant" && appOnline ? "text-emerald-300" : "text-white")}>{v}</dd>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-mist">
        {active
          ? <>Runs until <b className="text-white">{new Date(lic.expires_at).toLocaleDateString()}</b> on {lic.label || "your device"}. Days switch on the moment you pay.</>
          : <>{WHY[lic.reason] || WHY.no_license}{" "}
              <Link to="/shop" className="text-gold underline">Go to the shop</Link></>}
      </p>
    </Panel>
  );
}