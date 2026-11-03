import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";
import DeviceRow from "./DeviceRow";
import MoveDaysForm from "./MoveDaysForm";

const WHY = {
  no_license: "No license yet. Buy days in the guild shop.",
  expired: "Your Assistant time has run out. Buy more days in the guild shop.",
  revoked: "Your license was switched off by the Guild Leader."
};

// The member's devices. Each one is a license for one PC or phone with its own days; days can be moved between them.
export default function DevicesPanel({ data, onChange }) {
  const lic = data.license || {};
  const devices = data.devices || [];
  const max = data.max_devices || 5;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const run = async (key, body, done) => {
    setBusy(key); setError(""); setMsg("");
    try {
      await base44.functions.invoke("botAuth", body);
      if (done) setMsg(done);
      await onChange();
      return true;
    } catch (e) { setError(errorText(e, "That didn't work.")); return false; }
    finally { setBusy(""); }
  };

  const reset = (d) => {
    if (!window.confirm(`Move ${d.label} to another PC? The app on PC ${d.device_tag} is signed out, and the next PC that signs in without a device takes it.`)) return;
    run(`reset${d.seat}`, { action: "resetDevice", seat: d.seat }, `${d.label} is free: the next PC that signs in takes it.`);
  };

  const move = ({ from, to, days }) => {
    const label = to === "new" ? "a new device" : (devices.find((d) => d.seat === to) || {}).label;
    return run("move", { action: "moveDays", from, to, days }, `${days} day${days === 1 ? "" : "s"} moved to ${label}.`);
  };

  return (
    <Panel title={`Your devices (${devices.length} of ${max})`}>
      {devices.length === 0 ? (
        <p className="text-sm text-mist">{WHY[lic.reason] || WHY.no_license}</p>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <DeviceRow
              key={d.seat}
              d={d}
              busy={busy}
              onRename={(seat, label) => run(`name${seat}`, { action: "renameDevice", seat, label })}
              onReset={reset}
              onRemove={(dev) => run(`rm${dev.seat}`, { action: "removeDevice", seat: dev.seat }, `${dev.label} removed.`)}
            />
          ))}
        </ul>
      )}

      {devices.some((d) => d.whole_days > 0) && <MoveDaysForm devices={devices} max={max} busy={busy} onMove={move} />}

      {msg && <p role="status" className="mt-2 text-sm text-gold">{msg}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}

      {data.shop_items.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-mist">
          <span>In the shop:</span>
          {data.shop_items.map((it) => <span key={it.id} className="rounded border border-bronze/60 px-2 py-0.5 text-white">{it.name}</span>)}
          <Link to="/shop" className="btn-seal ml-auto h-9 px-4 text-sm leading-9">Buy days</Link>
        </div>
      ) : (
        <p className="mt-3 text-sm text-mist">The Guild Leader hasn&apos;t put Assistant days in the shop yet.</p>
      )}
      {data.shop_items.length > 0 && <p className="mt-1 text-xs text-mist">When you buy, you pick which device gets the days, or a new device for another PC.</p>}
    </Panel>
  );
}