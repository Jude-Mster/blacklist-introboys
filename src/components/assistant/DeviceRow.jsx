import React, { useState } from "react";
import { Loader2, MonitorSmartphone, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n) => Number(n || 0).toLocaleString();
const isPhone = (d) => d && d.platform === "android";

// One device: its name, days, the PC or phone it is locked to, and the things that can be done to it.
export default function DeviceRow({ d, busy, onRename, onReset, onRemove }) {
  const [label, setLabel] = useState(null);        // null = not renaming
  const saving = busy === `name${d.seat}`;
  const save = async (e) => {
    e.preventDefault();
    if (!label) return;
    if (await onRename(d.seat, label)) setLabel(null);
  };

  return (
    <li className="rounded-md border border-bronze/50 bg-black/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <MonitorSmartphone className="h-4 w-4 text-gold" aria-hidden="true" />
        {label !== null ? (
          <form onSubmit={save} className="flex gap-1.5">
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={24} className="field h-8 w-40 text-sm" aria-label="Device name" />
            <button className="btn-seal h-8 px-2 text-xs" disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</button>
            <button type="button" onClick={() => setLabel(null)} className="text-xs text-mist underline">Cancel</button>
          </form>
        ) : (
          <button type="button" onClick={() => setLabel(d.label)} className="group flex items-center gap-1.5 font-bold text-white" title="Rename">
            {d.label}<Pencil className="h-3 w-3 text-mist opacity-60 group-hover:opacity-100" aria-hidden="true" />
          </button>
        )}
        <span className={cn("rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase", d.active ? "border-white/70 text-white" : "border-ember/60 text-ember")}>
          {d.active ? `${fmt(d.days_left)} day${d.days_left === 1 ? "" : "s"}` : d.revoked ? "Switched off" : "No days"}
        </span>
        {d.device_bound && <span className={cn("rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase", isPhone(d) ? "border-gold/70 text-gold" : "border-white/40 text-mist")}>{isPhone(d) ? "Mobile" : "PC"}</span>}
        {d.online && <span className="ml-auto flex items-center gap-1.5 text-xs text-mist"><span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" /> App running</span>}
      </div>
      <p className="mt-1 text-mist">
        {d.device_bound ? <>Locked to the {isPhone(d) ? "phone" : "PC"} with device ID <b className="font-mono text-gold">{d.device_tag}</b>.</> : "Not locked yet: the next PC or phone that signs in without a device takes it."}
        {d.active && <> Runs until {new Date(d.expires_at).toLocaleDateString()}.</>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {d.device_bound && (
          <button onClick={() => onReset(d)} disabled={!!busy} className="btn-bronze h-8 px-2.5 text-xs">
            {busy === `reset${d.seat}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPhone(d) ? "Move to another phone or PC" : "Move to another PC"}
          </button>
        )}
        {d.seat > 1 && d.whole_days < 1 && (
          <button onClick={() => onRemove(d)} disabled={!!busy} className="btn-bronze h-8 px-2.5 text-xs !text-ember">
            {busy === `rm${d.seat}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />} Remove
          </button>
        )}
      </div>
    </li>
  );
}