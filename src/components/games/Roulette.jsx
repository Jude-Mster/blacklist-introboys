import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Undo2, RotateCcw, Repeat, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { Ingot } from "@/components/SealLogo";
import Wheel, { angleFor } from "./Wheel";
import { useGuild, errorText } from "@/lib/GuildContext";
import { ROULETTE_ORDER, ROULETTE_PAYS, rouletteColor, rouletteWins, betKey, betLabel } from "@/lib/games";
import { cn } from "@/lib/utils";

const SPIN_MS = 5000;
const POLL_MS = 2000;
const COLORS = { red: "#A3161F", black: "#151B1D", green: "#2E7F5E" };
const SEGMENTS = ROULETTE_ORDER.map((n) => ({ label: String(n), color: COLORS[rouletteColor(n)], fontSize: 9 }));
const CHIP_VALUES = [10, 50, 100, 500, 1000, 5000];
const ROWS = Array.from({ length: 12 }, (_, r) => [r * 3 + 1, r * 3 + 2, r * 3 + 3]);

// One shared table for the whole guild. The server runs the rounds on a timer:
// betting -> spin -> result -> next round. Everyone sees the same ball.
export default function Roulette({ settings, balance }) {
  const { setBalance, reload } = useGuild();
  const chips = useMemo(() => CHIP_VALUES.filter((v) => v <= settings.max_bet), [settings.max_bet]);
  const [chip, setChip] = useState(chips[Math.min(1, chips.length - 1)] || settings.min_bet);
  const [state, setState] = useState(null); // { table, bets, mine }
  const [offset, setOffset] = useState(0); // server clock minus this device's clock
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState([]); // chips not sent yet
  const [history, setHistory] = useState([]);
  const [lastBets, setLastBets] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(0); // round whose result is on show
  const seenBetting = useRef(0);
  const animated = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await base44.functions.invoke("rouletteAction", { action: "state" });
      const d = res.data;
      if (d && d.table) {
        setOffset(Date.parse(d.table.server_now) - Date.now());
        setState(d);
        setLoadError("");
      }
    } catch (e) {
      setLoadError(errorText(e, "Couldn't reach the roulette table."));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 250);
    let unsub = () => {};
    try {
      unsub = base44.entities.RouletteTable.subscribe(() => refresh());
    } catch {
      /* polling covers it */
    }
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      unsub && unsub();
    };
  }, [refresh]);

  const table = state && state.table;
  const round = table ? table.round_no : 0;
  const serverNow = now + offset;

  // Run the wheel when a round we watched gets its number.
  useEffect(() => {
    if (!table) return;
    if (table.status === "betting") {
      seenBetting.current = table.round_no;
      return;
    }
    if (animated.current === table.round_no) return;
    animated.current = table.round_no;
    const fresh = seenBetting.current === table.round_no || Date.now() + offset - Date.parse(table.settled_at) < 4000;
    if (!fresh) {
      // Arrived after the spin: show the number without the show.
      setRotation((r) => angleFor(table.result_index, r, ROULETTE_ORDER.length, 0));
      setRevealed(table.round_no);
      return;
    }
    setSpinning(true);
    setRotation((r) => angleFor(table.result_index, r, ROULETTE_ORDER.length, 6));
    const t = setTimeout(() => {
      setSpinning(false);
      setRevealed(table.round_no);
      reload();
    }, SPIN_MS + 100);
    return () => {
      clearTimeout(t);
      setSpinning(false);
      animated.current = 0;
    };
  }, [table && table.round_no, table && table.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // New round: remember last round's chips for "repeat", clear the board.
  useEffect(() => {
    setPending([]);
    setHistory([]);
    setError("");
  }, [round]);
  useEffect(() => {
    if (state && state.mine && state.mine.bets && state.mine.bets.length) setLastBets(state.mine.bets);
  }, [state]);

  const betting = !!table && table.status === "betting";
  const closeIn = betting ? Math.max(0, Math.ceil((Date.parse(table.bets_close_at) - serverNow) / 1000)) : 0;
  const open = betting && Date.parse(table.bets_close_at) - serverNow > 1500;
  const showResult = !!table && table.status === "settled" && revealed === table.round_no;
  const nextIn = table && table.status === "settled" && table.next_at ? Math.max(0, Math.ceil((Date.parse(table.next_at) - serverNow) / 1000)) : 0;
  const betSeconds = Math.min(Math.max(Number(settings.roulette_bet_seconds) || 30, 10), 120);

  const mine = (state && state.mine) || null;
  const placed = useMemo(() => (mine && mine.round_no === round ? mine.bets || [] : []), [mine, round]);
  const placedTotal = placed.reduce((t, b) => t + b.amount, 0);
  const pendingTotal = pending.reduce((t, b) => t + b.amount, 0);
  const placedMap = useMemo(() => Object.fromEntries(placed.map((b) => [betKey(b), b.amount])), [placed]);
  const pendingMap = useMemo(() => Object.fromEntries(pending.map((b) => [betKey(b), b.amount])), [pending]);
  const number = showResult ? table.result_number : null;

  const place = (type, value) => {
    if (!open || placing) return;
    if (pendingTotal + chip > balance || placedTotal + pendingTotal + chip > settings.max_bet) {
      setError(pendingTotal + chip > balance ? "Not enough points for another chip." : `You can bet up to ${settings.max_bet.toLocaleString()} per spin.`);
      return;
    }
    setError("");
    setHistory((h) => [...h, pending]);
    setPending((bs) => {
      const k = betKey({ type, value });
      return bs.some((b) => betKey(b) === k) ? bs.map((b) => (betKey(b) === k ? { ...b, amount: b.amount + chip } : b)) : [...bs, { type, value, amount: chip }];
    });
  };
  const undo = () => {
    setPending(history[history.length - 1] || []);
    setHistory((h) => h.slice(0, -1));
  };
  const clear = () => {
    setHistory((h) => [...h, pending]);
    setPending([]);
  };
  const rebet = () => {
    if (!lastBets) return;
    const total = lastBets.reduce((t, b) => t + b.amount, 0);
    if (total > balance || placedTotal + total > settings.max_bet) {
      setError("Not enough room to repeat those bets.");
      return;
    }
    setHistory((h) => [...h, pending]);
    setPending(lastBets.map((b) => ({ ...b })));
  };
  const submit = async () => {
    if (!pending.length || placing) return;
    setPlacing(true);
    setError("");
    try {
      const res = await base44.functions.invoke("rouletteAction", { action: "bet", bets: pending });
      setBalance(res.data.balance);
      setPending([]);
      setHistory([]);
      setState((s) => (s ? { ...s, mine: res.data.mine } : s));
      refresh();
    } catch (e) {
      setError(errorText(e, "Those chips didn't go down. Try again."));
    } finally {
      setPlacing(false);
    }
  };

  const cell = (type, value, children, className, style) => {
    const k = betKey({ type, value });
    const on = placedMap[k] || 0;
    const wait = pendingMap[k] || 0;
    const hit = number !== null && rouletteWins({ type, value }, number);
    return (
      <button
        key={k}
        type="button"
        onClick={() => place(type, value)}
        disabled={!open}
        aria-label={`Bet on ${betLabel({ type, value })}${on + wait ? `, ${on + wait} on it` : ""}`}
        className={cn(
          "relative flex items-center justify-center border border-bronze/45 font-heading font-bold text-[hsl(43_60%_92%)] transition-[filter] enabled:hover:brightness-125 disabled:cursor-default",
          hit && "z-10 outline outline-2 outline-gold",
          number !== null && !hit && "opacity-60",
          className
        )}
        style={style}
      >
        {children}
        {on + wait > 0 && <Chip amount={on + wait} waiting={wait > 0} />}
      </button>
    );
  };

  if (!table) {
    return (
      <Panel title="Blacklist Jade Roulette">
        {loadError ? (
          <div className="py-6 text-center">
            <p role="alert" className="text-sm text-ember">{loadError}</p>
            <p className="mt-2 text-xs text-mist">If this keeps happening, the Guild Leader can run the system check in the admin hall.</p>
            <button onClick={refresh} className="btn-bronze mx-auto mt-4 h-10 px-5 text-sm">Try again</button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Finding the table</p>
        )}
      </Panel>
    );
  }

  const players = (state.bets || []).slice().sort((a, b) => b.amount - a.amount);
  const myRow = players.find((p) => p.mine);
  const myNet = showResult && myRow && myRow.settled ? myRow.net : null;

  return (
    <Panel title="Blacklist Jade Roulette">
      {/* round status */}
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-mist">Round {round.toLocaleString()}</span>
        <span className="flex items-center gap-1.5 text-mist"><Users className="h-4 w-4" aria-hidden="true" /> {players.length} at the table</span>
      </div>
      <div
        className={cn(
          "mb-4 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_45%,hsl(160_30%_14%),hsl(192_26%_6%))] py-4",
          myNet !== null && (myNet > 0 ? "win-glow" : myNet < 0 ? "loss-shake" : "")
        )}
      >
        <Wheel segments={SEGMENTS} rotation={rotation} spinMs={SPIN_MS} spinning={spinning} size={250} highlight={showResult ? table.result_index : null} />
        <div className="mt-3 px-4 text-center" aria-live="polite">
          {betting && open && (
            <>
              <p className="text-sm text-mist">
                Bets close in <span className="font-heading text-xl font-extrabold text-gold tabular-nums">{closeIn}</span> s
              </p>
              <div className="mx-auto mt-2 h-1.5 max-w-[220px] overflow-hidden rounded-full bg-black/50">
                <div className="h-full bg-gold/80 transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (closeIn / betSeconds) * 100)}%` }} />
              </div>
            </>
          )}
          {((betting && !open) || spinning) && <p className="font-heading text-base font-bold text-gold">No more bets. The ball is rolling.</p>}
          {showResult && !spinning && (
            <p className="text-sm text-mist">
              The ball lands on{" "}
              <span className="rounded px-2 py-0.5 font-heading text-base font-extrabold text-[hsl(43_60%_92%)]" style={{ background: COLORS[rouletteColor(number)] }}>
                {number}
              </span>
              <span className="ml-2">Next spin in {nextIn} s</span>
            </p>
          )}
        </div>
      </div>

      {myNet !== null && (
        <p className={cn("mb-3 text-center font-heading text-lg font-bold", myNet >= 0 ? "text-jade" : "text-ember")} aria-live="polite">
          {myNet > 0 ? `Victory! +${myNet.toLocaleString()} points` : myNet === 0 ? "You broke even." : `Defeat. −${Math.abs(myNet).toLocaleString()} points`}
        </p>
      )}

      {/* recent numbers */}
      {table.recent.length > 0 && (
        <div className="mb-4 flex items-center gap-1.5 overflow-hidden" aria-label="Recent numbers, newest first">
          <span className="shrink-0 text-xs text-mist">Last</span>
          {table.recent.slice(showResult || table.status === "betting" ? 0 : 1).map((n, i) => (
            <span
              key={`${n}-${i}`}
              className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[hsl(43_60%_92%)]", i === 0 && "ring-1 ring-gold")}
              style={{ background: COLORS[rouletteColor(n)] }}
            >
              {n}
            </span>
          ))}
        </div>
      )}

      {/* chip picker */}
      <p className="label">Chip value</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setChip(v)}
            aria-pressed={chip === v}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed text-xs font-bold transition-transform",
              chip === v ? "scale-110 border-gold bg-crimson text-[hsl(43_70%_92%)]" : "border-bronze/70 bg-black/40 text-gold"
            )}
          >
            {v >= 1000 ? `${v / 1000}k` : v}
          </button>
        ))}
      </div>

      {/* board */}
      <div className="select-none overflow-hidden rounded-md border border-bronze/60 bg-[hsl(160_35%_12%)]">
        {cell("straight", 0, "0", "h-10 w-full", { background: COLORS.green })}
        <div className="grid grid-cols-3">
          {ROWS.flat().map((n) => cell("straight", n, n, "h-10", { background: COLORS[rouletteColor(n)] }))}
        </div>
        <div className="grid grid-cols-3">
          {[1, 2, 3].map((c) => cell("column", c, "2:1", "h-9 bg-black/30 text-xs"))}
        </div>
        <div className="grid grid-cols-3">
          {[1, 2, 3].map((d) => cell("dozen", d, betLabel({ type: "dozen", value: d }), "h-10 bg-black/20 text-sm"))}
        </div>
        <div className="grid grid-cols-3">
          {cell("half", "low", "1–18", "h-10 bg-black/20 text-sm")}
          {cell("parity", "even", "Even", "h-10 bg-black/20 text-sm")}
          {cell("color", "red", <span className="h-4 w-4 rotate-45 bg-[#C42A2A]" aria-hidden="true" />, "h-10", { background: "hsl(160 35% 12%)" })}
          {cell("color", "black", <span className="h-4 w-4 rotate-45 border border-mist/40 bg-[#0B0F10]" aria-hidden="true" />, "h-10", { background: "hsl(160 35% 12%)" })}
          {cell("parity", "odd", "Odd", "h-10 bg-black/20 text-sm")}
          {cell("half", "high", "19–36", "h-10 bg-black/20 text-sm")}
        </div>
      </div>
      <p className="mt-2 text-xs text-mist/80">
        Pays {ROULETTE_PAYS.straight}:1 on a number, 2:1 on a dozen or column, 1:1 on red, black, odd, even, 1–18 and 19–36. Zero loses every outside bet.
      </p>

      {/* controls */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="text-sm">
          <p className="flex items-center gap-1.5">
            <span className="text-mist">Your bets this spin</span>
            <Ingot size={15} />
            <span className="font-heading text-lg font-bold text-gold tabular-nums">{placedTotal.toLocaleString()}</span>
          </p>
          {pendingTotal > 0 && <p className="text-xs text-mist">White chips aren't placed yet.</p>}
        </div>
        <div className="flex gap-1.5">
          <IconBtn onClick={undo} disabled={!open || !history.length} label="Undo last chip"><Undo2 className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={clear} disabled={!open || !pending.length} label="Clear unplaced chips"><RotateCcw className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={rebet} disabled={!open || !lastBets || pending.length > 0} label="Repeat my last bets"><Repeat className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

      <button onClick={submit} disabled={!open || placing || !pending.length || placedTotal + pendingTotal < settings.min_bet} className="btn-seal mt-3 h-12 w-full text-base">
        {placing ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Placing chips</>
        ) : !open ? (
          "Bets are closed for this spin"
        ) : pendingTotal ? (
          `Place ${pendingTotal.toLocaleString()} on the table`
        ) : placedTotal ? (
          "Bets placed. Add more chips or wait for the spin"
        ) : (
          "Tap the board to add chips"
        )}
      </button>
      {open && pendingTotal > 0 && placedTotal + pendingTotal < settings.min_bet && <p className="mt-1.5 text-xs text-mist">Put at least {settings.min_bet} on the board.</p>}

      {/* who is in */}
      <div className="mt-5 border-t border-bronze/30 pt-3">
        <p className="label">At the table · {Number(players.reduce((t, p) => t + p.amount, 0)).toLocaleString()} points in play</p>
        {players.length === 0 ? (
          <p className="text-sm text-mist">Nobody has bet on this spin yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {players.slice(0, 12).map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-sm">
                <Avatar url={p.avatar} name={p.name} size={22} />
                <span className={cn("min-w-0 flex-1 truncate", p.mine && "font-bold text-gold")}>{p.name}{p.mine ? " (you)" : ""}</span>
                <span className="tabular-nums text-mist">{p.amount.toLocaleString()}</span>
                {showResult && p.settled && (
                  <span className={cn("w-16 text-right font-bold tabular-nums", p.net > 0 ? "text-jade" : p.net < 0 ? "text-ember" : "text-mist")}>
                    {p.net > 0 ? "+" : p.net < 0 ? "−" : ""}{Math.abs(p.net).toLocaleString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function Chip({ amount, waiting }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-0.5 top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-dashed px-1 text-[10px] font-extrabold text-[hsl(192_26%_7%)] shadow",
        waiting ? "border-bronze bg-[hsl(43_60%_92%)]" : "border-[hsl(43_70%_88%)] bg-gold"
      )}
    >
      {amount >= 1000 ? `${Math.round(amount / 100) / 10}k` : amount}
    </span>
  );
}

function IconBtn({ children, label, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className="btn-bronze h-9 w-9" {...rest}>
      {children}
    </button>
  );
}