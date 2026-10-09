import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import {
  DERBY_NAME, TYPES, TYPE_NAME, STYLE_NAME, PLACE, lineKey, priceOf, lineWins, lineReturn, isLight,
  makeTimeline, orderAt, lengthsText, raceClock
} from "@/lib/derby";
import { cn } from "@/lib/utils";
import RaceView, { raceTimeAt } from "./RaceView";

// Blacklist Derby, the live track. One race for the whole guild every few minutes:
// bets are open for a little over a minute, then every screen plays the same race and the
// server pays each bet at the price it was placed at.
const OWED_KEY = "bi.derby.owed"; // set while this device has a bet that hasn't been collected
const QUICK = [10, 50, 100, 500, 1000, 5000];
const fmtPrice = (p) => (p > 0 ? `${p.toFixed(1)}×` : "—");
const short = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));

function Silk({ horse, size = 26, className }) {
  if (!horse) return null;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded font-heading font-extrabold leading-none", className)}
      style={{ width: size, height: size, background: horse.silk, color: isLight(horse.silk) ? "#111" : "#fff", boxShadow: `inset 0 -${Math.round(size / 4)}px 0 ${horse.cap}`, fontSize: Math.round(size * 0.5) }}
      aria-hidden="true"
    >
      {horse.no}
    </span>
  );
}

export default function DerbyTrack({ balance }) {
  const { setBalance, reload } = useGuild();
  const [state, setState] = useState(null); // { table, bets, mine, owed }
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0);
  const tableRef = useRef(null);
  const lastPoll = useRef(0);
  const inFlight = useRef(false);
  const loaded = useRef(false);
  const changedAt = useRef(0);
  const [race, setRace] = useState(null); // { round, raw }
  const raceRef = useRef({ round: 0, busy: false, nextTry: 0 });

  // bet slip
  const [sel, setSel] = useState({ type: "win", a: -1, b: -1 });
  const [amount, setAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const slipRef = useRef(null);

  // ----- collecting what this member's bets won -----
  const collecting = useRef(false);
  const collect = useCallback(async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const res = await base44.functions.invoke("derbyAction", { action: "settle" });
      if (!(res.data && res.data.pending)) { try { localStorage.removeItem(OWED_KEY); } catch { /* private mode */ } }
      reload();
    } catch {
      /* tried again at the next look at the track */
    } finally {
      setTimeout(() => { collecting.current = false; }, 2500);
    }
  }, [reload]);

  // ----- looking at the track -----
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const asked = Date.now();
    lastPoll.current = asked;
    try {
      const res = await base44.functions.invoke("derbyAction", { action: "state" });
      const d = res.data;
      // An answer asked for before our last bet went on (or came off) is out of date: skip it.
      if (d && d.table && asked < changedAt.current) return;
      if (d && d.table) {
        offsetRef.current = Date.parse(d.table.server_now) - Date.now();
        tableRef.current = d.table;
        loaded.current = true;
        setState(d);
        setLoadError("");
      }
    } catch (e) {
      if (!loaded.current && !(e && e.rateLimited)) setLoadError(errorText(e, "Couldn't reach the track."));
    } finally {
      inFlight.current = false;
    }
  }, []);

  // The race itself: asked for once betting has closed, once per race.
  const fetchRace = useCallback(async (round) => {
    const r = raceRef.current;
    if (r.busy) return;
    r.busy = true;
    try {
      const res = await base44.functions.invoke("derbyAction", { action: "race", round });
      const d = res.data;
      if (d && d.timeline && d.round_no === round) { r.round = round; setRace({ round, raw: d.timeline }); }
      else r.nextTry = Date.now() + 1500;
    } catch (e) {
      const msg = errorText(e, "");
      // Asked a moment too early, or the race moved on: look again shortly.
      r.nextTry = Date.now() + (/still open/i.test(msg) ? 700 : /over/i.test(msg) ? 1500 : 2500);
      if (/over/i.test(msg)) lastPoll.current = 0;
    } finally {
      r.busy = false;
    }
  }, []);

  // Pages wait a different moment after a race to ask for the next one, so they don't all
  // arrive together.
  const jitter = useRef(400 + Math.floor(Math.random() * 1600));
  useEffect(() => {
    refresh();
    // Ask only when something can have changed: every few seconds while betting is open
    // (to see the other bets), right after betting closes, when the race ends and when the
    // next race opens.
    const poll = setInterval(() => {
      const t = tableRef.current;
      const serverTime = Date.now() + offsetRef.current;
      let wait = 3000;
      if (t) {
        const close = Date.parse(t.bets_close_at), end = Date.parse(t.race_ends_at), next = Date.parse(t.next_at);
        const until = serverTime < close ? close : serverTime < end ? end : next;
        const left = until - serverTime;
        const every = serverTime < close ? 4000 : serverTime < end ? 15000 : 6000;
        wait = left > 0 ? Math.min(every, left + (until === next ? jitter.current : 400)) : 1500;
        // The race: once betting has closed and until we have it.
        if (serverTime >= close && raceRef.current.round !== t.round_no && Date.now() >= raceRef.current.nextTry) fetchRace(t.round_no);
      }
      if (Date.now() - lastPoll.current >= wait) refresh();
    }, 250);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh, fetchRace]);

  const table = state && state.table;
  const round = table ? table.round_no : 0;
  const owed = !!(state && state.owed);
  useEffect(() => { if (owed) collect(); }, [owed, state, collect]);
  // A bet left behind by closing the page before the race is collected on the next visit.
  useEffect(() => { try { if (localStorage.getItem(OWED_KEY)) collect(); } catch { /* private mode */ } }, [collect]);
  // New race: a clean slip.
  useEffect(() => { setSel((s) => ({ type: s.type, a: -1, b: -1 })); setError(""); setNotice(""); }, [round]);

  const serverNow = now + offsetRef.current;
  const closeAt = table ? Date.parse(table.bets_close_at) : 0;
  const endAt = table ? Date.parse(table.race_ends_at) : 0;
  const nextAt = table ? Date.parse(table.next_at) : 0;
  const status = !table ? "" : serverNow < closeAt ? "betting" : serverNow < endAt ? "racing" : "result";
  const open = status === "betting" && closeAt - serverNow > 700;

  const timeline = useMemo(() => {
    if (!race || !table || race.round !== table.round_no) return null;
    const tl = makeTimeline(race.raw);
    // Once the server has said the finishing order, that is the order (it settles any
    // photo finish the rounded timeline can't).
    if (tl && Array.isArray(table.order) && table.order.length === tl.n) tl.order = table.order.slice();
    return tl;
  }, [race, table]);

  const mine = state && state.mine && state.mine.round_no === round ? state.mine : null;
  const myLines = useMemo(() => (mine ? mine.lines || [] : []), [mine]);
  const myHorses = useMemo(() => { const s = new Set(); for (const l of myLines) { s.add(l.a); if (l.type === "fc") s.add(l.b); } return s; }, [myLines]);

  if (!table) {
    return (
      <Panel title={DERBY_NAME}>
        {loadError ? (
          <div className="py-6 text-center">
            <p role="alert" className="text-sm text-ember">{loadError}</p>
            <button type="button" onClick={refresh} className="btn-bronze mx-auto mt-4 h-10 px-5 text-sm">Try again</button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Opening the gates</p>
        )}
      </Panel>
    );
  }

  const field = table.field;
  const odds = table.odds;
  const t = status === "betting" ? 0 : raceTimeAt(serverNow, table);
  const raceDone = status === "result";
  // The finishing order, once it may be shown.
  const order = raceDone ? (Array.isArray(table.order) ? table.order : timeline ? timeline.order : null) : null;
  const placeOf = (i) => (order ? order.indexOf(i) : -1);
  const running = status === "racing" && timeline ? orderAt(timeline, t) : null;
  const lead = timeline && status === "racing" ? Math.max(...field.map((_, i) => timeline.pos(i, t))) : 0;

  const players = state.bets || [];
  const myRow = players.find((p) => p.mine);
  const myNet = raceDone && myRow && myRow.done ? myRow.net : null;
  const placed = mine ? mine.amount || 0 : 0;
  const limit = table.limit || 2000;
  const minBet = table.min_bet || 1;
  const room = Math.max(0, Math.min(limit - placed, balance));

  // ----- the slip -----
  const price = sel.a >= 0 ? priceOf(odds, sel.type, sel.a, sel.type === "fc" ? sel.b : -1) : 0;
  const amt = Math.floor(Number(amount) || 0);
  const ready = sel.a >= 0 && (sel.type !== "fc" || (sel.b >= 0 && sel.b !== sel.a));
  const pick = (type, a) => {
    if (!open) return;
    setError(""); setNotice("");
    setSel(type === "fc" ? { type, a, b: sel.type === "fc" && sel.b !== a ? sel.b : -1 } : { type, a, b: -1 });
    // On a phone the slip sits under the race card: bring it into view.
    const el = slipRef.current;
    if (el && window.innerWidth < 1024) { const r = el.getBoundingClientRect(); if (r.top > window.innerHeight - 160) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  const problem = !ready ? "" : !(price > 0) ? "That bet isn't offered on this race."
    : !amt ? "" : amt < minBet ? `The smallest bet is ${minBet.toLocaleString()}.`
    : amt > balance ? "Not enough points for that bet."
    : placed + amt > limit ? `You can bet up to ${limit.toLocaleString()} on one race (${Math.max(0, limit - placed).toLocaleString()} left).`
    : myLines.length >= 20 && !myLines.some((l) => lineKey(l) === lineKey({ ...sel })) ? "You already have 20 different bets on this race."
    : "";
  const canPlace = open && ready && price > 0 && amt >= minBet && !problem && !placing;

  const place = async () => {
    if (!canPlace || placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    setError(""); setNotice("");
    const line = { type: sel.type, a: sel.a, b: sel.type === "fc" ? sel.b : -1, amount: amt };
    try {
      const res = await base44.functions.invoke("derbyAction", { action: "bet", round, lines: [line] });
      try { localStorage.setItem(OWED_KEY, "1"); } catch { /* private mode */ }
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      changedAt.current = Date.now();
      setState((s) => (s ? { ...s, mine: res.data.mine } : s));
      setNotice(`${TYPE_NAME[line.type]} ${line.type === "fc" ? `#${line.a + 1} then #${line.b + 1}` : `#${line.a + 1}`} for ${amt.toLocaleString()} is on.`);
      setAmount("");
      refresh();
    } catch (e) {
      setError(errorText(e, "That bet didn't go on. Try again."));
      // The request may have failed after the points were taken: ask the track what it really has.
      changedAt.current = Date.now();
      setTimeout(refresh, 300);
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };
  const takeBack = async (payload) => {
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    setError(""); setNotice("");
    try {
      const res = await base44.functions.invoke("derbyAction", { action: "remove", round, ...payload });
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      changedAt.current = Date.now();
      setState((s) => (s ? { ...s, mine: res.data.mine } : s));
      if (!res.data.mine) { try { localStorage.removeItem(OWED_KEY); } catch { /* private mode */ } }
      refresh();
    } catch (e) {
      setError(errorText(e, "That bet couldn't be taken back."));
      changedAt.current = Date.now();
      setTimeout(refresh, 300);
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const horseName = (i) => (field[i] ? `#${field[i].no} ${field[i].name}` : `#${i + 1}`);
  const lineText = (l) => (l.type === "fc" ? `${horseName(l.a)} then ${horseName(l.b)}` : horseName(l.a));
  const shortLine = (l) => `${TYPE_NAME[l.type]} #${l.a + 1}${l.type === "fc" ? `-#${l.b + 1}` : ""}`;

  // ----- what the strip under the screen says -----
  const closeIn = Math.max(0, Math.ceil((closeAt - serverNow) / 1000));
  const nextIn = Math.max(0, Math.ceil((nextAt - serverNow) / 1000));
  const waiting = status !== "betting" && !timeline ? (status === "racing" ? "Loading the race" : "Loading the result") : "";

  return (
    <div className="mx-auto grid max-w-[78rem] grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <RaceView table={table} timeline={timeline} offsetRef={offsetRef} mine={myHorses} waiting={waiting} />

        {/* the strip under the screen */}
        <div className={cn("rounded-md border border-bronze/45 bg-black/40 px-3 py-2.5", myNet !== null && (myNet > 0 ? "win-glow" : ""))} aria-live="polite">
          {status === "betting" && (open ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-sm text-mist">Race {round.toLocaleString()} · {(table.dist || 1600).toLocaleString()} m · betting closes in <span className="font-heading text-xl font-extrabold tabular-nums text-gold">{closeIn}</span> s</p>
              <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-black/60">
                <div className="h-full bg-gold/80 transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (closeIn / (table.bet_seconds || 75)) * 100)}%` }} />
              </div>
            </div>
          ) : <p className="font-heading text-base font-bold text-gold">Betting is closed. They're going into the stalls.</p>)}
          {status === "racing" && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm">
              <span className="font-heading text-base font-bold text-gold">{t < 1 ? "And they're off!" : "Race in progress"}</span>
              {timeline && <span className="tabular-nums text-mist">{raceClock(Math.min(t, Math.max(...timeline.fin)))} · {Math.max(0, Math.ceil((table.dist || 1600) - lead)).toLocaleString()} m to go</span>}
              {running && running.length > 0 && <span className="text-mist">Leader: <b className="text-[hsl(var(--foreground))]">{horseName(running[0])}</b></span>}
            </p>
          )}
          {raceDone && (
            <div className="space-y-1">
              {order ? (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {order.slice(0, 3).map((i, k) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className={cn("font-heading font-bold", k === 0 ? "text-gold" : "text-mist")}>{PLACE[k]}</span>
                      <Silk horse={field[i]} size={20} />
                      <span className={k === 0 ? "font-bold" : ""}>{field[i] && field[i].name}</span>
                    </span>
                  ))}
                  {timeline && <span className="text-xs text-mist">won by {lengthsText(timeline.fin[order[1]] - timeline.fin[order[0]])}</span>}
                </p>
              ) : <p className="text-sm text-mist">Waiting for the result.</p>}
              <p className="text-xs text-mist">
                {myNet !== null && <b className={cn("mr-2 font-heading text-sm", myNet > 0 ? "text-gold" : myNet < 0 ? "text-ember" : "text-mist")}>{myNet > 0 ? `You won +${myNet.toLocaleString()} points!` : myNet === 0 ? "You broke even." : `You lost ${Math.abs(myNet).toLocaleString()} points.`}</b>}
                Next race in {nextIn} s
              </p>
            </div>
          )}
        </div>

        {/* the race card */}
        <Panel title={`Race ${round.toLocaleString()} card`} bodyClassName="px-0 sm:px-0">
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.6rem)] items-center gap-x-1.5 px-3 pb-1.5 text-[10px] uppercase tracking-wide text-mist sm:grid-cols-[minmax(0,1fr)_repeat(3,4.4rem)]">
            <span>Horse</span><span className="text-center">Win</span><span className="text-center">Top 2</span><span className="text-center">Top 3</span>
          </div>
          <ul className="divide-y divide-bronze/25" aria-label="Runners and prices">
            {field.map((h, i) => {
              const pl = placeOf(i);
              return (
                <li key={h.id} className={cn("grid grid-cols-[minmax(0,1fr)_repeat(3,3.6rem)] items-center gap-x-1.5 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.4rem)]", pl === 0 && "bg-gold/10")}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Silk horse={h} />
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm font-bold", myHorses.has(i) && "text-gold")}>{h.name}{pl >= 0 && <span className={cn("ml-1.5 font-heading text-xs", pl === 0 ? "text-gold" : "text-mist")}>{PLACE[pl]}</span>}</p>
                      <p className="truncate text-[11px] text-mist">{STYLE_NAME[h.style] || ""} · Form {h.form && h.form.length ? h.form.join("-") : "new"}</p>
                    </div>
                  </div>
                  {["win", "top2", "top3"].map((type) => {
                    const p = priceOf(odds, type, i);
                    const on = sel.type === type && sel.a === i;
                    return (
                      <button key={type} type="button" disabled={!open || !(p > 0)} onClick={() => pick(type, i)} aria-pressed={on}
                        aria-label={`${TYPE_NAME[type]} on ${h.name}, pays ${fmtPrice(p)}`}
                        className={cn("h-9 rounded border text-center font-heading text-sm font-bold tabular-nums transition-colors disabled:cursor-default",
                          on ? "border-gold bg-gold/25 text-gold" : "border-bronze/45 bg-black/30 enabled:hover:border-gold", !(p > 0) && "opacity-40")}>
                        {fmtPrice(p)}
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        {/* bet slip */}
        <div ref={slipRef} className="scroll-mt-20">
        <Panel title="Bet slip">
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="Bet type">
            {TYPES.map((ty) => (
              <button key={ty.id} type="button" disabled={!open} onClick={() => { setError(""); setSel((s) => ({ type: ty.id, a: s.a, b: ty.id === "fc" ? s.b : -1 })); }} aria-pressed={sel.type === ty.id}
                className={cn("h-8 rounded border text-xs font-bold", sel.type === ty.id ? "border-gold bg-gold/20 text-gold" : "border-bronze/45 text-mist enabled:hover:border-bronze")}>
                {ty.name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-mist">{TYPES.find((x) => x.id === sel.type).name}: pick a horse {TYPES.find((x) => x.id === sel.type).what}.</p>
          {sel.type === "fc" ? (
            <div className="mt-2 space-y-1.5">
              {[["a", "1st"], ["b", "2nd"]].map(([k, label]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 font-heading text-xs font-bold text-mist">{label}</span>
                  <div className="grid flex-1 grid-cols-8 gap-1">
                    {field.map((h, i) => {
                      const on = sel[k] === i, blocked = k === "b" && sel.a === i;
                      return (
                        <button key={h.id} type="button" disabled={!open || blocked} aria-pressed={on} aria-label={`${label}: ${h.name}`}
                          onClick={() => { setError(""); setSel((s) => { const n = { ...s, type: "fc", [k]: i }; if (k === "a" && n.b === i) n.b = -1; return n; }); }}
                          className={cn("flex h-8 items-center justify-center rounded border", on ? "border-gold ring-1 ring-gold" : "border-transparent", blocked && "opacity-30")}>
                          <Silk horse={h} size={24} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm">{sel.a >= 0 ? <span className="flex items-center gap-2"><Silk horse={field[sel.a]} size={22} /> <b>{field[sel.a].name}</b></span> : <span className="text-mist">Tap a price on the race card.</span>}</p>
          )}

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-mist">Pays</span>
            <span className="font-heading text-lg font-extrabold tabular-nums text-gold">{ready ? fmtPrice(price) : "—"}</span>
          </div>
          <label className="mt-2 block text-xs text-mist" htmlFor="derby-amount">Amount</label>
          <input id="derby-amount" type="number" inputMode="numeric" min={minBet} step={1} value={amount} disabled={!open}
            onChange={(e) => { setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9)); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") place(); }}
            placeholder={`${minBet.toLocaleString()} or more`}
            className="mt-1 h-10 w-full rounded border border-bronze/50 bg-black/40 px-3 text-base tabular-nums outline-none focus:border-gold disabled:opacity-60" />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK.filter((v) => v <= limit && v >= minBet).map((v) => (
              <button key={v} type="button" disabled={!open} onClick={() => { setAmount(String(Math.min(room || v, amt + v))); setError(""); }}
                className="h-7 rounded border border-bronze/45 px-2 text-xs text-mist enabled:hover:border-gold">+{short(v)}</button>
            ))}
            <button type="button" disabled={!open || room < minBet} onClick={() => setAmount(String(room))} className="h-7 rounded border border-bronze/45 px-2 text-xs text-mist enabled:hover:border-gold">Max</button>
            <button type="button" disabled={!open || !amount} onClick={() => setAmount("")} className="h-7 rounded border border-bronze/45 px-2 text-xs text-mist enabled:hover:border-gold">Clear</button>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-mist">Returns if it wins</span>
            <span className="tabular-nums">{ready && price > 0 && amt > 0 ? <Points value={Math.floor(amt * price)} iconSize={12} /> : "—"}</span>
          </div>
          {(problem || error) && <p role="alert" className="mt-2 text-sm text-ember">{error || problem}</p>}
          {notice && !error && !problem && <p className="mt-2 text-sm text-jade">{notice}</p>}
          <button type="button" onClick={place} disabled={!canPlace} className="btn-seal mt-3 h-11 w-full">
            {placing ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : !open ? (status === "betting" ? "Betting is closing" : "Wait for the next race") : "Place bet"}
          </button>
          <p className="mt-2 text-center text-[11px] text-mist">Up to {limit.toLocaleString()} per race · {Math.max(0, limit - placed).toLocaleString()} left</p>
        </Panel>
        </div>

        {/* this member's bets */}
        <Panel title="Your bets">
          {myLines.length ? (
            <ul className="divide-y divide-bronze/25" aria-label="Your bets on this race">
              {myLines.map((l) => {
                const won = order ? lineWins(l, order) : null;
                return (
                  <li key={lineKey(l)} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="w-16 shrink-0 font-heading text-xs font-bold text-mist">{TYPE_NAME[l.type]}</span>
                    <span className="min-w-0 flex-1 truncate">{lineText(l)}</span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-mist">{l.amount.toLocaleString()} @ {fmtPrice(l.price)}</span>
                    {won !== null && <span className={cn("w-14 shrink-0 text-right font-heading text-xs font-bold tabular-nums", won ? "text-gold" : "text-ember")}>{won ? `+${lineReturn(l, order).toLocaleString()}` : "lost"}</span>}
                    {open && (
                      <button type="button" disabled={placing} onClick={() => takeBack({ line: { type: l.type, a: l.a, b: l.b } })} aria-label={`Take back ${shortLine(l)}`} className="shrink-0 rounded p-1 text-mist hover:text-ember">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-mist">{open ? "No bets on this race yet." : "You have no bets on this race."}</p>}
          {myLines.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-bronze/25 pt-2 text-sm">
              <span className="text-mist">Total</span>
              <span className="flex items-center gap-3">
                {open && <button type="button" disabled={placing} onClick={() => takeBack({ all: true })} className="text-xs text-mist underline hover:text-gold">Take all back</button>}
                <Points value={placed} iconSize={12} />
              </span>
            </div>
          )}
        </Panel>

        {/* everyone else */}
        <Panel title="Players this race">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-mist"><Users className="h-3.5 w-3.5" aria-hidden="true" /> {table.players} betting · <Points value={table.total_bet} iconSize={11} /> on this race</p>
          {players.length ? (
            <ul className="divide-y divide-bronze/25" aria-label="Players this race">
              {[...players].sort((a, b) => b.amount - a.amount).slice(0, 15).map((p, i) => (
                <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
                  <Avatar url={p.avatar} name={p.name} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", p.mine && "font-bold text-gold")}>{p.mine ? "You" : p.name}</span>
                    <span className="block truncate text-[11px] text-mist">{(p.lines || []).map(shortLine).join(", ")}</span>
                  </span>
                  <Points value={p.amount} iconSize={12} className="shrink-0 tabular-nums text-mist" />
                  {raceDone && p.done && <span className={cn("w-14 shrink-0 text-right font-heading font-bold tabular-nums", p.net > 0 ? "text-jade" : p.net < 0 ? "text-ember" : "text-mist")}>{p.net > 0 ? "+" : ""}{p.net.toLocaleString()}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-mist">No bets yet. Be the first.</p>}
        </Panel>

        {table.recent && table.recent.length > 0 && (
          <Panel title="Recent winners">
            <ul className="space-y-1.5" aria-label="Recent winners, newest first">
              {table.recent.slice(0, 6).map((r) => (
                <li key={r.r} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-xs text-mist">Race {Number(r.r).toLocaleString()}</span>
                  <Silk horse={{ no: r.no, silk: r.silk || "#555", cap: r.silk || "#555" }} size={20} />
                  <span className="truncate">{r.name || `#${r.no}`}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <details className="rounded border border-bronze/30 bg-black/30 px-2.5 py-2">
          <summary className="cursor-pointer text-sm text-gold">How the Derby works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-mist">
            <li>A new {(table.dist || 1600).toLocaleString()} m race every few minutes. Betting is open for {table.bet_seconds || 75} seconds, then every member watches the same race.</li>
            <li><b className="text-[hsl(var(--foreground))]">Win</b>: your horse finishes 1st. <b className="text-[hsl(var(--foreground))]">Top 2</b>: 1st or 2nd. <b className="text-[hsl(var(--foreground))]">Top 3</b>: in the first three. <b className="text-[hsl(var(--foreground))]">Forecast</b>: the 1st and 2nd horses in the right order.</li>
            <li>The price is what you get back for each point, your stake included: 100 at 3.4× returns 340. You keep the price you bet at.</li>
            <li>Each horse has a running style. Front runners lead early and can tire, closers come late. Form shows the last three finishes, newest first.</li>
            <li>You can bet up to {limit.toLocaleString()} on one race and take bets back until betting closes. Winnings are paid as soon as the race is over, even if you leave the page.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}