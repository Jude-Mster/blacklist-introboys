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
const BLANK = { name: "", category: "", description: "", image_url: "", value_cp: "", stock: 0, active: true, require_note: false, sort: 0 };

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
      await base44.functions.invoke("shopAction", { action, orderId: o.id, code: inp.code || "", adminNote: inp.note || "" });
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
                    <p className="font-bold text-gold">{o.member_name} <span className="font-normal text-mist">· character {o.character_name}</span></p>
                    {o.kind === "item" ? (
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
                  {o.kind === "item" && (
                    <input aria-label="Code for the buyer" placeholder="Code for the buyer (GP codes only)" value={inp.code || ""} onChange={(e) => set(o.id, "code", e.target.value)} maxLength={200} className="field" />
                  )}
                  <input aria-label="Message to the member" placeholder="Message to the member (optional)" value={inp.note || ""} onChange={(e) => set(o.id, "note", e.target.value)} maxLength={300} className="field" />
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => settle(o, "complete")} disabled={!!busy} className="btn-seal h-9 flex-1 text-sm">
                    {busy === o.id + "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : o.kind === "item" ? "Delivered" : "Payment received, add points"}
                  </button>
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
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function Rates({ rates, onChange }) {
  const [form, setForm] = useState({ tax_pct: rates.tax_pct, price_multiplier: rates.price_multiplier, buy_rate: rates.buy_rate, enabled: rates.enabled });
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
      await base44.functions.invoke("shopAction", { action: "saveRates", rates: { ...form, tax_pct: Number(form.tax_pct), price_multiplier: Number(form.price_multiplier), buy_rate: Number(form.buy_rate) } });
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
  const buy = Number(form.buy_rate) || 1;
  const ex = Math.ceil(100 * mult - 1e-9);
  return (
    <Panel title="Rates">
      <p className="text-sm text-mist">1 point = 1 CP = 0.5 GP = 1M silver. Change these any time; item prices follow automatically.</p>
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="rt-mult" className="label">Shop price per 1 CP of value (points)</label>
          <input id="rt-mult" type="number" step="any" min="0" value={form.price_multiplier} onChange={(e) => set("price_multiplier", e.target.value)} className="field" required />
        </div>
        <div>
          <label htmlFor="rt-tax" className="label">Tax added on top (%)</label>
          <input id="rt-tax" type="number" step="any" min="0" max="100" value={form.tax_pct} onChange={(e) => set("tax_pct", e.target.value)} className="field" required />
        </div>
        <div>
          <label htmlFor="rt-buy" className="label">Buying points: points per 1 CP paid</label>
          <input id="rt-buy" type="number" step="any" min="0" value={form.buy_rate} onChange={(e) => set("buy_rate", e.target.value)} className="field" required />
        </div>
        <p className="text-xs text-mist sm:col-span-3">
          With these rates: an item worth 100 CP costs {fmt(ex)} + {fmt(Math.ceil((ex * tax) / 100 - 1e-9))} tax = {fmt(ex + Math.ceil((ex * tax) / 100 - 1e-9))} points. Buying 100 points costs {Number(((100 / buy) * (100 + tax) / 100).toFixed(2)).toLocaleString()} CP in-game.
        </p>
        <label className="flex items-center gap-2 text-sm text-mist sm:col-span-3">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--crimson))]" />
          Shop is open (untick to stop new purchases)
        </label>
        {msg && <p role="status" className="text-sm text-gold sm:col-span-3">{msg}</p>}
        {error && <p role="alert" className="text-sm text-ember sm:col-span-3">{error}</p>}
        <button type="submit" disabled={busy} className="btn-seal h-10 text-sm sm:col-span-3">
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
  const set = (k, v) => setEditing((f) => ({ ...f, [k]: v }));
  const mult = data.rates.price_multiplier;
  const tax = data.rates.tax_pct;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await base44.functions.invoke("shopAction", { action: "saveItem", item: { ...editing, value_cp: Number(editing.value_cp), stock: Number(editing.stock), sort: Number(editing.sort) || 0 } });
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

  const price = editing ? Math.max(1, Math.ceil((Number(editing.value_cp) || 0) * mult - 1e-9)) : 0;
  const priceTax = Math.ceil((price * tax) / 100 - 1e-9);

  return (
    <Panel
      title="Catalog"
      action={!editing && (
        <button onClick={() => { setError(""); setEditing({ ...BLANK, sort: (data.items.length + 1) * 10 }); }} className="btn-bronze h-7 px-2 text-xs">
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
          <div>
            <label htmlFor="it-value" className="label">In-game value of one piece, in CP</label>
            <input id="it-value" type="number" step="any" min="0" value={editing.value_cp} onChange={(e) => set("value_cp", e.target.value)} className="field" required />
            <p className="mt-1 text-xs text-mist">1 GP = 2 CP. 1M silver = 1 CP. Shop price: {fmt(price)} + {fmt(priceTax)} tax = {fmt(price + priceTax)} points.</p>
          </div>
          <div>
            <label htmlFor="it-stock" className="label">Stock</label>
            <input id="it-stock" type="number" inputMode="numeric" min="0" value={editing.stock} onChange={(e) => set("stock", e.target.value)} className="field" required />
          </div>
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
        <ul className="divide-y divide-bronze/25">
          {data.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2.5 text-sm">
              <ItemPicture src={it.image_url} name={it.name} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-bold", it.active ? "text-gold" : "text-mist")}>{it.name}{!it.active && " (hidden)"}</p>
                <p className="text-xs text-mist">{fmt(it.value_cp)} CP value · {fmt(it.total)} points with tax · {fmt(it.stock)} in stock</p>
              </div>
              <button onClick={() => { setError(""); setEditing({ ...BLANK, ...it }); }} className="btn-bronze h-8 px-2.5 text-xs" aria-label={`Edit ${it.name}`}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}