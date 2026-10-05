import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Square, FastForward } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import WagerInput from "./WagerInput";
import { Ingot } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { edgeOf } from "@/lib/games";
import { balanceHold } from "@/lib/balanceHold";
import { LINES, PAYTABLE, SCATTER_PAY, SCATTER_SPINS, FREE_MULTIPLIER, MAX_WIN_X, SYMBOLS, SYMBOL_IDS, prizeScale } from "@/lib/fortune";
import { cn } from "@/lib/utils";

// Blacklist Dragon's Fortune: 5 reels, 3 rows, 10 lines, wilds, scatters and free spins.
// The server decides the paid spin and every free spin it wins in one answer; this
// page plays them back one at a time and only then shows the new balance.
const CELL = 58;           // px per symbol
const FILLER = 14;         // symbols each reel travels past
const ALL = [...SYMBOL_IDS, "wild", "scatter"];
const rand = () => ALL[Math.floor(Math.random() * ALL.length)];
const idleReel = () => [rand(), rand(), rand()];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const AUTO = [0, 10, 25, 50];

function Symbol({ id, size = 46, lit, dim }) {
  const s = SYMBOLS[id] || SYMBOLS.fire;
  return (
    <span
      className={cn("relative flex items-center justify-center rounded-md font-heading font-extrabold leading-none transition-[transform,opacity,box-shadow] duration-200", lit && "z-10 scale-110", dim && "opacity-35")}
      style={{
        width: size, height: size, fontSize: size * 0.56, color: s.fg,
        background: `radial-gradient(circle at 32% 26%, ${s.bg}, ${s.bg} 45%, rgba(0,0,0,0.55) 130%), ${s.bg}`,
        border: `2px solid ${lit ? "#F5C542" : "rgba(255,255,255,0.22)"}`,
        boxShadow: lit ? "0 0 14px 2px rgba(245,197,66,0.75)" : "inset 0 -6px 10px rgba(0,0,0,0.35)"
      }}
      lang="zh-Hant"
      role="img"
      aria-label={s.name}
    >
      {s.glyph}
      {s.tag && size >= 40 && (
        <span className="absolute inset-x-0 bottom-[1px] text-center font-body text-[8px] font-extrabold tracking-wider" style={{ color: s.fg }} lang="en">{s.tag}</span>
      )}
    </span>
  );
}

// A tiny picture of one payline.
function LineIcon({ rows, on }) {
  return (
    <span className="grid grid-cols-5 gap-[1px]" aria-hidden="true">
      {[0, 1, 2].flatMap((r) => rows.map((row, c) => <span key={`${r}-${c}`} className={cn("h-[5px] w-[7px] rounded-[1px]", row === r ? (on ? "bg-gold" : "bg-gold/70") : "bg-white/10")} />))}
    </span>
  );
}

export default function FortuneSlots({ settings, balance }) {
  const { setBalance, reload } = useGuild();
  const [wager, setWager] = useState(settings.min_bet);
  const [strips, setStrips] = useState(() => Array.from({ length: 5 }, idleReel));
  const stripsRef = useRef(strips);
  const [offsets, setOffsets] = useState([0, 0, 0, 0, 0]);
  const [moving, setMoving] = useState(false);
  const [quick, setQuick] = useState(false);       // free spins turn faster
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(null);           // the spin whose wins are lit: { lines, scatter, win, free }
  const [banner, setBanner] = useState("");
  const [free, setFree] = useState(null);           // { left, total } while free spins play
  const [roundWin, setRoundWin] = useState(0);      // running total for this paid spin
  const [last, setLast] = useState(null);           // { payout, wager, freeSpins } when a round is over
  const [auto, setAuto] = useState(0);              // autoplay spins chosen
  const [autoLeft, setAutoLeft] = useState(0);
  const skip = useRef(false);
  const stopAuto = useRef(false);
  const alive = useRef(true);
  const shown = useRef(balance);                    // balance on screen while a round plays
  useEffect(() => () => { alive.current = false; balanceHold.active = false; }, []);
  useEffect(() => { if (!busy) shown.current = balance; }, [balance, busy]);

  const scale = prizeScale(edgeOf(settings));
  const canPlay = wager >= settings.min_bet && wager <= settings.max_bet && wager <= balance;
  const stopMs = (i) => (quick ? 420 + i * 150 : 900 + i * 280);

  // Spin the reels so `grid` (grid[reel][row]) ends up showing.
  const land = useCallback(async (grid, fast) => {
    setView(null);
    setQuick(fast);
    setMoving(false);
    const next = stripsRef.current.map((s, i) => [...s.slice(-3), ...Array.from({ length: FILLER + i * 3 }, rand), ...grid[i]]);
    stripsRef.current = next;
    setStrips(next);
    setOffsets([0, 0, 0, 0, 0]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!alive.current) return;
    setMoving(true);
    setOffsets(next.map((s) => (s.length - 3) * CELL));
    const total = (fast ? 420 + 4 * 150 : 900 + 4 * 280) + 120;
    await wait(skip.current ? 80 : total);
    // Settle: keep only the final three so the next spin starts from them.
    setMoving(false);
    stripsRef.current = grid.map((col) => [...col]);
    setStrips(stripsRef.current);
    setOffsets([0, 0, 0, 0, 0]);
  }, []);

  const playRound = useCallback(async (stake) => {
    setError("");
    setLast(null);
    setRoundWin(0);
    setFree(null);
    setBanner("");
    skip.current = false;
    balanceHold.active = true;
    let r;
    try {
      const res = await base44.functions.invoke("playGame", { game: "fortune", wager: stake });
      r = res.data;
    } catch (e) {
      balanceHold.active = false;
      setError(errorText(e, "The spin didn't go through. Try again."));
      return null;
    }
    // The stake leaves the balance now; the winnings arrive when the reels have shown them.
    setBalance(Math.max(0, shown.current - stake));
    const spins = r.outcome.spins;
    let total = 0, freeLeft = 0, freeTotal = 0;
    for (let i = 0; i < spins.length && alive.current; i++) {
      const s = spins[i];
      if (s.free) { freeLeft--; setFree({ left: freeLeft, total: freeTotal }); }
      await land(s.grid, s.free);
      if (!alive.current) return r;
      total += s.win;
      setView(s);
      setRoundWin(total);
      if (s.scatter.spins > 0) {
        freeLeft += s.scatter.spins; freeTotal += s.scatter.spins;
        setFree({ left: freeLeft, total: freeTotal });
        setBanner(s.free ? `+${s.scatter.spins} more free spins!` : `${s.scatter.spins} free spins! Every win is doubled.`);
        await wait(skip.current ? 300 : 2200);
        setBanner("");
      } else {
        await wait(skip.current ? 120 : s.win > 0 ? 1500 : s.free ? 450 : 350);
      }
    }
    if (!alive.current) return r;
    setFree(null);
    setView((v) => (v ? { ...v, done: true } : v));
    balanceHold.active = false;
    setBalance(r.balance);
    shown.current = r.balance;
    setLast({ payout: r.payout, wager: stake, freeSpins: r.outcome.free_spins });
    reload();
    return r;
  }, [land, reload, setBalance]);

  const spin = async () => {
    if (busy || !canPlay) return;
    setBusy(true);
    stopAuto.current = false;
    let left = auto;
    setAutoLeft(left);
    try {
      do {
        const r = await playRound(wager);
        if (!r || !alive.current) break;
        if (left > 0) { left--; setAutoLeft(left); }
        if (left > 0 && !stopAuto.current) {
          if (r.balance < wager) { setError("Autoplay stopped: not enough points for the next spin."); break; }
          await wait(700);
        }
      } while (left > 0 && !stopAuto.current && alive.current);
    } finally {
      if (alive.current) { setBusy(false); setAutoLeft(0); }
    }
  };

  // Which cells to light for the spin on show.
  const lit = useMemo(() => {
    const set = new Set();
    if (!view) return set;
    for (const l of view.lines) for (let c = 0; c < l.count; c++) set.add(`${c}-${LINES[l.line][c]}`);
    if (view.scatter.count >= 3) view.grid.forEach((col, c) => col.forEach((sym, r) => { if (sym === "scatter") set.add(`${c}-${r}`); }));
    return set;
  }, [view]);
  const winLines = view ? new Set(view.lines.map((l) => l.line)) : new Set();
  const pay = (mult) => Math.round((wager * mult * scale) / LINES.length);

  return (
    <Panel title="Dragon's Fortune">
      <div className={cn("relative mb-4 rounded-md border border-bronze/60 bg-[linear-gradient(180deg,hsl(356_45%_13%),hsl(0_0%_5%))] p-2 sm:p-3", last && last.payout > last.wager && "win-glow")}>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className={cn("rounded px-2 py-0.5 font-heading font-bold", free ? "bg-gold text-black" : "bg-black/40 text-mist")}>
            {free ? `FREE SPINS · ${free.left} left · wins ×${FREE_MULTIPLIER}` : "10 lines · wins pay left to right"}
          </span>
          <span className="flex items-center gap-1 font-heading font-bold text-gold tabular-nums" aria-live="polite">
            {busy || roundWin > 0 ? <>Win <Ingot size={13} /> {roundWin.toLocaleString()}</> : null}
          </span>
        </div>

        <div className="relative mx-auto grid w-fit grid-cols-5 gap-1 rounded bg-black/50 p-1">
          {strips.map((strip, i) => (
            <div key={i} className="relative overflow-hidden rounded-[4px] bg-[hsl(0_0%_100%/0.04)]" style={{ height: CELL * 3, width: CELL - 2 }}>
              <div
                style={{
                  transform: `translateY(-${offsets[i]}px)`,
                  transition: moving ? `transform ${skip.current ? 60 : stopMs(i)}ms cubic-bezier(0.12, 0.7, 0.25, 1.03)` : "none"
                }}
              >
                {strip.map((sym, j) => {
                  const row = j - (strip.length - 3);
                  const settled = !moving && strip.length === 3;
                  const on = settled && lit.has(`${i}-${j}`);
                  return (
                    <div key={j} className="flex items-center justify-center" style={{ height: CELL }} data-row={row}>
                      <Symbol id={sym} size={CELL - 10} lit={on} dim={settled && view && view.win > 0 && !on} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {banner && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded bg-black/75 p-3 text-center">
              <p className="font-heading text-xl font-extrabold text-gold">{banner}</p>
            </div>
          )}
        </div>

        <div className="mt-2 min-h-[3.25rem] text-center text-xs text-mist" aria-live="polite">
          {last && (
            <p className={cn("font-heading text-base font-bold", last.payout > last.wager ? "text-jade" : last.payout > 0 ? "text-gold" : "text-ember")}>
              {last.payout > last.wager ? `Victory! +${(last.payout - last.wager).toLocaleString()} points` : last.payout > 0 ? `Won back ${last.payout.toLocaleString()} of ${last.wager.toLocaleString()}` : `No win. −${last.wager.toLocaleString()} points`}
              {last.freeSpins > 0 && <span className="ml-1.5 text-xs font-normal text-mist">({last.freeSpins} free spins)</span>}
            </p>
          )}
          {view && view.win > 0 ? (
            <p>
              {view.lines.slice(0, 3).map((l) => `${l.count} × ${SYMBOLS[l.symbol].name}`).join(" · ")}
              {view.lines.length > 3 ? ` · +${view.lines.length - 3} more lines` : ""}
              {view.scatter.win > 0 ? `${view.lines.length ? " · " : ""}${view.scatter.count} Fortunes` : ""}
              <span className="ml-1.5 font-heading text-sm font-bold text-gold">+{view.win.toLocaleString()}</span>
            </p>
          ) : !last ? (
            <p>Match 3 or more from the left on any line. 3 Fortunes anywhere win free spins.</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={settings.max_bet} balance={balance} disabled={busy} />

        <div>
          <p className="label">Autoplay</p>
          <div className="grid grid-cols-4 gap-2">
            {AUTO.map((n) => (
              <button key={n} type="button" onClick={() => setAuto(n)} disabled={busy} aria-pressed={auto === n} data-on={auto === n} className="btn-bronze h-9 text-sm">
                {n === 0 ? "Off" : `${n} spins`}
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

        {busy ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { skip.current = true; }} className="btn-bronze h-12 text-sm"><FastForward className="h-4 w-4" aria-hidden="true" /> Skip ahead</button>
            <button type="button" onClick={() => { stopAuto.current = true; setAutoLeft(0); }} disabled={autoLeft === 0} className="btn-bronze h-12 text-sm">
              {autoLeft > 0 ? <><Square className="h-4 w-4" aria-hidden="true" /> Stop autoplay ({autoLeft})</> : <><Loader2 className="h-4 w-4 animate-spin" /> Spinning</>}
            </button>
          </div>
        ) : (
          <button type="button" onClick={spin} disabled={!canPlay} className="btn-seal h-12 w-full text-base">
            {auto ? `Spin ${auto} times` : "Spin"} · <Ingot size={15} /> {wager.toLocaleString()}
          </button>
        )}

        <details className="rounded-md border border-bronze/40 bg-black/20 px-3 py-2">
          <summary className="cursor-pointer text-sm text-mist">Paytable and rules</summary>
          <p className="mt-2 text-xs text-mist">Prizes for a bet of <span className="font-bold text-gold">{wager.toLocaleString()}</span>, per winning line:</p>
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr className="text-xs text-mist"><th className="py-1 text-left font-normal">Symbol</th><th className="text-right font-normal">3</th><th className="text-right font-normal">4</th><th className="text-right font-normal">5</th></tr>
            </thead>
            <tbody>
              {SYMBOL_IDS.map((id) => (
                <tr key={id} className="border-t border-bronze/20">
                  <td className="py-1"><span className="flex items-center gap-2"><Symbol id={id} size={26} /> {SYMBOLS[id].name}</span></td>
                  {PAYTABLE[id].map((m, k) => <td key={k} className="text-right font-heading font-bold text-gold tabular-nums">{pay(m).toLocaleString()}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 space-y-2 text-xs text-mist">
            <li className="flex items-start gap-2"><Symbol id="wild" size={26} /> <span><b className="text-[hsl(var(--foreground))]">Wild</b> appears on reels 2, 3 and 4 and stands in for any symbol except the Fortune.</span></li>
            <li className="flex items-start gap-2"><Symbol id="scatter" size={26} /> <span><b className="text-[hsl(var(--foreground))]">Fortune</b> pays anywhere on the reels. 3, 4 or 5 pay {[3, 4, 5].map((k) => Math.round(wager * SCATTER_PAY[k] * scale).toLocaleString()).join(" / ")} and win {SCATTER_SPINS[3]} / {SCATTER_SPINS[4]} / {SCATTER_SPINS[5]} free spins. Every win in a free spin is doubled, and free spins can win more free spins.</span></li>
            <li>A line wins when 3 or more of the same symbol run from the first reel with no gap. Only the longest run on each line pays. The most one spin and its free spins can return is {MAX_WIN_X.toLocaleString()}× the bet.</li>
          </ul>
          <p className="mt-3 text-xs text-mist">The 10 lines:</p>
          <div className="mt-1 grid grid-cols-5 gap-2">
            {LINES.map((rows, n) => (
              <span key={n} className={cn("flex flex-col items-center gap-1 rounded border p-1 text-[10px]", winLines.has(n) ? "border-gold text-gold" : "border-bronze/30 text-mist")}>
                <LineIcon rows={rows} on={winLines.has(n)} />
                {n + 1}
              </span>
            ))}
          </div>
        </details>
      </div>
    </Panel>
  );
}