import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import Avatar from "@/components/Avatar";
import { Points } from "@/components/SealLogo";
import { errorText } from "@/lib/GuildContext";
import { ItemPicture, payText, STATUS } from "@/pages/Shop";
import { cn } from "@/lib/utils";

const fmt = (n) => Number(n || 0).toLocaleString();
const BLANK = { name: "", category: "", description: "", image_url: "", value_cp: "", stock: 0, active: true, require_note: false, sort: 0, gp_code: false, gp_worth: "", code_source: "stock", code_label: "", add_codes: "", bot: false, bot_days: "", bot_price: "" };

// Guild Leader only: settle orders, change the rates, and edit the catalog.
export default function ShopAdmin({ onChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("shopAction", { action: "adminOverview" });
      setData(res.data);
      setError("");
    } catch (e) {
      setError(errorText(e, "Couldn't load the shop manager."));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = async () => {
    await load();
    if (onChange) onChange();
  };

  if (error && !data) return <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>;
  if (!data) return <LanternSpinner label="Loading the manager" className="py-12" />;

  return (
    <div className="space-y-5">
      <Orders data={data} onChange={changed} />
      <Rates rates={data.rates} onChange={changed} />
      <Catalog data={data} onChange={changed} />
    </div>
  );
}

function Orders({ data, onChange }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [inputs, setInputs] = useState({});
  const set = (id, k, v) => setInputs((s) => ({ ...s, [id]: { ...(s[id] || {}), [k]: v } }));

  const settle = async (o, action) => {
    const inp = inputs[o.id] || {};
    setBusy(o.id + action);
    setError("");
    try {
      await base44.functions.invoke("shopAction", { action, orderId: o.id, code: inp.code || "", codes: o.gp_code ? inp.code || "" : undefined, adminNote: inp.note || "" });
      await onChange();
    } catch (e) {
      setError(errorText(e, "Couldn't update that order."));
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel title={`Orders waiting (${data.pending.length})`}>
      {error && <p role="alert" className="mb-3 text-sm text-ember">{error}</p>}
      {data.pending.length === 0 ? (
        <p className="py-2 text-center text-sm text-mist">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-bronze/25">
          {data.pending.map((o) => {
            const inp = inputs[o.id] || {};
            return (
              <li key={o.id} className="py-3 text-sm">
                <div className="flex items-start gap-3">
                  <Avatar url={o.member_avatar} name={o.member_name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gold">{o.member_name}{o.character_name && <span className="font-normal text-mist"> · character {o.character_name}</span>}</p>
                    {o.kind === "item" && o.gp_code ? (
                      <p className="text-mist">Type <b className="text-white">{fmt(o.qty)} code{o.qty > 1 ? "s" : ""} worth {fmt(o.gp_worth)} GP each</b> ({o.item_name}) · paid <Points value={o.total} iconSize={13} /> ({fmt(o.subtotal)} + {fmt(o.tax)} tax)</p>
                    ) : o.kind === "item" ? (
                      <p className="text-mist">Deliver <b className="text-white">{fmt(o.qty)} x {o.item_name}</b> · paid <Points value={o.total} iconSize={13} /> ({fmt(o.subtotal)} + {fmt(o.tax)} tax)</p>
                    ) : (
                      <p className="text-mist">
                        Wants <b className="text-white">{fmt(o.points)} points</b> · must pay you <b className="text-white">{payText(o.pay_cp, o.pay_currency, data.rates)}</b> in-game
                      </p>
                    )}
                    {o.note && <p className="text-mist/80">Note: {o.note}</p>}
                    <p className="text-xs text-mist/70">{new Date(o.created_date).toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {o.kind === "item" && o.gp_code ? (
                    <textarea
                      aria-label={`The ${o.qty > 1 ? `${o.qty} codes, one per line` : "code"} for the buyer`}
                      placeholder={o.qty > 1 ? `${o.qty} codes, one per line` : "The code for the buyer"}
                      value={inp.code || ""} onChange={(e) => set(o.id, "code", e.target.value)}
                      rows={Math.min(6, Math.max(1, o.qty))} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                      className="field min-h-[2.5rem] font-mono"
                    />
                  ) : o.kind === "item" && (
                    <input aria-label="Code for the buyer" placeholder="Code or note for the buyer (optional)" value={inp.code || ""} onChange={(e) => set(o.id, "code", e.target.value)} maxLength={200} className="field" />
                  )}
                  <input aria-label="Message to the member" placeholder="Message to the member (optional)" value={inp.note || ""} onChange={(e) => set(o.id, "note", e.target.value)} maxLength={300} className="field" />
                </div>
                <div className="mt-2 flex gap-2">
                  {o.kind === "item" && <button onClick={() => settle(o, "complete")} disabled={!!busy} className="btn-seal h-9 flex-1 text-sm">
                    {busy === o.id + "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : o.gp_code ? "Send the code" + (o.qty > 1 ? "s" : "") : "Delivered"}
                  </button>}
                  <button onClick={() => settle(o, "reject")} disabled={!!busy} className="btn-bronze h-9 flex-1 text-sm">
                    {busy === o.id + "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : o.kind === "item" ? "Reject and refund" : "Reject"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.recent.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-mist hover:text-gold">Recently settled ({data.recent.length})</summary>
          <ul className="mt-2 divide-y divide-bronze/25">
            {data.recent.map((o) => (
              <li key={o.id} className="py-2 text-mist">
                <span className={cn("mr-2 rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase", (STATUS[o.status] || STATUS.pending).cls)}>{o.status}</span>
                {o.member_name}: {o.kind === "item" ? `${fmt(o.qty)} x ${o.item_name} (${fmt(o.total)} points)` : `${fmt(o.points)} points for ${payText(o.pay_cp, o.pay_currency, data.rates)}`}
                {o.code_last4 && o.code_last4.length > 0 && <span className="ml-1 text-xs text-mist/80">· code{o.code_last4.length > 1 ? "s" : ""} ending {o.code_last4.join(", ")}{o.code_source === "stock" ? " (from stock)" : ""}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function Rates({ rates, onChange }) {
  const [form, setForm] = useState({ tax_pct: rates.tax_pct, price_multiplier: rates.price_multiplier, enabled: rates.enabled });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    try {
      await base44.functions.invoke("shopAction", { action: "saveRates", rates: { ...form, tax_pct: Number(form.tax_pct), price_multiplier: Number(form.price_multiplier) } });
      setMsg("Saved. Every shop price now uses the new rates.");
      await onChange();
    } catch (err) {
      setError(errorText(err, "Couldn't save the rates."));
    } finally {
      setBusy(false);
    }
  };

  const mult = Number(form.price_multiplier) || 0;
  const tax = Number(form.tax_pct) || 0;
  const ex = Math.ceil(100 * mult - 1e-9);
  return (
    <Panel title="Rates">
      <p className="text-sm text-mist">1 point = 1 CP = 0.5 GP = 1M silver. Change these any time; item prices follow automatically.</p>
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rt-mult" className="label">Shop price per 1 CP of value (points)</label>
          <input id="rt-mult" type="number" step="any" min="0" value={form.price_multiplier} onChange={(e) => set("price_multiplier", e.target.value)} className="field" required />
        </div>
        <div>
          <label htmlFor="rt-tax" className="label">Tax added on top (%)</label>
          <input id="rt-tax" type="number" step="any" min="0" max="100" value={form.tax_pct} onChange={(e) => set("tax_pct", e.target.value)} className="field" required />
        </div>
        <p className="text-xs text-mist sm:col-span-2">
          With these rates: an item worth 100 CP costs {fmt(ex)} + {fmt(Math.ceil((ex * tax) / 100 - 1e-9))} tax = {fmt(ex + Math.ceil((ex * tax) / 100 - 1e-9))} points.
        </p>
        <label className="flex items-center gap-2 text-sm text-mist sm:col-span-2">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--crimson))]" />
          Shop is open (untick to stop new purchases)
        </label>
        {msg && <p role="status" className="text-sm text-gold sm:col-span-2">{msg}</p>}
        {error && <p role="alert" className="text-sm text-ember sm:col-span-2">{error}</p>}
        <button type="submit" disabled={busy} className="btn-seal h-10 text-sm sm:col-span-2">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving</> : "Save rates"}
        </button>
      </form>
    </Panel>
  );
}

function Catalog({ data, onChange }) {
  const [editing, setEditing] = useState(null); // item being edited, or BLANK for a new one
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const set = (k, v) => setEditing((f) => ({ ...f, [k]: v }));
  const mult = data.rates.price_multiplier;
  const tax = data.rates.tax_pct;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("shopAction", { action: "saveItem", item: {
        ...editing, value_cp: Number(editing.value_cp), stock: Number(editing.stock), sort: Number(editing.sort) || 0,
        gp_worth: editing.gp_code && !editing.bot ? Number(editing.gp_worth) : 0,
        gp_code: editing.gp_code && !editing.bot,
        bot_days: editing.bot ? Number(editing.bot_days) || 0 : 0,
        ...(editing.bot ? { stock: 0 } : {})
      } });
      const d = res.data || {};
      setNotice(d.added || (d.skipped && d.skipped.length)
        ? `Saved. ${fmt(d.added)} code${d.added === 1 ? "" : "s"} added to stock${d.skipped && d.skipped.length ? `; ${d.skipped.length} skipped (already added before: ending ${d.skipped.join(", ")})` : ""}.`
        : "");
      setEditing(null);
      await onChange();
    } catch (err) {
      setError(errorText(err, "Couldn't save the item."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await base44.functions.invoke("shopAction", { action: "deleteItem", itemId: editing.id });
      setEditing(null);
      await onChange();
    } catch (err) {
      setError(errorText(err, "Couldn't delete the item."));
    } finally {
      setBusy(false);
    }
  };

  const bot = !!(editing && editing.bot);
  const gp = !!(editing && editing.gp_code) && !bot;
  const fromStock = gp && editing.code_source !== "manual";
  const value = gp ? (Number(editing.gp_worth) || 0) * 2 : editing ? Number(editing.value_cp) || 0 : 0;
  const price = editing ? Math.max(1, Math.ceil(value * mult - 1e-9)) : 0;
  const pasted = editing && editing.add_codes ? editing.add_codes.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).length : 0;
  const priceTax = Math.ceil((price * tax) / 100 - 1e-9);

  return (
    <Panel
      title="Catalog"
      action={!editing && (
        <button onClick={() => { setError(""); setNotice(""); setEditing({ ...BLANK, sort: (data.items.length + 1) * 10 }); }} className="btn-bronze h-7 px-2 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      )}
    >
      {editing ? (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <p className="font-heading font-bold text-gold sm:col-span-2">{editing.id ? `Edit ${editing.name}` : "New item"}</p>
          <div>
            <label htmlFor="it-name" className="label">Name</label>
            <input id="it-name" value={editing.name} onChange={(e) => set("name", e.target.value)} maxLength={60} className="field" required />
          </div>
          <div>
            <label htmlFor="it-cat" className="label">Category heading</label>
            <input id="it-cat" value={editing.category} onChange={(e) => set("category", e.target.value)} maxLength={40} className="field" placeholder="Materials, Gear, Currency" />
          </div>
          {!bot && (
            <label className="flex items-center gap-2 rounded-md border border-bronze/50 bg-black/30 px-3 py-2 text-sm text-white sm:col-span-2">
              <input type="checkbox" checked={gp} onChange={(e) => set("gp_code", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--crimson))]" />
              This is a GP code (the buyer sees the code on the site)
            </label>
          )}
          {!gp && (
            <label className="flex items-center gap-2 rounded-md border border-bronze/50 bg-black/30 px-3 py-2 text-sm text-white sm:col-span-2">
              <input type="checkbox" checked={bot} onChange={(e) => set("bot", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--crimson))]" />
              This is IntroBoys Assistant time (days are added to the buyer's license the moment they pay)
            </label>
          )}
          {bot ? (
            <>
              <div>
                <label htmlFor="it-botdays" className="label">Days each purchase adds</label>
                <input id="it-botdays" type="number" inputMode="numeric" min="1" max="3650" step="1" value={editing.bot_days} onChange={(e) => set("bot_days", e.target.value)} className="field" required />
              </div>
              <div>
                <label htmlFor="it-botprice" className="label">Price in points (before tax)</label>
                <input id="it-botprice" type="number" inputMode="numeric" min="1" step="1" value={editing.bot_price} onChange={(e) => { set("bot_price", e.target.value); set("value_cp", Number(e.target.value) / mult); }} className="field" required />
                <p className="mt-1 text-xs text-mist">With {fmt(tax)}% tax the buyer pays {fmt((Number(editing.bot_price) || 0) + Math.ceil(((Number(editing.bot_price) || 0) * tax) / 100 - 1e-9))} points. There is no stock: it never sells out.</p>
              </div>
            </>
          ) : gp ? (
            <>
              <div>
                <label htmlFor="it-worth" className="label">What one code is worth (GP)</label>
                <input id="it-worth" type="number" inputMode="numeric" min="1" step="1" value={editing.gp_worth} onChange={(e) => set("gp_worth", e.target.value)} className="field" required />
                <p className="mt-1 text-xs text-mist">Value {fmt(value)} CP (1 GP = 2 CP). Shop price: {fmt(price)} + {fmt(priceTax)} tax = {fmt(price + priceTax)} points.</p>
              </div>
              <fieldset className="text-sm text-mist">
                <legend className="label">Where the codes come from</legend>
                <label className="flex items-start gap-2 py-0.5">
                  <input type="radio" name="it-src" checked={fromStock} onChange={() => set("code_source", "stock")} className="mt-1 h-4 w-4 accent-[hsl(var(--crimson))]" />
                  <span><b className="text-white">From stock</b>: the buyer gets a code the moment they pay</span>
                </label>
                <label className="flex items-start gap-2 py-0.5">
                  <input type="radio" name="it-src" checked={!fromStock} onChange={() => set("code_source", "manual")} className="mt-1 h-4 w-4 accent-[hsl(var(--crimson))]" />
                  <span><b className="text-white">I type it</b>: the order waits until you enter the code</span>
                </label>
              </fieldset>
              {fromStock ? (
                <>
                  <div>
                    <label htmlFor="it-label" className="label">Stock name the codes are kept under</label>
                    <input id="it-label" value={editing.code_label} onChange={(e) => set("code_label", e.target.value)} maxLength={80} className="field" placeholder={`${fmt(Number(editing.gp_worth) || 0)} GP Code`} />
                    <p className="mt-1 text-xs text-mist">{editing.id && editing.gp_code && editing.code_source !== "manual" && editing.codes_waiting != null ? `${fmt(editing.codes_waiting)} code${editing.codes_waiting === 1 ? "" : "s"} waiting. ` : ""}Codes added on the Prizes page under this name count too.</p>
                  </div>
                  <div>
                    <label htmlFor="it-codes" className="label">Add codes to stock (one per line, optional)</label>
                    <textarea id="it-codes" rows={3} value={editing.add_codes} onChange={(e) => set("add_codes", e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className="field min-h-[4.5rem] font-mono text-sm" />
                    <p className="mt-1 text-xs text-mist">{pasted ? `${pasted} code${pasted === 1 ? "" : "s"} will be added. ` : ""}Saved encrypted; only the buyer ever sees one in full.</p>
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="it-stock" className="label">How many you can sell</label>
                  <input id="it-stock" type="number" inputMode="numeric" min="0" step="1" value={editing.own_stock ?? editing.stock} onChange={(e) => { set("stock", e.target.value); set("own_stock", e.target.value); }} className="field" required />
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label htmlFor="it-value" className="label">In-game value of one piece, in CP</label>
                <input id="it-value" type="number" step="any" min="0" value={editing.value_cp} onChange={(e) => set("value_cp", e.target.value)} className="field" required />
                <p className="mt-1 text-xs text-mist">1 GP = 2 CP. 1M silver = 1 CP. Shop price: {fmt(price)} + {fmt(priceTax)} tax = {fmt(price + priceTax)} points.</p>
              </div>
              <div>
                <label htmlFor="it-stock" className="label">Stock</label>
                <input id="it-stock" type="number" inputMode="numeric" min="0" step="1" value={editing.own_stock ?? editing.stock} onChange={(e) => { set("stock", e.target.value); set("own_stock", e.target.value); }} className="field" required />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="it-img" className="label">Picture (a site path like /shop/tin-3.png, or an https link)</label>
            <div className="flex items-center gap-2">
              <ItemPicture src={editing.image_url} name={editing.name} className="h-11 w-11" />
              <input id="it-img" value={editing.image_url} onChange={(e) => set("image_url", e.target.value.trim())} maxLength={500} className="field" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="it-desc" className="label">Short description (optional)</label>
            <input id="it-desc" value={editing.description} onChange={(e) => set("description", e.target.value)} maxLength={200} className="field" />
          </div>
          <div>
            <label htmlFor="it-sort" className="label">Order in the shop (lower shows first)</label>
            <input id="it-sort" type="number" value={editing.sort} onChange={(e) => set("sort", e.target.value)} className="field" />
          </div>
          <div className="flex flex-col justify-end gap-1.5 text-sm text-mist">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editing.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--crimson))]" />
              Visible to members
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editing.require_note} onChange={(e) => set("require_note", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--crimson))]" />
              Buyer must say which one they want
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-ember sm:col-span-2">{error}</p>}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn-seal h-10 flex-1 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save item"}</button>
            <button type="button" onClick={() => setEditing(null)} disabled={busy} className="btn-bronze h-10 flex-1 text-sm">Cancel</button>
            {editing.id && (
              <button type="button" onClick={remove} disabled={busy} className="btn-bronze h-10 px-3 text-sm text-ember" aria-label={`Delete ${editing.name}`}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
        {notice && <p role="status" className="mb-2 text-sm text-gold">{notice}</p>}
        <ul className="divide-y divide-bronze/25">
          {data.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2.5 text-sm">
              <ItemPicture src={it.image_url} name={it.name} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-bold", it.active ? "text-gold" : "text-mist")}>{it.name}{!it.active && " (hidden)"}</p>
                <p className="text-xs text-mist">
                  {it.bot_days > 0 ? `Assistant time · ${fmt(it.bot_days)} days each · ${fmt(it.total)} points with tax` : <>{it.gp_code ? `${fmt(it.gp_worth)} GP code · ${it.code_source === "manual" ? "you type it" : `from stock "${it.code_label}"`}` : `${fmt(it.value_cp)} CP value`} · {fmt(it.total)} points with tax · {fmt(it.stock)} {it.gp_code && it.code_source !== "manual" ? "codes waiting" : "in stock"}</>}
                </p>
              </div>
              <button onClick={() => { setError(""); setNotice(""); setEditing({ ...BLANK, ...it, bot: it.bot_days > 0, bot_days: it.bot_days > 0 ? it.bot_days : "", bot_price: it.bot_days > 0 ? Math.round(it.price) : "", gp_worth: it.gp_code ? it.gp_worth : "", code_source: it.code_source || "stock", stock: it.own_stock ?? it.stock, codes_waiting: it.gp_code && it.code_source !== "manual" ? it.stock : null, add_codes: "" }); }} className="btn-bronze h-8 px-2.5 text-xs" aria-label={`Edit ${it.name}`}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
    </Panel>
  );
}