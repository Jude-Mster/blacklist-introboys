import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, PackageOpen } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { Points } from "@/components/SealLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuild, errorText } from "@/lib/GuildContext";
import ShopAdmin from "@/components/shop/ShopAdmin";
import { cn } from "@/lib/utils";

const CHAR_KEY = "bi.shop.character";
const fmt = (n) => Number(n || 0).toLocaleString();
const trim = (n) => Number(Number(n || 0).toFixed(2)).toLocaleString();

// What a pay-in-game amount (stored in CP) looks like in each currency.
export function payText(cp, currency, rates) {
  const perGp = (rates && rates.cp_per_gp) || 2;
  const silver = (rates && rates.silver_m_per_cp) || 1;
  if (currency === "gp") return `${trim(cp / perGp)} GP`;
  if (currency === "silver") return `${trim(cp * silver)}M silver`;
  return `${trim(cp)} CP`;
}

export const STATUS = {
  pending: { label: "Waiting for the Guild Leader", cls: "border-bronze text-mist" },
  completed: { label: "Completed", cls: "border-white/70 text-white" },
  rejected: { label: "Rejected", cls: "border-ember/60 text-ember" },
  cancelled: { label: "Cancelled", cls: "border-bronze/60 text-mist/70" }
};

export function ItemPicture({ src, name, className }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded border border-bronze/70 bg-black", className)}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-contain" />
      ) : (
        <PackageOpen className="h-1/2 w-1/2 text-mist/60" aria-label={name} />
      )}
    </div>
  );
}

export default function Shop() {
  const { account, loading, setBalance } = useGuild();
  const linked = !!(account && account.linked);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("shop");
  const [buying, setBuying] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("shopAction", { action: "catalog" });
      setData(res.data);
      if (res.data && typeof res.data.balance === "number") setBalance(res.data.balance);
      setError("");
    } catch (e) {
      setError(errorText(e, "Couldn't load the shop."));
    }
  }, [setBalance]);

  useEffect(() => {
    if (linked) load();
  }, [linked, load]);

  const groups = useMemo(() => {
    const out = [];
    for (const it of (data && data.items) || []) {
      const name = it.category || "Items";
      let g = out.find((x) => x.name === name);
      if (!g) { g = { name, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [data]);

  if (loading) return <LanternSpinner label="Opening the shop" className="py-24" />;
  if (!linked) return <Navigate to="/link-discord" replace />;

  const leader = account.member.role === "leader";
  const rates = data && data.rates;
  const orders = (data && data.orders) || [];
  const waiting = orders.filter((o) => o.status === "pending").length;
  const tabs = [
    { id: "shop", label: "Shop" },
    { id: "orders", label: waiting ? `My orders (${waiting})` : "My orders" },
    ...(leader ? [{ id: "manage", label: "Manage" }] : [])
  ];

  return (
    <div className="mx-auto max-w-[64rem] space-y-5">
      <header className="text-center">
        <h1 className="font-heading text-3xl font-extrabold gilt-text">Guild shop</h1>
        <p className="mt-1 text-sm text-mist">
          Spend points on in-game items. The Guild Leader delivers every order by hand in-game.
        </p>
        <p className="mt-2 text-sm">
          Your balance: <Points value={account.member.points} className="font-bold text-gold" />
        </p>
      </header>

      <div role="tablist" className="flex flex-wrap justify-center gap-2">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} data-on={tab === t.id} onClick={() => setTab(t.id)} className="btn-bronze h-10 px-4 text-sm">
            {t.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>}
      {rates && !rates.enabled && tab !== "manage" && (
        <p className="rounded-md border border-bronze/60 bg-panel px-4 py-3 text-center text-sm text-mist">The shop is closed right now. You can still look around.</p>
      )}

      {data === null && !error ? (
        <LanternSpinner label="Loading the shelves" className="py-12" />
      ) : tab === "shop" ? (
        <>
          {rates && (
            <p className="text-center text-xs text-mist/80">
              Prices are in points. A {trim(rates.tax_pct)}% tax is added to every purchase.
            </p>
          )}
          {groups.length === 0 && (
            <Panel title="Nothing on the shelves">
              <p className="py-2 text-center text-sm text-mist">{leader ? "Add items under Manage." : "The Guild Leader hasn't stocked the shop yet. Check back soon."}</p>
            </Panel>
          )}
          {groups.map((g) => (
            <Panel key={g.name} title={g.name}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => (
                  <li key={it.id} className="flex gap-3 rounded-md border border-bronze/50 bg-black/30 p-3">
                    <ItemPicture src={it.image_url} name={it.name} className="h-16 w-16" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="font-heading text-[15px] font-bold leading-tight text-gold">{it.name}</p>
                      {it.description && <p className="mt-0.5 text-xs text-mist">{it.description}</p>}
                      <p className="mt-1 text-sm">
                        <Points value={it.total} className="font-bold text-gold" />
                        <span className="ml-1.5 text-xs text-mist">({fmt(it.price)} + {fmt(it.tax)} tax)</span>
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={cn("text-xs", it.stock > 0 ? "text-mist" : "text-ember")}>{it.stock > 0 ? `${fmt(it.stock)} in stock` : "Sold out"}</span>
                        <button
                          onClick={() => setBuying(it)}
                          disabled={it.stock < 1 || (rates && !rates.enabled)}
                          className="btn-seal h-9 px-4 text-sm"
                        >
                          Buy
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </>
      ) : tab === "orders" ? (
        <MyOrders orders={orders} rates={rates} onChange={load} />
      ) : (
        <ShopAdmin onChange={load} />
      )}

      {buying && (
        <BuyDialog
          item={buying}
          rates={rates}
          balance={account.member.points || 0}
          onClose={() => setBuying(null)}
          onBought={(balance) => { setBalance(balance); setBuying(null); load(); setTab("orders"); }}
        />
      )}
    </div>
  );
}

function useCharacter() {
  const [character, setCharacter] = useState(() => {
    try { return window.localStorage.getItem(CHAR_KEY) || ""; } catch { return ""; }
  });
  const remember = (v) => {
    setCharacter(v);
    try { window.localStorage.setItem(CHAR_KEY, v); } catch { /* per-device convenience only */ }
  };
  return [character, remember];
}

function BuyDialog({ item, rates, balance, onClose, onBought }) {
  const [qty, setQty] = useState(1);
  const [character, setCharacter] = useCharacter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const subtotal = item.price * n;
  const tax = Math.ceil((subtotal * ((rates && rates.tax_pct) || 0)) / 100 - 1e-9);
  const total = subtotal + tax;
  const short = total > balance;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("shopAction", {
        action: "buy", itemId: item.id, qty: n, character, note, expectTotal: total
      });
      onBought(res.data.balance);
    } catch (err) {
      setError(errorText(err, "Couldn't place the order."));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-sm border-bronze bg-panel">
        <DialogHeader>
          <DialogTitle className="font-heading text-gold">Buy {item.name}</DialogTitle>
          <DialogDescription className="text-mist">
            Points are taken now. The Guild Leader delivers it to your character in-game. If the order is rejected you get everything back, tax included.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-3">
            <ItemPicture src={item.image_url} name={item.name} className="h-14 w-14" />
            <div className="text-sm text-mist">
              <Points value={item.price} className="text-gold" /> each · {fmt(item.stock)} in stock
            </div>
          </div>
          <div>
            <label htmlFor="shop-qty" className="label">How many</label>
            <input id="shop-qty" type="number" inputMode="numeric" min={1} max={item.stock} value={qty} onChange={(e) => setQty(e.target.value)} className="field" required />
          </div>
          <div>
            <label htmlFor="shop-char" className="label">In-game character name</label>
            <input id="shop-char" value={character} onChange={(e) => setCharacter(e.target.value)} maxLength={40} className="field" required />
          </div>
          <div>
            <label htmlFor="shop-note" className="label">{item.require_note ? "Which one do you want? (required)" : "Note for the Guild Leader (optional)"}</label>
            <input id="shop-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="field" required={item.require_note} />
          </div>
          <dl className="rounded-md border border-bronze/50 bg-black/30 p-3 text-sm">
            <div className="flex justify-between text-mist"><dt>Price</dt><dd>{fmt(subtotal)}</dd></div>
            <div className="flex justify-between text-mist"><dt>Tax ({trim((rates && rates.tax_pct) || 0)}%)</dt><dd>{fmt(tax)}</dd></div>
            <div className="mt-1 flex justify-between border-t border-bronze/40 pt-1 font-bold text-gold"><dt>You pay</dt><dd><Points value={total} /></dd></div>
          </dl>
          {short && <p className="text-sm text-ember">You need {fmt(total - balance)} more points.</p>}
          {error && <p role="alert" className="text-sm text-ember">{error}</p>}
          <button type="submit" disabled={busy || n < 1 || n > item.stock || short} className="btn-seal h-11 w-full text-base">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Placing order</> : "Confirm purchase"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MyOrders({ orders, rates, onChange }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const cancel = async (id) => {
    setBusy(id);
    setError("");
    try {
      await base44.functions.invoke("shopAction", { action: "cancel", orderId: id });
      await onChange();
    } catch (e) {
      setError(errorText(e, "Couldn't cancel that request."));
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel title="My orders">
      {error && <p role="alert" className="mb-3 text-sm text-ember">{error}</p>}
      {orders.length === 0 ? (
        <p className="py-2 text-center text-sm text-mist">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-bronze/25">
          {orders.map((o) => {
            const st = STATUS[o.status] || STATUS.pending;
            return (
              <li key={o.id} className="flex gap-3 py-3">
                {o.kind === "item" && <ItemPicture src={o.item_image} name={o.item_name} className="h-12 w-12" />}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-bold text-gold">
                    {o.kind === "item" ? `${fmt(o.qty)} x ${o.item_name}` : `Buy ${fmt(o.points)} points`}
                  </p>
                  <p className="text-mist">
                    {o.kind === "item"
                      ? <>Paid <Points value={o.total} iconSize={13} /> · deliver to {o.character_name}</>
                      : <>Pay {payText(o.pay_cp, o.pay_currency, rates)} in-game to the Guild Leader from {o.character_name}</>}
                  </p>
                  {o.note && <p className="text-mist/80">Note: {o.note}</p>}
                  {o.delivery_code && (
                    <p className="mt-1 break-all rounded border border-white/50 bg-black/40 px-2 py-1 font-mono text-gold">Your code: {o.delivery_code}</p>
                  )}
                  {o.admin_note && <p className="text-mist/80">Guild Leader: {o.admin_note}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase tracking-wide", st.cls)}>{st.label}</span>
                    <span className="text-xs text-mist/70">{new Date(o.created_date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    {o.kind === "points" && o.status === "pending" && (
                      <button onClick={() => cancel(o.id)} disabled={busy === o.id} className="btn-bronze h-7 px-2.5 text-xs">
                        {busy === o.id ? "Cancelling" : "Cancel request"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
