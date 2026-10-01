import React, { useEffect, useState } from "react";
import Panel from "@/components/Panel";
import GameControls from "./GameControls";
import useGame from "./useGame";
import SlotSymbol, { SYMBOL_NAME } from "./SlotSymbol";
import { SLOT_SYMBOLS, SLOT_PAYOUTS } from "@/lib/games";
import { cn } from "@/lib/utils";

const ROW = 64; // px per symbol
const STRIP = 20; // symbols each reel travels past
const STOP_MS = [1000, 1350, 1700]; // reels stop left to right

const rand = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
const idle = () => [rand(), rand(), rand()];

export default function LanternSlots({ settings, balance }) {
  const [wager, setWager] = useState(settings.min_bet);
  // Each reel is a strip of symbols; the middle visible row is the payline.
  const [strips, setStrips] = useState(() => [idle(), idle(), idle()]);
  const [offsets, setOffsets] = useState([0, 0, 0]);
  const [moving, setMoving] = useState(false);
  const game = useGame("lanternslots", { revealMs: STOP_MS[2] + 100 });

  useEffect(() => {
    if (!game.landing) return;
    const finals = game.landing.outcome.reels;
    // New strips: what's showing now on top, random filler, then [final, filler] at the bottom.
    const next = strips.map((s, i) => {
      const top = s.slice(Math.round(offsets[i] / ROW), Math.round(offsets[i] / ROW) + 3);
      const filler = Array.from({ length: STRIP + i * 4 }, rand);
      return [...top, ...filler, rand(), finals[i], rand()];
    });
    setMoving(false);
    setStrips(next);
    setOffsets([0, 0, 0]);
    // Next frame: slide each strip so the final symbol sits on the payline.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setMoving(true);
        setOffsets(next.map((s) => (s.length - 3) * ROW));
      })
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.landing]);

  const won = game.result ? game.result.won : null;
  const tier = game.result ? game.result.outcome.tier : null;

  return (
    <Panel title="Lantern Slots">
      <div
        className={cn(
          "relative mb-5 rounded-md border border-bronze/60 bg-[linear-gradient(180deg,hsl(356_40%_14%),hsl(192_26%_6%))] p-3",
          game.result && (won ? "win-glow" : "loss-shake")
        )}
      >
        <div className="grid grid-cols-3 gap-2">
          {strips.map((strip, i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-[4px] border border-bronze/50 bg-[hsl(43_30%_88%/0.06)]"
              style={{ height: ROW * 3 }}
            >
              <div
                style={{
                  transform: `translateY(-${offsets[i]}px)`,
                  transition: moving ? `transform ${STOP_MS[i]}ms cubic-bezier(0.12, 0.7, 0.25, 1.04)` : "none"
                }}
              >
                {strip.map((sym, j) => (
                  <div key={j} className="flex items-center justify-center" style={{ height: ROW }}>
                    <SlotSymbol id={sym} size={44} />
                  </div>
                ))}
              </div>
              {/* fade top and bottom rows so the payline reads */}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(192_26%_6%/0.85),transparent_34%,transparent_66%,hsl(192_26%_6%/0.85))]" />
            </div>
          ))}
        </div>
        {/* payline */}
        <div className="pointer-events-none absolute inset-x-1 top-1/2 h-[66px] -translate-y-1/2 rounded border-y-2 border-gold/70" />
        <span className="absolute -left-1 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border border-gold bg-crimson" />
        <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border border-gold bg-crimson" />
      </div>

      <GameControls
        settings={settings}
        balance={balance}
        wager={wager}
        setWager={setWager}
        game={game}
        onPlay={() => game.play(wager)}
        playLabel="Spin the reels"
        busyLabel="Spinning"
      >
        <details className="rounded-md border border-bronze/40 bg-black/20 px-3 py-2">
          <summary className="cursor-pointer text-sm text-mist">Payouts</summary>
          <ul className="mt-2 space-y-1.5 pb-1">
            {SLOT_PAYOUTS.map((p) => {
              const hit = tier && ((p.combo && tier === `3${p.combo[0]}`) || (!p.combo && tier === "pair"));
              return (
                <li key={p.label} className={cn("flex items-center justify-between gap-2 rounded px-1 text-sm", hit && "bg-jade/15")}>
                  <span className="flex items-center gap-1">
                    {p.combo ? (
                      p.combo.map((s, k) => <SlotSymbol key={k} id={s} size={22} />)
                    ) : (
                      <span className="text-mist">Any two the same</span>
                    )}
                    <span className="sr-only">{p.label}</span>
                  </span>
                  <span className="font-heading font-bold text-gold tabular-nums">{p.mult}×</span>
                </li>
              );
            })}
          </ul>
        </details>
        <p className="sr-only" aria-live="polite">
          {game.result ? game.result.outcome.reels.map((r) => SYMBOL_NAME[r] || r).join(", ") : ""}
        </p>
      </GameControls>
    </Panel>
  );
}