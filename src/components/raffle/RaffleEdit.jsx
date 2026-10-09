import React, { useEffect, useState } from "react";
import { Loader2, Plus, X, KeyRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CodeInput from "@/components/prizes/CodeInput";
import { errorText } from "@/lib/GuildContext";
import { PLACE, codeHint } from "@/lib/prizes";
import { cn } from "@/lib/utils";

const KIND_LABEL = { item: "In-game item", points: "Guild points", code: "Prize code" };
const pointsOk = (label) => /^\s*\+?\s*(\d[\d,]*)\s*(?:guild\s+)?(?:points?|pts?)\.?\s*$/i.test(label);
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
let nextId = 1;

// Same rule as the server: what the Guild Leader chose, else "150 points" means points.
function kindOf(r, i) {
  const k = Array.isArray(r.prize_kinds) ? r.prize_kinds[i] : "";
  if (k === "item" || k === "points" || k === "code") return k;
  return pointsOk((r.prizes || [])[i] || "") ? "points" : "item";
}
// An ISO time as a datetime-local value in the leader's own time zone.
function toLocal(iso) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function localIn(hours) {
  return toLocal(new Date(Date.now() + hours * 3600000).toISOString());
}

// Guild Leader only: change an open raffle. Codes are never shown, only their last 4.
export default function RaffleEdit({ raffle: r, onSaved, onClose }) {
  const sold = (r.tickets_sold || 0) > 0;
  const slots = Array.isArray(r.code_slots) ? r.code_slots : [];
  const readyCode = (place) => {
    const s = slots[place - 1];
    return s && s.status === "reserved" && s.last4 ? s.last4 : "";
  };
  const [title, setTitle] = useState(r.title || "");
  const [ends, setEnds] = useState(toLocal(r.ends_at));
  const [max, setMax] = useState(r.max_tickets_per_member || 0);
  const [price, setPrice] = useState(r.ticket_price);
  const [prizes, setPrizes] = useState(() =>
    (r.prizes || []).map((label, i) => ({
      id: nextId++, label, kind: kindOf(r, i), from: i + 1,
      codeMode: readyCode(i + 1) ? "keep" : "later", code: ""
    }))
  );
  const [stock, setStock] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.functions.invoke("prizeAction", { action: "stockSummary" }).then((res) => setStock((res.data && res.data.stock) || [])).catch(() => {});
  }, []);
  const inStock = (label) => {
    const hit = stock.find((x) => x.label.toLowerCase() === norm(label));
    return hit ? hit.count : 0;
  };
  const setPrize = (i, change) => setPrizes((list) => list.map((p, j) => (j === i ? { ...p, ...change } : p)));

  // Codes already set aside that this edit sends back to the stock.
  const kept = new Set(prizes.filter((p) => p.from && p.kind === "code").map((p) => p.from));
  const leaving = slots.filter((s) => s && s.status === "reserved" && s.last4 && !kept.has(s.place)).map((s) => s.last4);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const list = prizes.filter((p) => p.label.trim());
      if (!list.length) throw new Error("Add at least one prize.");
      for (const [i, p] of list.entries()) {
        if (p.kind === "points" && !pointsOk(p.label)) throw new Error(`Write the ${PLACE[i]} prize as a number of points, like "150 points".`);
        if (p.kind === "code" && p.codeMode === "type" && !p.code.trim()) throw new Error(`Type the code for the ${PLACE[i]} prize, or pick "Add it later".`);
        if (p.kind === "code" && p.codeMode === "type" && !codeHint(p.code).ok) throw new Error(`Check the code for the ${PLACE[i]} prize.`);
        if (p.kind === "code" && p.codeMode === "stock") {
          const need = list.filter((q, j) => j <= i && q.kind === "code" && q.codeMode === "stock" && norm(q.label) === norm(p.label)).length;
          if (inStock(p.label) < need) throw new Error(`Not enough "${p.label.trim()}" codes in stock for the ${PLACE[i]} prize.`);
        }
      }
      const res = await base44.functions.invoke("raffleAction", {
        action: "edit",
        raffleId: r.id,
        title,
        ...(ends !== toLocal(r.ends_at) ? { ends_at: new Date(ends).toISOString() } : {}),
        max_tickets_per_member: Number(max) || 0,
        ...(sold ? {} : { ticket_price: Number(price) }),
        prizes: list.map((p) => ({
          label: p.label.trim(),
          kind: p.kind,
          from_place: p.from || 0,
          code: p.kind !== "code" ? null : p.codeMode === "stock" ? { from_stock: true } : p.codeMode === "type" ? { code: p.code } : null
        }))
      });
      const back = (res.data && res.data.codes_to_stock) || 0;
      await onSaved(`Raffle updated.${back ? ` ${back} code${back > 1 ? "s" : ""} went back to your stock.` : ""}`);
    } catch (err) {
      setError(err && err.message && !err.response ? err.message : errorText(err, "Couldn't save the changes."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-[#6b5420] bg-[#140f06] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-heading text-[15px] tracking-[0.12em] text-[#e8c15a]">EDIT RAFFLE · ONLY YOU SEE THIS</p>
        <button type="button" onClick={onClose} disabled={busy} className="btn-bronze h-9 w-9 shrink-0" aria-label="Close without saving"><X className="h-4 w-4" /></button>
      </div>

      <div>
        <label htmlFor={`re-title-${r.id}`} className="label">Raffle name</label>
        <input id={`re-title-${r.id}`} className="field" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`re-price-${r.id}`} className="label">Ticket price (points)</label>
          <input id={`re-price-${r.id}`} type="number" min={1} className="field disabled:opacity-60" value={price} onChange={(e) => setPrice(e.target.value)} disabled={sold} required />
          {sold && <p className="mt-1 text-xs text-mist/80">Locked: tickets were already sold at this price.</p>}
        </div>
        <div>
          <label htmlFor={`re-max-${r.id}`} className="label">Ticket limit per member</label>
          <input id={`re-max-${r.id}`} type="number" min={0} className="field" value={max} onChange={(e) => setMax(e.target.value)} />
          <p className="mt-1 text-xs text-mist/80">0 means no limit. Tickets already bought are kept.</p>
        </div>
      </div>

      <div>
        <label htmlFor={`re-ends-${r.id}`} className="label">Draw time (your local time)</label>
        <input id={`re-ends-${r.id}`} type="datetime-local" className="field" value={ends} onChange={(e) => setEnds(e.target.value)} required />
        <div className="mt-2 flex flex-wrap gap-2">
          {[[24, "1 day from now"], [72, "3 days"], [168, "1 week"]].map(([h, label]) => (
            <button key={h} type="button" onClick={() => setEnds(localIn(h))} className="btn-bronze h-8 px-3 text-xs">{label}</button>
          ))}
          <button type="button" onClick={() => setEnds(toLocal(r.ends_at))} className="btn-bronze h-8 px-3 text-xs">Keep current</button>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="label">Prizes (1st place first)</legend>
        {prizes.map((p, i) => {
          const has = p.from ? readyCode(p.from) : "";
          const modes = has
            ? [["keep", `Keep code ····${has}`], ["type", "Type a new code"], ["stock", `From stock (${inStock(p.label)})`]]
            : [["type", "Type the code"], ["stock", `From stock (${inStock(p.label)})`], ["later", "Add it later"]];
          const mode = modes.some(([m]) => m === p.codeMode) ? p.codeMode : modes[0][0];
          return (
            <div key={p.id} className={cn("space-y-3 rounded-lg border p-3", i === 0 ? "border-[#6b5420] bg-[#1f1508]" : "border-bronze/50 bg-black/20")}>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 font-heading text-base font-bold text-white">{PLACE[i]}</span>
                <label htmlFor={`re-prize-${p.id}`} className="sr-only">{PLACE[i]} prize name</label>
                <input
                  id={`re-prize-${p.id}`}
                  className="field min-w-0 flex-1"
                  maxLength={80}
                  value={p.label}
                  onChange={(e) => setPrize(i, { label: e.target.value })}
                  placeholder={p.kind === "points" ? "150 points" : p.kind === "code" ? "500 GP Code" : "Rare mount"}
                  list={p.kind === "code" ? `re-stock-${r.id}` : undefined}
                />
                {prizes.length > 1 && (
                  <button type="button" onClick={() => setPrizes((list) => list.filter((_, j) => j !== i))} className="btn-bronze h-10 w-10 shrink-0" aria-label={`Remove the ${PLACE[i]} prize`}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`${PLACE[i]} prize type`}>
                {["item", "points", "code"].map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={p.kind === k} data-on={p.kind === k} onClick={() => setPrize(i, { kind: k, codeMode: k === "code" ? (has ? "keep" : "type") : p.codeMode })} className="btn-bronze h-10 px-1 text-[13px] sm:text-sm">
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {p.kind === "points" && (
                <p className={cn("text-[13px]", p.label.trim() && !pointsOk(p.label) ? "text-ember" : "text-[#6fd3a2]")}>
                  {p.label.trim() && !pointsOk(p.label) ? 'Write it as a number of points, like "150 points".' : "Paid to the winner automatically."}
                </p>
              )}
              {p.kind === "item" && (
                <p className="text-[13px] text-mist">
                  You hand this out in game yourself.{has ? ` The code ····${has} goes back to your stock.` : ""}
                </p>
              )}
              {p.kind === "code" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {modes.map(([m, t]) => (
                      <button key={m} type="button" data-on={mode === m} onClick={() => setPrize(i, { codeMode: m })} className="btn-bronze h-9 px-3 text-[13px]">{t}</button>
                    ))}
                  </div>
                  {mode === "keep" && <p className="flex items-center gap-1.5 text-[13px] text-[#6fd3a2]"><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> The code ending in {has} stays set aside for this prize.</p>}
                  {mode === "type" && <CodeInput value={p.code} onChange={(v) => setPrize(i, { code: v })} label="The code (only the winner will ever see it)" />}
                  {mode === "stock" && (
                    <p className={cn("text-[13px]", inStock(p.label) ? "text-[#6fd3a2]" : "text-ember")}>
                      {inStock(p.label)
                        ? `The oldest "${p.label.trim()}" code in stock is set aside and goes to the winner.`
                        : p.label.trim() ? `No "${p.label.trim()}" codes in stock. Type the prize name exactly as in stock, or type the code.` : "Type the prize name exactly as it is in stock."}
                    </p>
                  )}
                  {mode === "later" && <p className="text-[13px] text-[#e8c15a]">Add the code before the draw. If the draw comes first, the winner gets it as soon as you add it.</p>}
                  {has && mode !== "keep" && <p className="text-[13px] text-mist">The old code ····{has} is replaced.</p>}
                  <p className="text-[13px] text-mist">Sent privately to the winner only: on the site and by Discord DM.</p>
                </div>
              )}
            </div>
          );
        })}
        <datalist id={`re-stock-${r.id}`}>{stock.map((x) => <option key={x.label} value={x.label} />)}</datalist>
        {prizes.length < 10 && (
          <button type="button" onClick={() => setPrizes((list) => [...list, { id: nextId++, label: "", kind: "item", from: 0, codeMode: "type", code: "" }])} className="btn-bronze h-10 w-full border-dashed text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add a prize
          </button>
        )}
      </fieldset>

      {leaving.length > 0 && (
        <p className="rounded-md border border-gold/40 bg-gold/10 p-2.5 text-[13px] text-[#e8c15a]">
          {leaving.length === 1 ? `The code ····${leaving[0]} is` : `The codes ${leaving.map((x) => `····${x}`).join(", ")} are`} no longer a prize and will go back to your stock.
        </p>
      )}
      {sold && <p className="text-[13px] text-mist">{r.tickets_sold} ticket{r.tickets_sold === 1 ? " was" : "s were"} already bought. Members keep their tickets. Changes are posted in guild chat.</p>}
      {error && <p role="alert" className="text-sm text-ember">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn-seal h-11 px-5">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving</> : "Save changes"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="btn-bronze h-11 px-4 text-sm">Cancel</button>
      </div>
    </form>
  );
}