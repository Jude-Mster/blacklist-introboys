import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Bot, Check, Copy, ExternalLink, Loader2, PackageOpen, Ticket } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { Points } from "@/components/SealLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuild, errorText } from "@/lib/GuildContext";
import ShopAdmin from "@/components/shop/ShopAdmin";
import { REDEEM_URL, groupCode } from "@/lib/prizes";
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

// One GP code the member bought: shown in full only to them, with Copy and the redeem page.
export function BoughtCode({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    let done = false;
    try { await navigator.clipboard.writeText(code.code); done = true; } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = code.code; ta.setAttribute("readonly", ""); ta.style.position = "absolute"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select(); done = document.execCommand("copy"); document.body.removeChild(ta);
      } catch { done = false; }
    }
    setCopied(done);
    setTimeout(() => setCopied(false), 2000);
  };
  if (!code.code) return <p className="text-xs text-ember">This code can't be shown right now. Ask the Guild Leader.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-gold/60 bg-black/50 px-2.5 py-2">
      <span className="min-w-0 flex-1 font-mono text-[15px] font-bold tracking-wider text-gold">
        {groupCode(code.code).split(" ").map((g, i) => <span key={i} className="mr-[0.45em] inline-block">{g}</span>)}
      </span>
      <button type="button" onClick={copy} className="btn-bronze h-8 px-2.5 text-xs" aria-label={`Copy the code ending in ${code.last4}`}>
        {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
      </button>
      <a href={code.redeem_url || REDEEM_URL} target="_blank" rel="noreferrer" className="btn-bronze h-8 px-2.5 text-xs">
        Redeem <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

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
          Spend points on in-game items. The Guild Leader delivers items by hand in-game; GP codes show up right here.
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
                      {it.gp_code && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-white/90">
                          <Ticket className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                          {fmt(it.gp_worth)} GP code · {it.code_source === "manual" ? "the Guild Leader sends it" : "shown the moment you buy"}
                        </p>
                      )}
                      {it.bot_days > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-white/90">
                          <Bot className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                          {fmt(it.bot_days)} day{it.bot_days === 1 ? "" : "s"} of the Assistant · switched on the moment you buy
                        </p>
                      )}
                      {it.description && <p className="mt-0.5 text-xs text-mist">{it.description}</p>}
                      <p className="mt-1 text-sm">
                        <Points value={it.total} className="font-bold text-gold" />
                        <span className="ml-1.5 text-xs text-mist">({fmt(it.price)} + {fmt(it.tax)} tax)</span>
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={cn("text-xs", it.stock > 0 ? "text-mist" : "text-ember")}>{it.bot_days > 0 ? "Always available" : it.stock > 0 ? `${fmt(it.stock)} in stock` : "Sold out"}</span>
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
          onBought={(balance, order) => {
            setBalance(balance); load();
            // A code from stock is shown in the dialog right away; Assistant days say so in the dialog; anything else goes to My orders.
            if (order && order.codes && order.codes.length) return;
            if (buying && buying.bot_days > 0) return;
            setBuying(null); setTab("orders");
          }}
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
  const [bought, setBought] = useState(null); // the finished order when codes were handed over

  const isCode = !!item.gp_code;
  const isBot = item.bot_days > 0;
  const [gotDays, setGotDays] = useState(null);   // the license after buying Assistant days
  // 6.41: which of the member's devices gets the days (or a new device for another PC)
  const [devices, setDevices] = useState(null);
  const [botSeat, setBotSeat] = useState("1");
  useEffect(() => {
    if (!isBot) return;
    base44.functions.invoke("botAuth", { action: "status" })
      .then((r) => { const d = (r.data && r.data.devices) || []; setDevices({ list: d, max: (r.data && r.data.max_devices) || 5 }); if (d.length) setBotSeat(String(d[0].seat)); })
      .catch(() => setDevices({ list: [], max: 5 }));
  }, [isBot]);
  const instant = isCode && item.code_source !== "manual";
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
        action: "buy", itemId: item.id, qty: n, character, note, expectTotal: total, ...(isBot ? { botSeat: botSeat === "new" ? "new" : Number(botSeat) } : {})
      });
      const order = res.data.order;
      if (res.data.license) { setGotDays(res.data.license); setBusy(false); }
      if (order && order.codes && order.codes.length) { setBought(order); setBusy(false); }
      onBought(res.data.balance, order);
    } catch (err) {
      setError(errorText(err, "Couldn't place the order."));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-sm border-bronze bg-panel">
        {gotDays ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-gold">Assistant days added</DialogTitle>
              <DialogDescription className="text-mist">
                <b className="text-white">{gotDays.label}</b> now has <b className="text-white">{fmt(gotDays.days_left)} day{gotDays.days_left === 1 ? "" : "s"}</b> of the IntroBoys Assistant, until {new Date(gotDays.expires_at).toLocaleString()}. Open the app on that PC and sign in with Discord to use it.
              </DialogDescription>
            </DialogHeader>
            <Link to="/assistant" className="btn-seal block h-11 w-full text-center text-base leading-[2.75rem]" onClick={onClose}>Open the Assistant page</Link>
            <button type="button" onClick={onClose} className="btn-bronze h-10 w-full text-sm">Done</button>
          </>
        ) : bought ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-gold">{bought.codes.length > 1 ? "Your codes" : "Your code"}</DialogTitle>
              <DialogDescription className="text-mist">
                {fmt(bought.qty)} x {bought.item_name}. Only you can see {bought.codes.length > 1 ? "these" : "this"}: keep {bought.codes.length > 1 ? "them" : "it"} private, anyone who has a code can redeem it. {bought.codes.length > 1 ? "They are" : "It is"} also saved under My orders and Profile, My prizes, and sent to you by Discord DM.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {bought.codes.map((c) => <BoughtCode key={c.id} code={c} />)}
            </div>
            <button type="button" onClick={onClose} className="btn-seal h-11 w-full text-base">Done</button>
          </>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="font-heading text-gold">Buy {item.name}</DialogTitle>
          <DialogDescription className="text-mist">
            {isBot
              ? `Points are taken now and ${fmt(item.bot_days)} day${item.bot_days === 1 ? "" : "s"} of the IntroBoys Assistant are added to the device you pick straight away (on top of any time it has left). Nothing is delivered by hand.`
              : instant
              ? "Points are taken now and your code is shown straight away. It is also sent to you by Discord DM and kept under My prizes."
              : isCode
                ? "Points are taken now. The Guild Leader adds your code, and you'll see it under My orders (and get it by Discord DM). If the order is rejected you get everything back, tax included."
                : "Points are taken now. The Guild Leader delivers it to your character in-game. If the order is rejected you get everything back, tax included."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-3">
            <ItemPicture src={item.image_url} name={item.name} className="h-14 w-14" />
            <div className="text-sm text-mist">
              <Points value={item.price} className="text-gold" /> each · {isBot ? `${fmt(item.bot_days)} day${item.bot_days === 1 ? "" : "s"} each` : `${fmt(item.stock)} in stock`}
            </div>
          </div>
          <div>
            <label htmlFor="shop-qty" className="label">How many</label>
            <input id="shop-qty" type="number" inputMode="numeric" min={1} max={isBot ? 12 : isCode ? Math.min(20, item.stock) : item.stock} value={qty} onChange={(e) => setQty(e.target.value)} className="field" required />
          </div>
          {isBot && devices && (devices.list.length > 0 || devices.max > 1) && (
            <div>
              <label htmlFor="shop-seat" className="label">Add the days to</label>
              <select id="shop-seat" value={botSeat} onChange={(e) => setBotSeat(e.target.value)} className="field">
                {devices.list.map((d) => (
                  <option key={d.seat} value={String(d.seat)}>{d.label}{d.device_bound ? ` (PC ${d.device_tag})` : ""} · {d.active ? `${fmt(d.days_left)} days left` : "no days"}</option>
                ))}
                {devices.list.length > 0 && devices.list.length < devices.max && <option value="new">A new device (another PC)</option>}
              </select>
              {botSeat === "new" && <p className="mt-1 text-xs text-mist">A new device is made for the next PC that signs in to the app.</p>}
            </div>
          )}
          {!isCode && !isBot && (
            <div>
              <label htmlFor="shop-char" className="label">In-game character name</label>
              <input id="shop-char" value={character} onChange={(e) => setCharacter(e.target.value)} maxLength={40} className="field" required />
            </div>
          )}
          {!isBot && <div>
            <label htmlFor="shop-note" className="label">{item.require_note ? "Which one do you want? (required)" : "Note for the Guild Leader (optional)"}</label>
            <input id="shop-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="field" required={item.require_note} />
          </div>}
          <dl className="rounded-md border border-bronze/50 bg-black/30 p-3 text-sm">
            <div className="flex justify-between text-mist"><dt>Price</dt><dd>{fmt(subtotal)}</dd></div>
            <div className="flex justify-between text-mist"><dt>Tax ({trim((rates && rates.tax_pct) || 0)}%)</dt><dd>{fmt(tax)}</dd></div>
            <div className="mt-1 flex justify-between border-t border-bronze/40 pt-1 font-bold text-gold"><dt>You pay</dt><dd><Points value={total} /></dd></div>
          </dl>
          {short && <p className="text-sm text-ember">You need {fmt(total - balance)} more points.</p>}
          {error && <p role="alert" className="text-sm text-ember">{error}</p>}
          <button type="submit" disabled={busy || n < 1 || (!isBot && n > item.stock) || (isBot && n > 12) || (isCode && n > 20) || short} className="btn-seal h-11 w-full text-base">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Placing order</> : isBot ? "Buy and switch on" : instant ? "Buy and show my code" : "Confirm purchase"}
          </button>
        </form>
        </>
        )}
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
                      ? <>Paid <Points value={o.total} iconSize={13} />{o.gp_code ? <> · {fmt(o.gp_worth)} GP code{o.qty > 1 ? "s" : ""}{o.status === "pending" ? " · the Guild Leader will add your code here" : ""}</> : <> · deliver to {o.character_name}</>}</>
                      : <>Pay {payText(o.pay_cp, o.pay_currency, rates)} in-game to the Guild Leader from {o.character_name}</>}
                  </p>
                  {o.note && <p className="text-mist/80">Note: {o.note}</p>}
                  {o.codes && o.codes.length > 0 && (
                    <div className="mt-1.5 space-y-1.5">{o.codes.map((c) => <BoughtCode key={c.id} code={c} />)}</div>
                  )}
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