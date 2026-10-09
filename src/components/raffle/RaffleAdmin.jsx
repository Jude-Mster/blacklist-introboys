import React, { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import CodeInput from "@/components/prizes/CodeInput";
import { errorText } from "@/lib/GuildContext";
import { PLACE, codeHint } from "@/lib/prizes";
import { cn } from "@/lib/utils";

const KIND_LABEL = { item: "In-game item", points: "Guild points", code: "Prize code" };
const pointsOk = (label) => /^\s*\+?\s*\d[\d,]*\s*(?:guild\s+)?(?:points?|pts?)\.?\s*$/i.test(label);
let nextId = 1;
const blankPrize = (kind = "item") => ({ id: nextId++, label: "", kind, codeMode: "type", code: "" });

// datetime-local value for a time `hours` from now, in the leader's own time zone.
function localIn(hours) {
  const d = new Date(Date.now() + hours * 3600000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Guild Leader only: start a raffle.
export default function RaffleAdmin({ onCreated, discordReady }) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState(100);
  const [max, setMax] = useState(0);
  const [ends, setEnds] = useState(localIn(24));
  const [prizes, setPrizes] = useState(() => [blankPrize("code"), blankPrize()]);
  const [stock, setStock] = useState([]);
  const [potToFirst, setPotToFirst] = useState(true);
  const [announce, setAnnounce] = useState(true);
  const [ping, setPing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // Codes in stock, by prize name, for "Take from stock".
  const loadStock = () => base44.functions.invoke("prizeAction", { action: "stockSummary" }).then((r) => setStock((r.data && r.data.stock) || [])).catch(() => {});
  useEffect(() => { loadStock(); }, []);
  const inStock = (label) => {
    const hit = stock.find((x) => x.label.toLowerCase() === String(label).trim().replace(/\s+/g, " ").toLowerCase());
    return hit ? hit.count : 0;
  };
  const setPrize = (i, change) => setPrizes((list) => list.map((p, j) => (j === i ? { ...p, ...change } : p)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      const list = prizes.filter((p) => p.label.trim());
      for (const [i, p] of list.entries()) {
        if (p.kind === "points" && !pointsOk(p.label)) throw new Error(`Write the ${PLACE[i]} prize as a number of points, like "150 points".`);
        if (p.kind === "code" && p.codeMode === "type" && p.code.trim() && !codeHint(p.code).ok) throw new Error(`Check the code for the ${PLACE[i]} prize.`);
        if (p.kind === "code" && p.codeMode === "stock" && inStock(p.label) < list.filter((q, j) => j <= i && q.kind === "code" && q.codeMode === "stock" && q.label.trim().toLowerCase() === p.label.trim().toLowerCase()).length) {
          throw new Error(`Not enough "${p.label.trim()}" codes in stock for the ${PLACE[i]} prize.`);
        }
      }
      const res = await base44.functions.invoke("raffleAction", {
        action: "create",
        title,
        ticket_price: Number(price),
        max_tickets_per_member: Number(max) || 0,
        ends_at: new Date(ends).toISOString(),
        prizes: list.map((p) => p.label.trim()),
        prize_kinds: list.map((p) => p.kind),
        prize_codes: list.map((p) => (p.kind !== "code" ? null : p.codeMode === "stock" ? { from_stock: true } : p.codeMode === "type" && p.code.trim() ? { code: p.code } : null)),
        pot_to_first: potToFirst,
        announce: announce && discordReady !== false,
        ping
      });
      const posted = res.data && res.data.announced;
      setDone(`"${title}" is open. It was announced in guild chat${posted ? " and on Discord" : ""}.${announce && discordReady !== false && !posted ? " The Discord post didn't go through; use Post to Discord on the raffle." : ""}`);
      setTitle("");
      setPrizes([blankPrize()]);
      loadStock();
      onCreated && onCreated();
    } catch (err) {
      setError(err && err.message && !err.response ? err.message : errorText(err, "Couldn't start the raffle."));
    } finally {
      setBusy(false);
    }
  };

  const prizeCount = prizes.filter((p) => p.label.trim()).length;

  return (
    <Panel title="Start a raffle">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="rf-title" className="label">Raffle name</label>
          <input id="rf-title" className="field" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend guild raffle" required />
        </div>
        <div>
          <label htmlFor="rf-price" className="label">Ticket price (points)</label>
          <input id="rf-price" type="number" min={1} className="field" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="rf-max" className="label">Ticket limit per member</label>
          <input id="rf-max" type="number" min={0} className="field" value={max} onChange={(e) => setMax(e.target.value)} />
          <p className="mt-1 text-xs text-mist/80">0 means no limit.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rf-ends" className="label">Draw time (your local time)</label>
          <input id="rf-ends" type="datetime-local" className="field" value={ends} onChange={(e) => setEnds(e.target.value)} required />
          <div className="mt-2 flex flex-wrap gap-2">
            {[[1, "1 hour"], [24, "1 day"], [72, "3 days"], [168, "1 week"]].map(([h, label]) => (
              <button key={h} type="button" onClick={() => setEnds(localIn(h))} className="btn-bronze h-8 px-3 text-xs">{label}</button>
            ))}
          </div>
        </div>
        <fieldset className="space-y-3 sm:col-span-2">
          <legend className="label">Prizes (1st place first)</legend>
          {prizes.map((p, i) => (
            <div key={p.id} className={cn("space-y-3 rounded-lg border p-3", i === 0 ? "border-[#6b5420] bg-[#1f1508]" : "border-bronze/50 bg-black/20")}>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 font-heading text-base font-bold text-white">{PLACE[i]}</span>
                <label htmlFor={`rf-prize-${i}`} className="sr-only">{PLACE[i]} prize name</label>
                <input
                  id={`rf-prize-${i}`}
                  className="field min-w-0 flex-1"
                  maxLength={80}
                  value={p.label}
                  onChange={(e) => setPrize(i, { label: e.target.value })}
                  placeholder={p.kind === "points" ? "150 points" : p.kind === "code" ? "500 GP Code" : "Rare mount"}
                  list={p.kind === "code" ? "rf-stock-names" : undefined}
                />
                {prizes.length > 1 && (
                  <button type="button" onClick={() => setPrizes((list) => list.filter((_, j) => j !== i))} className="btn-bronze h-10 w-10 shrink-0" aria-label={`Remove the ${PLACE[i]} prize`}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`${PLACE[i]} prize type`}>
                {["item", "points", "code"].map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={p.kind === k} data-on={p.kind === k} onClick={() => setPrize(i, { kind: k })} className="btn-bronze h-10 px-1 text-[13px] sm:text-sm">
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {p.kind === "points" && (
                <p className={cn("text-[13px]", p.label.trim() && !pointsOk(p.label) ? "text-ember" : "text-[#6fd3a2]")}>
                  {p.label.trim() && !pointsOk(p.label) ? 'Write it as a number of points, like "150 points".' : "Paid to the winner automatically."}
                </p>
              )}
              {p.kind === "item" && <p className="text-[13px] text-mist">You hand this out in game yourself.</p>}
              {p.kind === "code" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[["type", "Type the code"], ["stock", `From stock (${inStock(p.label)})`], ["later", "Add it later"]].map(([m, t]) => (
                      <button key={m} type="button" data-on={p.codeMode === m} onClick={() => setPrize(i, { codeMode: m })} className="btn-bronze h-9 px-3 text-[13px]">{t}</button>
                    ))}
                  </div>
                  {p.codeMode === "type" && <CodeInput value={p.code} onChange={(v) => setPrize(i, { code: v })} label="The code (only the winner will ever see it)" />}
                  {p.codeMode === "stock" && (
                    <p className={cn("text-[13px]", inStock(p.label) ? "text-[#6fd3a2]" : "text-ember")}>
                      {inStock(p.label)
                        ? `The oldest "${p.label.trim()}" code in stock is set aside now and goes to the winner.`
                        : p.label.trim() ? `No "${p.label.trim()}" codes in stock. Add some in the admin hall, Prize codes, or type the prize name exactly as in stock.` : "Type the prize name exactly as it is in stock."}
                    </p>
                  )}
                  {p.codeMode === "later" && <p className="text-[13px] text-[#e8c15a]">Add the code on the raffle before the draw. If the draw comes first, the winner is told it's on the way and gets it as soon as you add it.</p>}
                  <p className="text-[13px] text-mist">Sent privately to the winner only: on the site and by Discord DM.</p>
                </div>
              )}
            </div>
          ))}
          <datalist id="rf-stock-names">{stock.map((x) => <option key={x.label} value={x.label} />)}</datalist>
          {prizes.length < 10 && (
            <button type="button" onClick={() => setPrizes((list) => [...list, blankPrize()])} className="btn-bronze h-10 w-full border-dashed text-sm">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add a prize
            </button>
          )}
          <p className="text-xs text-mist/80">
            {prizeCount ? `${prizeCount} prize${prizeCount > 1 ? "s" : ""}, so ${prizeCount} different winner${prizeCount > 1 ? "s" : ""}.` : "Each prize is drawn for a different member."} Up to 10.
          </p>
        </fieldset>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={potToFirst} onChange={(e) => setPotToFirst(e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--gold))]" />
          <span>Give all the points spent on tickets to the 1st place winner. If this is off, ticket points leave the game.</span>
        </label>
        <div className="space-y-2 rounded-md border border-bronze/40 bg-black/20 p-3 sm:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={announce && discordReady !== false} disabled={discordReady === false} onChange={(e) => setAnnounce(e.target.checked)} className="mt-1 h-4 w-4 accent-[#5865f2]" />
            <span>Post it to the Discord announcements channel when it starts</span>
          </label>
          {announce && discordReady !== false && (
            <label className="flex items-start gap-2 pl-6 text-sm">
              <input type="checkbox" checked={ping} onChange={(e) => setPing(e.target.checked)} className="mt-1 h-4 w-4 accent-[#5865f2]" />
              <span>Ping @everyone</span>
            </label>
          )}
          {discordReady === false && <p className="text-xs text-mist/80">Not connected yet: add the DISCORD_ANNOUNCE_WEBHOOK_URL secret (a webhook for your announcements channel).</p>}
        </div>
        {error && <p role="alert" className="text-sm text-ember sm:col-span-2">{error}</p>}
        {done && <p role="status" className="text-sm text-jade sm:col-span-2">{done}</p>}
        <button type="submit" disabled={busy} className="btn-seal h-11 sm:col-span-2">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting</> : "Start the raffle"}
        </button>
      </form>
    </Panel>
  );
}