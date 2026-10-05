import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { SICBO_NAME, SICBO_PAYS, SINGLE_PAYS, sicboReturn, diceTotal, isTriple } from "@/lib/sicbo";
import { Chip, ChipTray, chipsFor, CHIP_VALUES } from "./ChipBetting";
import Die3D, { MiniDie } from "./Dice3D";
import { cn } from "@/lib/utils";

// Dragon Sic Bo: three dice and one shared table. Everyone bets during the countdown,
// then the same three dice are rolled for the whole guild. The server rolls and pays;
// this page shows the roll and the board.
const ROLL_MS = 4000; // must match ROLL_SECONDS in sicboAction
const POLL_MS = 2500;
const TOTALS_LOW = [4, 5, 6, 7, 8, 9, 10];
const TOTALS_HIGH = [11, 12, 13, 14, 15, 16, 17];
const short = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));
const SPOT_NAME = (id) => ({ small: "Small", big: "Big", odd: "Odd", even: "Even", triple: "Any triple" }[id] || (id[0] === "t" ? `Total ${id.slice(1)}` : `Number ${id.slice(1)}`));

export default function SicBo({ settings, balance }) {
  const { setBalance, reload } = useGuild();
  const chips = useMemo(() => CHIP_VALUES.filter((v) => v <= settings.max_bet && v >= Math.min(10, settings.min_bet)), [settings.max_bet, settings.min_bet]);
  const [chip, setChip] = useState(0);
  const [state, setState] = useState(null); // { table, bets, mine }
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState([]); // chips not sent yet: [{ type, amount }]
  const [history, setHistory] = useState([]);
  const [lastBets, setLastBets] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [shownDice, setShownDice] = useState([1, 2, 3]);
  const [rollKey, setRollKey] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [revealed, setRevealed] = useState(0); // round whose result is on show
  const seenBetting = useRef(0);
  const animated = useRef(0);
  const inFlight = useRef(false);
  const loaded = useRef(false);
  const useChip = chips.includes(chip) ? chip : chips[Math.min(1, chips.length - 1)] || 0;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await base44.functions.invoke("sicboAction", { action: "state" });
      const d = res.data;
      if (d && d.table) {
        setOffset(Date.parse(d.table.server_now) - Date.now());
        loaded.current = true;
        setState(d);
        setLoadError("");
      }
    } catch (e) {
      if (!loaded.current && !(e && e.rateLimited)) setLoadError(errorText(e, "Couldn't reach the Sic Bo table."));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh]);

  const table = state && state.table;
  const round = table ? table.round_no : 0;
  const serverNow = now + offset;

  // Throw the dice when a round we watched gets its result.
  useEffect(() => {
    if (!table) return undefined;
    if (table.status === "betting") { seenBetting.current = table.round_no; return undefined; }
    if (!table.dice) return undefined;
    if (animated.current === table.round_no) return undefined;
    animated.current = table.round_no;
    const fresh = seenBetting.current === table.round_no || Date.now() + offset - Date.parse(table.settled_at) < 3000;
    setShownDice(table.dice);
    if (!fresh) { setRevealed(table.round_no); return undefined; } // arrived after the roll: just show it
    setRolling(true);
    setRollKey((k) => k + 1);
    const t = setTimeout(() => {
      setRolling(false);
      setRevealed(table.round_no);
      reload(); // points only change once the dice have stopped
    }, ROLL_MS + 150);
    return () => { clearTimeout(t); setRolling(false); animated.current = 0; };
  }, [table && table.round_no, table && table.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // New round: clear the chips that were waiting to go down.
  useEffect(() => { setPending([]); setHistory([]); setError(""); }, [round]);
  useEffect(() => {
    if (state && state.mine && state.mine.bets && state.mine.bets.length) setLastBets(state.mine.bets.map((b) => ({ type: b.type, amount: b.amount })));
  }, [state]);

  const betting = !!table && table.status === "betting";
  const closeIn = betting ? Math.max(0, Math.ceil((Date.parse(table.bets_close_at) - serverNow) / 1000)) : 0;
  const open = betting && Date.parse(table.bets_close_at) - serverNow > 1500;
  const showResult = !!table && table.status === "settled" && revealed === table.round_no && !!table.dice;
  const nextIn = table && table.status === "settled" && table.next_at ? Math.max(0, Math.ceil((Date.parse(table.next_at) - serverNow) / 1000)) : 0;
  const mine = (state && state.mine) || null;
  const placed = useMemo(() => (mine && mine.round_no === round ? mine.bets || [] : []), [mine, round]);
  const placedTotal = placed.reduce((t, b) => t + b.amount, 0);
  const pendingTotal = pending.reduce((t, b) => t + b.amount, 0);
  const amountIn = (list, type) => (list.find((b) => b.type === type) || { amount: 0 }).amount;
  const dice = showResult ? table.dice : null;

  const place = (type, value) => {
    if (!open || placing || !value) return;
    if (pendingTotal + value > balance || placedTotal + pendingTotal + value > settings.max_bet) {
      setError(pendingTotal + value > balance ? "Not enough points for another chip." : `You can bet up to ${settings.max_bet.toLocaleString()} per roll.`);
      return;
    }
    setError("");
    setHistory((h) => [...h, pending]);
    setPending((bs) => (bs.some((b) => b.type === type) ? bs.map((b) => (b.type === type ? { ...b, amount: b.amount + value } : b)) : [...bs, { type, amount: value }]));
  };
  const undo = () => { setPending(history[history.length - 1] || []); setHistory((h) => h.slice(0, -1)); };
  const clear = () => { setHistory((h) => [...h, pending]); setPending([]); };
  const rebet = () => {
    if (!lastBets) return;
    const total = lastBets.reduce((t, b) => t + b.amount, 0);
    if (total > balance || placedTotal + total > settings.max_bet) { setError("Not enough room to repeat those bets."); return; }
    setHistory((h) => [...h, pending]);
    setPending(lastBets.map((b) => ({ ...b })));
  };
  const submit = async () => {
    if (!pending.length || placing) return;
    setPlacing(true);
    setError("");
    try {
      const res = await base44.functions.invoke("sicboAction", { action: "bet", bets: pending });
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

  if (!table) {
    return (
      <Panel title={SICBO_NAME}>
        {loadError ? (
          <div className="py-6 text-center">
            <p role="alert" className="text-sm text-ember">{loadError}</p>
            <button onClick={refresh} className="btn-bronze mx-auto mt-4 h-10 px-5 text-sm">Try again</button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Finding the table</p>
        )}
      </Panel>
    );
  }

  const players = state.bets || [];
  const myRow = players.find((p) => p.mine);
  const myNet = showResult && myRow && myRow.settled ? myRow.net : null;
  const othersOn = (type) => players.filter((p) => !p.mine).reduce((t, p) => t + (p.spots || []).filter((c) => c.type === type).reduce((a, c) => a + c.amount, 0), 0);
  const recent = table.recent.slice(showResult || table.status === "betting" ? 0 : 1);
  const waitingToRoll = betting && !open;

  // One printed spot on the felt. Chips can be dragged onto it or tapped onto it.
  const spot = (id, label, pays, extra = "") => {
    const mineHere = amountIn(placed, id);
    const waiting = amountIn(pending, id);
    const others = othersOn(id);
    const hit = dice ? sicboReturn(id, dice) > 0 : false;
    const stack = chipsFor(mineHere + waiting, 1);
    return (
      <button
        key={id}
        type="button"
        data-spot={open ? id : undefined}
        onClick={() => place(id, useChip)}
        disabled={!open}
        aria-label={`${SPOT_NAME(id)}${mineHere + waiting ? `, ${mineHere + waiting} of yours on it` : ""}`}
        className={cn(
          "relative flex min-h-[46px] flex-col items-center justify-center rounded-md border px-0.5 py-1 text-center transition-colors disabled:cursor-default",
          hit ? "border-2 border-gold bg-gold/25 win-glow" : waiting ? "border-dashed border-gold bg-white/10" : mineHere ? "border-gold/80 bg-white/5" : "border-dashed border-white/45 enabled:hover:bg-white/10",
          dice && !hit && "opacity-45",
          extra
        )}
      >
        <span className="font-heading text-[13px] font-extrabold uppercase leading-tight tracking-wide text-white">{label}</span>
        {pays && <span className="text-[9px] leading-tight text-white/70">{pays}</span>}
        {others > 0 && <span className="text-[9px] font-bold leading-tight text-white/60" title="Other players' chips here">{short(others)}</span>}
        {mineHere + waiting > 0 && (
          <span className="pointer-events-none absolute -right-1.5 -top-2.5 flex flex-col items-center">
            <Chip value={stack[0] || 1} size={24} className={waiting && !mineHere ? "opacity-80" : ""} />
            <span className="-mt-1 rounded-full bg-black/80 px-1 text-[9px] font-bold leading-3 text-gold">{short(mineHere + waiting)}</span>
          </span>
        )}
      </button>
    );
  };

  return (
    <Panel title={SICBO_NAME}>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-mist">Round {round.toLocaleString()}</span>
        <span className="flex items-center gap-1.5 text-mist"><Users className="h-4 w-4" aria-hidden="true" /> {players.length} betting · <Points value={table.total_bet} iconSize={12} /></span>
      </div>

      <div className={cn("casino-felt mb-4 space-y-2.5 px-2.5 pb-9 pt-3 sm:px-4", myNet !== null && (myNet > 0 ? "win-glow" : myNet < 0 ? "loss-shake" : ""))} style={{ "--felt-hue": 150 }}>
        {/* the dice */}
        <div className="flex flex-col items-center">
          <div className={cn("flex h-[96px] items-end justify-center gap-4 pb-2", waitingToRoll && "dice-shake")}>
            {shownDice.map((v, i) => <Die3D key={i} value={v} rollKey={rollKey} ms={ROLL_MS - 500} index={i} size={56} />)}
          </div>
          <div className="min-h-[3.25rem] text-center" aria-live="polite">
            {betting && open && (
              <>
                <p className="text-sm text-white/80">Bets close in <span className="font-heading text-xl font-extrabold text-gold tabular-nums">{closeIn}</span> s</p>
                <div className="mx-auto mt-1 h-1.5 w-[200px] overflow-hidden rounded-full bg-black/50">
                  <div className="h-full bg-gold/80 transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (closeIn / (table.bet_seconds || 15)) * 100)}%` }} />
                </div>
              </>
            )}
            {(waitingToRoll || rolling) && <p className="font-heading text-base font-bold text-gold">No more bets. {rolling ? "The dice are rolling." : "Shaking the dice."}</p>}
            {showResult && !rolling && (
              <>
                <p className="font-heading text-xl font-extrabold leading-tight text-gold">
                  {dice.join(" + ")} = {diceTotal(dice)} · {isTriple(dice) ? "TRIPLE" : diceTotal(dice) >= 11 ? "BIG" : "SMALL"}
                </p>
                <p className="text-xs text-white/70">Next roll in {nextIn} s</p>
              </>
            )}
          </div>
        </div>

        {/* the board */}
        <div className="grid grid-cols-2 gap-1.5">
          {spot("small", "Small", "4 to 10 · 1 to 1")}
          {spot("big", "Big", "11 to 17 · 1 to 1")}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {spot("odd", "Odd", "1 to 1")}
          {spot("triple", "Any triple", `${SICBO_PAYS.triple} to 1`, "!border-ember/80")}
          {spot("even", "Even", "1 to 1")}
        </div>
        <div>
          <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-white/60">A number shows on 1, 2 or 3 dice: pays {SINGLE_PAYS[1]}, {SINGLE_PAYS[2]} or {SINGLE_PAYS[3]} to 1</p>
          <div className="grid grid-cols-6 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((n) => spot(`n${n}`, <MiniDie n={n} size={22} />, ""))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-white/60">Exact total of the three dice</p>
          <div className="grid grid-cols-7 gap-1">
            {TOTALS_LOW.map((n) => spot(`t${n}`, n, `${SICBO_PAYS[`t${n}`]}:1`))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {TOTALS_HIGH.map((n) => spot(`t${n}`, n, `${SICBO_PAYS[`t${n}`]}:1`))}
          </div>
        </div>

        {/* chips */}
        <div className="space-y-2 pt-2">
          <ChipTray chips={chips} selected={useChip} onSelect={setChip} onDrop={(id, value) => place(id, value)} disabled={!open || placing} />
          <p className="text-center text-[11px] text-white/60">Drag a chip onto the board, or tap a chip and then tap a spot.</p>
        </div>
      </div>

      {myNet !== null && (
        <p className={cn("mb-3 text-center font-heading text-lg font-bold", myNet >= 0 ? "text-jade" : "text-ember")} aria-live="polite">
          {myNet > 0 ? `Victory! +${myNet.toLocaleString()} points` : myNet === 0 ? "You broke even." : `Defeat. −${Math.abs(myNet).toLocaleString()} points`}
        </p>
      )}
      {error && <p role="alert" className="mb-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-center text-sm text-ember">{error}</p>}

      <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={undo} disabled={!history.length || placing} className="btn-bronze h-9 px-3 text-xs">Undo</button>
        <button type="button" onClick={clear} disabled={!pending.length || placing} className="btn-bronze h-9 px-3 text-xs">Clear</button>
        <button type="button" onClick={rebet} disabled={!lastBets || !open || placing} className="btn-bronze h-9 px-3 text-xs">Repeat last bets</button>
      </div>
      <button type="button" onClick={submit} disabled={!pending.length || !open || placing} className="btn-seal h-12 w-full text-base">
        {placing ? <><Loader2 className="h-4 w-4 animate-spin" /> Placing</> : pending.length ? <>Place bets · {pendingTotal.toLocaleString()}</> : placedTotal ? `You have ${placedTotal.toLocaleString()} on the table` : open ? "Put chips on the board" : "Wait for the next roll"}
      </button>

      {recent.length > 0 && (
        <div className="mt-4 flex items-center gap-2 overflow-hidden" aria-label="Recent rolls, newest first">
          <span className="shrink-0 text-xs text-mist">Last</span>
          {recent.slice(0, 9).map((d, i) => {
            const t = diceTotal(d);
            return (
              <span key={i} className={cn("flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full px-1.5 font-heading text-xs font-bold", isTriple(d) ? "bg-ember text-white" : t >= 11 ? "bg-[#C8161D] text-white" : "bg-[#1F5FD0] text-white", i === 0 && "ring-1 ring-gold")} title={`${d.join(" · ")} = ${t}`}>
                {t}
              </span>
            );
          })}
          <span className="ml-auto shrink-0 text-[10px] text-mist"><b className="text-[#6FA0FF]">blue</b> small · <b className="text-[#FF6B70]">red</b> big</span>
        </div>
      )}

      <details className="mt-4 rounded border border-bronze/30 bg-black/30 px-2.5 py-2">
        <summary className="cursor-pointer text-sm text-gold">How Dragon Sic Bo works and what it pays</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-mist">
          <li>Everyone has {table.bet_seconds || 15} seconds to bet, then three dice are rolled for the whole table.</li>
          <li><b className="text-[hsl(var(--foreground))]">Small</b> (total 4 to 10), <b className="text-[hsl(var(--foreground))]">Big</b> (11 to 17), <b className="text-[hsl(var(--foreground))]">Odd</b> and <b className="text-[hsl(var(--foreground))]">Even</b> pay 1 to 1. All four lose when the dice are a triple.</li>
          <li><b className="text-[hsl(var(--foreground))]">Any triple</b> (all three dice the same) pays {SICBO_PAYS.triple} to 1.</li>
          <li><b className="text-[hsl(var(--foreground))]">A number</b> pays {SINGLE_PAYS[1]} to 1 if it shows on one die, {SINGLE_PAYS[2]} to 1 on two, {SINGLE_PAYS[3]} to 1 on all three.</li>
          <li><b className="text-[hsl(var(--foreground))]">Exact total</b> pays the number printed under it, from 6 to 1 (totals 10 and 11) up to 67 to 1 (totals 4 and 17).</li>
          <li>"33 to 1" means a bet of 10 wins 330 and you also get your 10 back. You can bet on as many spots as you like, up to {settings.max_bet.toLocaleString()} in a roll.</li>
          <li>Over time Small, Big, Odd and Even return 97.2% of what is staked, a number 96.3%, a triple 94.4%, and exact totals between 87.5% and 97.2%.</li>
        </ul>
      </details>
    </Panel>
  );
}