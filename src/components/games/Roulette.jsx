import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Undo2, RotateCcw, Repeat } from "lucide-react";
import Panel from "@/components/Panel";
import { Ingot } from "@/components/SealLogo";
import Wheel, { angleFor } from "./Wheel";
import useGame from "./useGame";
import { ROULETTE_ORDER, ROULETTE_PAYS, rouletteColor, betKey, betLabel } from "@/lib/games";
import { cn } from "@/lib/utils";

const SPIN_MS = 3600;
const COLORS = { red: "#A3161F", black: "#151B1D", green: "#2E7F5E" };
const SEGMENTS = ROULETTE_ORDER.map((n) => ({ label: String(n), color: COLORS[rouletteColor(n)], fontSize: 9 }));
const CHIP_VALUES = [10, 50, 100, 500, 1000, 5000];
const ROWS = Array.from({ length: 12 }, (_, r) => [r * 3 + 1, r * 3 + 2, r * 3 + 3]);

export default function Roulette({ settings, balance }) {
  const chips = useMemo(() => CHIP_VALUES.filter((v) => v <= settings.max_bet), [settings.max_bet]);
  const [chip, setChip] = useState(chips[Math.min(1, chips.length - 1)] || settings.min_bet);
  const [bets, setBets] = useState([]); // [{ type, value, amount }]
  const [history, setHistory] = useState([]); // stack of previous `bets` for undo
  const [lastSpin, setLastSpin] = useState(null);
  const [rotation, setRotation] = useState(0);
  const game = useGame("roulette", { revealMs: SPIN_MS + 150 });

  useEffect(() => {
    if (!game.landing) return;
    setRotation((r) => angleFor(game.landing.outcome.index, r, ROULETTE_ORDER.length, 5));
  }, [game.landing]);

  const total = bets.reduce((t, b) => t + b.amount, 0);
  const onBoard = useMemo(() => Object.fromEntries(bets.map((b) => [betKey(b), b.amount])), [bets]);
  const result = game.result && game.result.outcome;
  const hitKeys = new Set(result ? result.hits.map(betKey) : []);

  const place = (type, value) => {
    if (game.busy) return;
    if (total + chip > Math.min(settings.max_bet, balance)) return;
    setHistory((h) => [...h, bets]);
    setBets((bs) => {
      const k = betKey({ type, value });
      const found = bs.find((b) => betKey(b) === k);
      return found ? bs.map((b) => (betKey(b) === k ? { ...b, amount: b.amount + chip } : b)) : [...bs, { type, value, amount: chip }];
    });
  };
  const undo = () => {
    setBets(history[history.length - 1] || []);
    setHistory((h) => h.slice(0, -1));
  };
  const clear = () => {
    setHistory((h) => [...h, bets]);
    setBets([]);
  };
  const spin = async () => {
    setLastSpin(bets);
    const r = await game.play(total, { bets });
    if (r) {
      setBets([]);
      setHistory([]);
    }
  };
  const rebet = () => {
    if (!lastSpin) return;
    setHistory((h) => [...h, bets]);
    setBets(lastSpin);
  };

  const cell = (type, value, children, className, style) => {
    const k = betKey({ type, value });
    const amount = onBoard[k];
    const hit = hitKeys.has(k) || (result && type === "straight" && value === result.number);
    return (
      <button
        key={k}
        type="button"
        onClick={() => place(type, value)}
        disabled={game.busy}
        aria-label={`Bet on ${betLabel({ type, value })}${amount ? `, ${amount} placed` : ""}`}
        className={cn(
          "relative flex items-center justify-center border border-bronze/45 font-heading font-bold text-[hsl(43_60%_92%)] transition-[filter] hover:brightness-125 disabled:cursor-default",
          hit && "z-10 outline outline-2 outline-gold",
          className
        )}
        style={style}
      >
        {children}
        {amount > 0 && <Chip amount={amount} />}
      </button>
    );
  };

  const canSpin = total >= settings.min_bet && total <= settings.max_bet && total <= balance;

  return (
    <Panel title="Jade Roulette">
      <div
        className={cn(
          "mb-4 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_45%,hsl(160_30%_14%),hsl(192_26%_6%))] py-4",
          game.result && (game.result.won ? "win-glow" : "loss-shake")
        )}
      >
        <Wheel segments={SEGMENTS} rotation={rotation} spinMs={SPIN_MS} spinning={game.busy} size={250} highlight={result ? result.index : null} />
        <div className="mt-3 text-center" aria-live="polite">
          {result ? (
            <p className="text-sm text-mist">
              The ball lands on{" "}
              <span className="rounded px-2 py-0.5 font-heading font-extrabold text-[hsl(43_60%_92%)]" style={{ background: COLORS[result.color] }}>
                {result.number}
              </span>
            </p>
          ) : (
            <p className="text-sm text-mist">Tap the board to place chips, then spin.</p>
          )}
        </div>
      </div>

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
        <p className="flex items-center gap-1.5 text-sm">
          <span className="text-mist">On the board</span>
          <Ingot size={15} />
          <span className="font-heading text-lg font-bold text-gold tabular-nums">{total.toLocaleString()}</span>
        </p>
        <div className="flex gap-1.5">
          <IconBtn onClick={undo} disabled={game.busy || !history.length} label="Undo last chip"><Undo2 className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={clear} disabled={game.busy || !bets.length} label="Clear the board"><RotateCcw className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={rebet} disabled={game.busy || !lastSpin || bets.length > 0} label="Repeat last bets"><Repeat className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      {game.error && (
        <p role="alert" className="mt-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{game.error}</p>
      )}

      <button onClick={spin} disabled={game.busy || !canSpin} className="btn-seal mt-3 h-12 w-full text-base">
        {game.busy ? <><Loader2 className="h-4 w-4 animate-spin" /> The ball is rolling</> : total ? `Spin for ${total.toLocaleString()}` : "Place a chip to spin"}
      </button>
      {total > 0 && total < settings.min_bet && <p className="mt-1.5 text-xs text-mist">Put at least {settings.min_bet} on the board.</p>}

      <div aria-live="polite" className="mt-3 min-h-[1.5rem] text-center">
        {game.result && (
          <p className={cn("font-heading text-lg font-bold", game.result.net >= 0 ? "text-jade" : "text-ember")}>
            {game.result.net > 0
              ? `Victory! +${game.result.net.toLocaleString()} points`
              : game.result.net === 0
                ? "You broke even."
                : `Defeat. −${Math.abs(game.result.net).toLocaleString()} points`}
          </p>
        )}
      </div>
      {game.history.length > 0 && (
        <div className="mt-1 flex items-center gap-1.5 overflow-hidden" aria-label="Your last results">
          {game.history.map((h) => (
            <span key={h.key} className={cn("h-2.5 w-2.5 shrink-0 rotate-45 border", h.net >= 0 ? "border-jade bg-jade/70" : "border-ember/70 bg-ember/25")} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Chip({ amount }) {
  return (
    <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-dashed border-[hsl(43_70%_88%)] bg-gold px-1 text-[10px] font-extrabold text-[hsl(192_26%_7%)] shadow">
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