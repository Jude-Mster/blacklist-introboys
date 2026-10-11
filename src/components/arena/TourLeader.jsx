import React, { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import CodeInput from "@/components/prizes/CodeInput";
import { Points } from "@/components/SealLogo";
import { errorText } from "@/lib/GuildContext";
import { normalizeCode, PLACE } from "@/lib/prizes";
import { UPGRADES, DEFAULT_VALUES, normValues } from "@/lib/arenaEngine";
import { cn } from "@/lib/utils";
import { fmt } from "./arenaUi";

// The Guild Leader's tournament controls: open one (name, start time, prizes, what each upgrade gives),
// change it before it starts, start it now, cancel it, post it to Discord; and the Arena bank.
const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const blankPrize = (kind = "points") => ({ kind, points: "", label: "", from_bank: false, code: "", from_stock: false });

export default function TourLeader({ data, onChanged }) {
  const t = data.tournament;
  const editing = t && t.status === "signup";
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [refund, setRefund] = useState(true);
  const [keepRepeating, setKeepRepeating] = useState(false);

  // the form starts from the open tournament (or from scratch)
  useEffect(() => {
    if (form) return;
    if (editing) {
      setForm({
        title: t.title, starts_at: toLocal(t.starts_at), repeat: t.repeat || "none",
        prizes: t.prizes.map((p) => ({ kind: p.kind, points: p.points ? String(p.points) : "", label: p.kind === "points" ? "" : p.label, from_bank: !!p.from_bank, code: "", from_stock: false })),
        values: normValues(t.values)
      });
    } else if (!t) setForm({ title: "", starts_at: "", repeat: "none", prizes: [blankPrize(), blankPrize(), blankPrize()], values: normValues(DEFAULT_VALUES) });
  }, [t, editing, form]);
  // a different tournament (or one that moved on): start the form again
  const keyRef = React.useRef(`${t ? t.id : ""}:${t ? t.status : ""}`);
  useEffect(() => {
    const k = `${t ? t.id : ""}:${t ? t.status : ""}`;
    if (keyRef.current !== k) { keyRef.current = k; setForm(null); setConfirmCancel(false); }
  }, [t]);

  const call = async (what, payload, done) => {
    setBusy(what); setError(""); setMsg("");
    try {
      await base44.functions.invoke("tournamentAction", payload);
      setMsg(done);
      setForm(null);
      onChanged();
    } catch (e) { setError(errorText(e, "That didn't work. Try again.")); }
    finally { setBusy(""); }
  };

  const bank = data.bank || { balance: 0, total_in: 0, total_out: 0, log: [] };
  const bankPanel = (
    <Panel title="Arena bank">
      <p className="flex items-baseline justify-between gap-2"><span className="text-mist">Held</span><Points value={bank.balance} className="font-heading text-xl font-bold text-gold" iconSize={16} /></p>
      <p className="mt-1 text-xs text-mist">Every point paid for tournament entries, weapon tries, skills, pets and mounts goes here and is held for later. Prizes marked "from the bank" are paid out of it; anything the bank can't cover is added by the site.</p>
      <p className="mt-2 flex justify-between text-sm"><span className="text-mist">In, all time</span><span className="tabular-nums">{fmt(bank.total_in)}</span></p>
      <p className="flex justify-between text-sm"><span className="text-mist">Out, all time</span><span className="tabular-nums">{fmt(bank.total_out)}</span></p>
      {bank.log && bank.log.length > 0 && (
        <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto border-t border-bronze/25 pt-2 text-xs">
          {bank.log.map((l, i) => (
            <li key={i} className="flex gap-2"><span className={cn("w-16 shrink-0 text-right tabular-nums", l.amount > 0 ? "text-jade" : l.amount < 0 ? "text-ember" : "text-mist")}>{l.amount ? `${l.amount > 0 ? "+" : ""}${fmt(l.amount)}` : "·"}</span><span className="min-w-0 flex-1 text-mist">{l.reason}</span></li>
          ))}
        </ul>
      )}
    </Panel>
  );

  if (t && t.status !== "signup") {
    return <div className="space-y-4">{bankPanel}<Panel title="Guild Leader"><p className="text-sm text-mist">{t.status === "running" ? "The tournament is being fought. Every match plays live; the prizes are paid after the final." : "Paying the prizes."}</p></Panel></div>;
  }
  if (!form) return bankPanel;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPrize = (i, k, v) => setForm((f) => ({ ...f, prizes: f.prizes.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  const setUp = (id, v) => setForm((f) => ({ ...f, values: { ...f.values, ups: { ...f.values.ups, [id]: v } } }));
  const setW = (k, v) => setForm((f) => ({ ...f, values: { ...f.values, weapon: { ...f.values.weapon, [k]: v } } }));
  const slot = (i) => (data.code_slots || [])[i];

  const payload = () => ({
    title: form.title,
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : "",
    repeat: form.repeat || "none",
    prizes: form.prizes.map((p) => ({
      kind: p.kind, points: p.kind === "points" ? Number(p.points) : 0, label: p.label, from_bank: p.kind === "points" && p.from_bank,
      code: p.kind === "code" ? (p.from_stock ? { from_stock: true } : p.code.trim() ? { code: normalizeCode(p.code) } : null) : null
    })),
    values: {
      ups: Object.fromEntries(UPGRADES.map((u) => [u.id, Number(form.values.ups[u.id])])),
      weapon: { atk: Number(form.values.weapon.atk), crit: Number(form.values.weapon.crit), chance: Number(form.values.weapon.chance) }
    }
  });
  const submit = (e) => {
    e.preventDefault();
    if (editing) call("save", { action: "edit", ...payload() }, "Saved.");
    else call("create", { action: "create", ...payload() }, "The tournament is open for sign-up.");
  };

  return (
    <div className="space-y-4">
      <Panel title={editing ? "Guild Leader: this tournament" : "Guild Leader: open a tournament"}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="tour-title">Name</label>
            <input id="tour-title" className="field h-11 w-full" maxLength={60} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Blacklist Cup" />
          </div>
          <div>
            <label className="label" htmlFor="tour-start">Start time (your time)</label>
            <input id="tour-start" type="datetime-local" className="field h-11 w-full" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
            <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Quick timer">
              {[[15, "15 min"], [30, "30 min"], [60, "1 hour"], [120, "2 hours"], [1440, "Tomorrow, same time"]].map(([m, label]) => (
                <button key={m} type="button" onClick={() => set("starts_at", toLocal(new Date(Date.now() + m * 60000).toISOString()))} className="btn-bronze h-8 px-2.5 text-xs">{m === 1440 ? label : `Start in ${label}`}</button>
              ))}
              {form.starts_at && <button type="button" onClick={() => set("starts_at", "")} className="btn-bronze h-8 px-2.5 text-xs">No start time</button>}
            </div>
            <p className="mt-1 text-xs text-mist">It starts by itself at this time, and guild chat and Discord get a "starts in 10 minutes" reminder. Leave it empty to start it only with Start now. With 1 sign-up it is cancelled and refunded; with 2 it is a single 1v1.</p>
          </div>
          <div>
            <label className="label" htmlFor="tour-repeat">Schedule</label>
            <select id="tour-repeat" className="field h-11 w-full" value={form.repeat || "none"} onChange={(e) => set("repeat", e.target.value)}>
              <option value="none">Just this once</option>
              <option value="daily">Every day at this time</option>
              <option value="weekly">Every week, same day and time</option>
            </select>
            <p className="mt-1 text-xs text-mist">A repeating tournament opens the next one by itself when it ends (also when it's cancelled for too few sign-ups), with the same name, prizes and upgrade values. Prize codes taken from stock take a new code from stock; a typed code can only be used once, so add a new one for the next tournament. Needs a start time.</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-heading font-bold text-gold">Prizes</legend>
            {form.prizes.map((p, i) => (
              <div key={i} className="rounded border border-bronze/40 bg-black/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-10 font-heading font-bold text-gold">{PLACE[i]}</span>
                  <select className="field h-10" value={p.kind} onChange={(e) => setPrize(i, "kind", e.target.value)} aria-label={`${PLACE[i]} prize kind`}>
                    <option value="points">Points</option>
                    <option value="code">Prize code (GP code)</option>
                    <option value="item">Item (handed out in game)</option>
                  </select>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, prizes: f.prizes.filter((_, j) => j !== i) }))} className="ml-auto rounded p-2 text-mist hover:text-ember" aria-label={`Remove the ${PLACE[i]} prize`}><Trash2 className="h-4 w-4" /></button>
                </div>
                {p.kind === "points" && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input type="number" min={1} className="field h-10 w-40" value={p.points} onChange={(e) => setPrize(i, "points", e.target.value.replace(/[^\d]/g, ""))} placeholder="Points" aria-label={`${PLACE[i]} prize points`} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.from_bank} onChange={(e) => setPrize(i, "from_bank", e.target.checked)} /> Pay from the Arena bank</label>
                  </div>
                )}
                {p.kind !== "points" && (
                  <input className="field mt-2 h-10 w-full" maxLength={80} value={p.label} onChange={(e) => setPrize(i, "label", e.target.value)} placeholder={p.kind === "code" ? "Prize name, e.g. 1,000 GP code" : "Item name"} aria-label={`${PLACE[i]} prize name`} />
                )}
                {p.kind === "code" && (
                  <div className="mt-2 space-y-2">
                    {slot(i) && slot(i).last4 && !p.code && !p.from_stock && <p className="text-xs text-jade">A code ending in {slot(i).last4} is set aside for this place.</p>}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.from_stock} onChange={(e) => setPrize(i, "from_stock", e.target.checked)} /> Take a code with this name from the stock</label>
                    {!p.from_stock && <CodeInput value={p.code} onChange={(v) => setPrize(i, "code", v)} label={slot(i) && slot(i).last4 ? "Replace the code (optional)" : "The code"} />}
                  </div>
                )}
              </div>
            ))}
            {form.prizes.length < 4 && <button type="button" onClick={() => setForm((f) => ({ ...f, prizes: [...f.prizes, blankPrize()] }))} className="btn-bronze h-9 px-3 text-sm"><Plus className="h-4 w-4" /> Add a prize</button>}
            <p className="text-xs text-mist">Points prizes are created by the site unless you tick "Pay from the Arena bank". 1st and 2nd come from the final, 3rd from the match for third place, 4th is its loser.</p>
          </fieldset>

          <details className="rounded border border-bronze/40 bg-black/30 p-3">
            <summary className="cursor-pointer font-heading font-bold text-gold">What each upgrade gives</summary>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {UPGRADES.map((u) => (
                <label key={u.id} className="text-xs text-mist">{u.name}{u.unit ? ` (${u.unit})` : ""}
                  <input type="number" min={0} step="any" className="field mt-1 h-9 w-full" value={form.values.ups[u.id]} onChange={(e) => setUp(u.id, e.target.value)} />
                </label>
              ))}
              <label className="text-xs text-mist">Weapon ATK per level (0.10 = 10%)<input type="number" min={0} max={1} step="0.01" className="field mt-1 h-9 w-full" value={form.values.weapon.atk} onChange={(e) => setW("atk", e.target.value)} /></label>
              <label className="text-xs text-mist">Weapon Crit rate per level (%)<input type="number" min={0} max={20} step="any" className="field mt-1 h-9 w-full" value={form.values.weapon.crit} onChange={(e) => setW("crit", e.target.value)} /></label>
              <label className="text-xs text-mist">Weapon success rate (0.30 = 30%)<input type="number" min={0.01} max={1} step="0.01" className="field mt-1 h-9 w-full" value={form.values.weapon.chance} onChange={(e) => setW("chance", e.target.value)} /></label>
            </div>
            <button type="button" onClick={() => set("values", normValues(DEFAULT_VALUES))} className="btn-bronze mt-3 h-9 px-3 text-sm">Back to the defaults</button>
            <p className="mt-2 text-xs text-mist">Changes apply to every fighter at once, including upgrades already bought.</p>
          </details>

          {error && <p role="alert" className="text-sm text-ember">{error}</p>}
          {msg && !error && <p className="text-sm text-jade">{msg}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!!busy} className="btn-seal h-11 px-5">{busy === "create" || busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save changes" : "Open sign-up"}</button>
            {editing && <button type="button" disabled={!!busy} onClick={() => call("start", { action: "start" }, "Started.")} className="btn-seal h-11 px-5">{busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start now"}</button>}
            {editing && data.discord_announce && <button type="button" disabled={!!busy} onClick={() => call("post", { action: "announce" }, "Posted to Discord.")} className="btn-bronze h-11 px-4 text-sm">Post to Discord</button>}
            {editing && !confirmCancel && <button type="button" disabled={!!busy} onClick={() => setConfirmCancel(true)} className="btn-bronze h-11 px-4 text-sm text-ember">Cancel tournament</button>}
          </div>
          {editing && confirmCancel && (
            <div className="rounded border border-ember/60 bg-[#2a0a0c] p-3 text-sm">
              <p>Cancel "{t.title}"? Every fighter and character is removed.</p>
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Refund what members paid ({fmt(t.bank_in)} points, out of the bank)</label>
              {t.repeat && t.repeat !== "none" && <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={keepRepeating} onChange={(e) => setKeepRepeating(e.target.checked)} /> Still open the next one on schedule</label>}
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => call("cancel", { action: "cancel", refund, keep_repeating: keepRepeating }, "Cancelled.")} className="btn-seal h-10 px-4 text-sm">{busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, cancel it"}</button>
                <button type="button" onClick={() => setConfirmCancel(false)} className="btn-bronze h-10 px-4 text-sm">Keep it</button>
              </div>
            </div>
          )}
        </form>
      </Panel>
      {bankPanel}
    </div>
  );
}