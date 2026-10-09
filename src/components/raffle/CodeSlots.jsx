import React, { useEffect, useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CodeInput from "@/components/prizes/CodeInput";
import { errorText } from "@/lib/GuildContext";
import { PLACE, DM_TEXT, codeHint } from "@/lib/prizes";
import { cn } from "@/lib/utils";

// Guild Leader only: the code prizes of one raffle. Before the draw a code can be added
// or changed; after the draw, a winner whose code wasn't ready gets it as soon as it is
// added. Only the last 4 characters are ever shown here.
export default function CodeSlots({ raffle: r, drawn, onChange }) {
  const [editing, setEditing] = useState(0); // place being edited
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [stock, setStock] = useState([]);

  useEffect(() => {
    if (!editing) return;
    base44.functions.invoke("prizeAction", { action: "stockSummary" }).then((res) => setStock((res.data && res.data.stock) || [])).catch(() => {});
  }, [editing]);

  const inStock = (label) => {
    const hit = stock.find((x) => x.label.toLowerCase() === String(label).trim().replace(/\s+/g, " ").toLowerCase());
    return hit ? hit.count : 0;
  };

  const save = async (place, fromStock) => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await base44.functions.invoke("raffleAction", { action: "setPrizeCode", raffleId: r.id, place, ...(fromStock ? { from_stock: true } : { code }) });
      const d = res.data || {};
      setNote(d.status === "assigned"
        ? `Code ending in ${d.last4} sent to the winner${d.dm_status === "sent" ? " on the site and by Discord DM" : " on the site"}.`
        : `Code ending in ${d.last4} is set aside for the ${PLACE[place - 1]} prize.`);
      setEditing(0);
      setCode("");
      await onChange();
    } catch (e) {
      setError(errorText(e, "Couldn't save the code."));
    } finally {
      setBusy(false);
    }
  };

  const winnerOf = (place) => (r.winners || []).find((w) => w.place === place);

  return (
    <div className="rounded-xl border border-[#6b5420] bg-[#140f06] p-4">
      <p className="flex items-center gap-2 font-heading text-[15px] tracking-[0.12em] text-[#e8c15a]"><KeyRound className="h-4 w-4" aria-hidden="true" /> PRIZE CODES · ONLY YOU SEE THIS</p>
      <ul className="mt-3 space-y-2.5">
        {r.code_slots.map((slot) => {
          if (!slot) return null;
          const place = slot.place;
          const w = drawn ? winnerOf(place) : null;
          const delivered = slot.status === "assigned";
          const canEdit = !drawn || (w && !delivered);
          return (
            <li key={place} className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-heading text-base font-bold text-white">{PLACE[place - 1]}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] text-white">{r.prizes[place - 1]}</span>
                {drawn && !w ? (
                  <span className="text-sm text-[#c4c4c4]">Nobody won it (its code went back to stock)</span>
                ) : delivered ? (
                  <span className="text-sm text-[#6fd3a2]">Sent to {w ? w.name : "the winner"} · ends in {slot.last4}{slot.dm_status ? ` · ${DM_TEXT[slot.dm_status] || slot.dm_status}` : ""}</span>
                ) : slot.last4 ? (
                  <span className="text-sm text-[#6fd3a2]">{drawn ? `Ready for ${w.name} · ends in ${slot.last4}` : `Code ready · ends in ${slot.last4}`}</span>
                ) : (
                  <span className="text-sm text-[#e8c15a]">{drawn ? `${w.name} is waiting for a code` : "No code yet"}</span>
                )}
                {canEdit && editing !== place && (
                  <button type="button" onClick={() => { setEditing(place); setCode(""); setError(""); }} className="btn-bronze h-9 px-3 text-sm">
                    {drawn ? "Add code and send" : slot.last4 ? "Change" : "Add code"}
                  </button>
                )}
                {drawn && w && !delivered && slot.last4 && editing !== place && (
                  <button type="button" onClick={() => save(place, false)} disabled={busy} className="btn-seal h-9 px-3 text-sm">Send it now</button>
                )}
              </div>
              {editing === place && (
                <div className="mt-3 space-y-2">
                  <CodeInput value={code} onChange={setCode} label={drawn ? `Code for ${w.name} (sent the moment you save)` : "The code (only the winner will ever see it)"} autoFocus />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => save(place, false)} disabled={busy || !codeHint(code).ok} className="btn-seal h-10 px-4 text-sm">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : drawn ? "Send to the winner" : "Save code"}
                    </button>
                    <button type="button" onClick={() => save(place, true)} disabled={busy || !inStock(r.prizes[place - 1])} className={cn("btn-bronze h-10 px-4 text-sm")}>
                      Use one from stock ({inStock(r.prizes[place - 1])})
                    </button>
                    <button type="button" onClick={() => { setEditing(0); setCode(""); }} disabled={busy} className="btn-bronze h-10 px-4 text-sm">Cancel</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-[15px] text-ember">{error}</p>}
      {note && <p role="status" className="mt-2 text-[15px] text-jade">{note}</p>}
      <p className="mt-2 text-[13px] text-[#c4c4c4]">Members never see these codes. Each winner sees only their own, on the site and in a Discord DM.</p>
    </div>
  );
}