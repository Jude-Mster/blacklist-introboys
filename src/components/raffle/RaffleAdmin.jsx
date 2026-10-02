import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";

// datetime-local value for a time `hours` from now, in the leader's own time zone.
function localIn(hours) {
  const d = new Date(Date.now() + hours * 3600000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Guild Leader only: start a raffle.
export default function RaffleAdmin({ onCreated }) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState(100);
  const [max, setMax] = useState(0);
  const [ends, setEnds] = useState(localIn(24));
  const [prizes, setPrizes] = useState("");
  const [potToFirst, setPotToFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      await base44.functions.invoke("raffleAction", {
        action: "create",
        title,
        ticket_price: Number(price),
        max_tickets_per_member: Number(max) || 0,
        ends_at: new Date(ends).toISOString(),
        prizes: prizes.split("\n"),
        pot_to_first: potToFirst
      });
      setDone(`"${title}" is open. It was announced in guild chat.`);
      setTitle("");
      setPrizes("");
      onCreated && onCreated();
    } catch (err) {
      setError(errorText(err, "Couldn't start the raffle."));
    } finally {
      setBusy(false);
    }
  };

  const prizeCount = prizes.split("\n").filter((x) => x.trim()).length;

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
        <div className="sm:col-span-2">
          <label htmlFor="rf-prizes" className="label">Prizes, one per line (1st place first)</label>
          <textarea
            id="rf-prizes"
            className="field min-h-[6.5rem] py-2"
            value={prizes}
            onChange={(e) => setPrizes(e.target.value)}
            placeholder={"Legendary weapon box\n5,000 guild points\nRare mount"}
            required
          />
          <p className="mt-1 text-xs text-mist/80">
            {prizeCount ? `${prizeCount} prize${prizeCount > 1 ? "s" : ""}, so ${prizeCount} different winner${prizeCount > 1 ? "s" : ""}.` : "Each line is drawn for a different member."} Up to 10. You hand out in-game prizes yourself.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={potToFirst} onChange={(e) => setPotToFirst(e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--gold))]" />
          <span>Give all the points spent on tickets to the 1st place winner. If this is off, ticket points leave the game.</span>
        </label>
        {error && <p role="alert" className="text-sm text-ember sm:col-span-2">{error}</p>}
        {done && <p role="status" className="text-sm text-jade sm:col-span-2">{done}</p>}
        <button type="submit" disabled={busy} className="btn-seal h-11 sm:col-span-2">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting</> : "Start the raffle"}
        </button>
      </form>
    </Panel>
  );
}