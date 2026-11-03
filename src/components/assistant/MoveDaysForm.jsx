import React, { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

// Divide the days a member has paid for between their devices.
export default function MoveDaysForm({ devices, max, busy, onMove }) {
  const withDays = devices.filter((d) => d.whole_days > 0);
  const [from, setFrom] = useState(withDays.length ? String(withDays[0].seat) : "1");
  const [to, setTo] = useState("new");
  const [days, setDays] = useState("");
  const fromDev = devices.find((d) => String(d.seat) === from);
  const canNew = devices.length < max;
  const toValue = !canNew && to === "new" ? String(devices.find((d) => String(d.seat) !== from)?.seat ?? from) : to;
  const busyHere = busy === "move";
  const n = Number(days);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onMove({ from: Number(from), to: toValue === "new" ? "new" : Number(toValue), days: n }).then((ok) => { if (ok) setDays(""); }); }}
      className="mt-3 rounded-md border border-bronze/40 p-3 text-sm">
      <p className="mb-2 font-bold text-white">Divide your days between devices</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="mv-from" className="label">From</label>
          <select id="mv-from" value={from} onChange={(e) => setFrom(e.target.value)} className="field h-10">
            {withDays.map((d) => <option key={d.seat} value={String(d.seat)}>{d.label} ({d.whole_days} d)</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mv-days" className="label">Days</label>
          <input id="mv-days" type="number" min="1" max={fromDev ? fromDev.whole_days : 1} step="1" value={days} onChange={(e) => setDays(e.target.value)} className="field h-10 w-24" required />
        </div>
        <ArrowRight className="mb-3 h-4 w-4 text-mist" aria-hidden="true" />
        <div>
          <label htmlFor="mv-to" className="label">To</label>
          <select id="mv-to" value={toValue} onChange={(e) => setTo(e.target.value)} className="field h-10">
            {devices.filter((d) => String(d.seat) !== from).map((d) => <option key={d.seat} value={String(d.seat)}>{d.label}</option>)}
            {canNew && <option value="new">A new device (another PC)</option>}
          </select>
        </div>
        <button disabled={!!busy || !(n >= 1)} className="btn-seal h-10 px-4 text-sm">{busyHere ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move days"}</button>
      </div>
      <p className="mt-2 text-xs text-mist">A new device is ready for the next PC that signs in. Each PC runs on its own device&apos;s days.</p>
    </form>
  );
}