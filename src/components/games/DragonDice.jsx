import React, { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import Panel from "@/components/Panel";
import GameControls from "./GameControls";
import useGame from "./useGame";
import { diceChance, diceMultiplier, edgeOf } from "@/lib/games";
import { cn } from "@/lib/utils";

const ROLL_MS = 1100;

export default function DragonDice({ settings, balance }) {
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState("under");
  const [wager, setWager] = useState(settings.min_bet);
  const [shown, setShown] = useState(null); // number counting up during the roll
  const game = useGame("dragondice", { revealMs: ROLL_MS });

  const chance = diceChance(target, direction);
  const mult = diceMultiplier(chance, edgeOf(settings));

  // Count the number up to the real roll while the pearl slides along the track.
  useEffect(() => {
    if (!game.landing) return;
    const roll = game.landing.outcome.roll;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(t < 1 ? Math.max(1, Math.round(1 + (roll - 1) * eased + (Math.random() - 0.5) * 8 * (1 - t))) : roll);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game.landing]);

  const roll = game.landing ? game.landing.outcome.roll : null;
  const won = game.result ? game.result.won : null;
  // Win zone on the 1-100 track.
  const winFrom = direction === "under" ? 0 : target;
  const winTo = direction === "under" ? target - 1 : 100;

  return (
    <Panel title="Blacklist Dragon Dice">
      <div
        className={cn(
          "mb-5 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_0%,hsl(0_0%_16%),hsl(0_0%_6%))] px-4 pb-5 pt-4",
          game.result && (won ? "win-glow" : "loss-shake")
        )}
      >
        <div className="flex items-end justify-between">
          <Stat label="Win chance" value={`${chance}%`} />
          <div
            className={cn(
              "font-heading text-6xl font-extrabold tabular-nums leading-none",
              won === null ? "text-gold" : won ? "text-jade" : "text-ember"
            )}
            aria-live="polite"
          >
            {shown ?? <span className="text-mist/50">?</span>}
          </div>
          <Stat label="Payout" value={`${mult}×`} align="right" />
        </div>

        {/* track */}
        <div className="relative mt-6 h-3 rounded-full bg-ember/25">
          <div
            className="absolute inset-y-0 rounded-full bg-jade/70"
            style={{ left: `${winFrom}%`, width: `${Math.max(0, winTo - winFrom)}%` }}
          />
          {/* target marker */}
          <div className="absolute -top-1.5 h-6 w-0.5 bg-gold" style={{ left: `${target}%` }} />
          {/* rolled pearl: waits at the middle until the first roll */}
          <div
            className="absolute -top-2 h-7 w-7 -translate-x-1/2 rounded-full border-2 border-gold"
            style={{
              left: `${roll ?? 50}%`,
              opacity: roll === null ? 0.35 : 1,
              background: "radial-gradient(circle at 35% 30%, #F4F1E4, #9FD8CC 50%, #2E7F72)",
              boxShadow: roll === null ? "none" : "0 0 14px 2px hsl(150 55% 50% / 0.6)",
              transition: `left ${ROLL_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 300ms`
            }}
            aria-hidden="true"
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-mist/70 tabular-nums">
          <span>1</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      <GameControls
        settings={settings}
        balance={balance}
        wager={wager}
        setWager={setWager}
        game={game}
        onPlay={() => game.play(wager, { target, direction })}
        playLabel="Roll the dice"
        busyLabel="Rolling"
        potential={Math.round(wager * mult)}
      >
        <div>
          <label htmlFor="dice-target" className="label">
            Roll {direction} <span className="font-bold text-gold">{target}</span> to win
          </label>
          <input
            id="dice-target"
            type="range"
            min={2}
            max={98}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            disabled={game.busy}
            className="w-full accent-[hsl(var(--gold))]"
          />
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] gap-2">
            {["under", "over"].map((d, i) => (
              <React.Fragment key={d}>
                {i === 1 && (
                  <button
                    type="button"
                    onClick={() => setDirection(direction === "under" ? "over" : "under")}
                    disabled={game.busy}
                    className="btn-bronze h-11 w-11"
                    aria-label="Swap over and under"
                    title="Swap over and under"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  data-on={direction === d}
                  aria-pressed={direction === d}
                  onClick={() => setDirection(d)}
                  disabled={game.busy}
                  className="btn-bronze h-11 text-sm capitalize"
                >
                  Roll {d}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      </GameControls>
    </Panel>
  );
}

function Stat({ label, value, align }) {
  return (
    <div className={cn("min-w-[4.5rem]", align === "right" && "text-right")}>
      <p className="text-xs text-mist">{label}</p>
      <p className="font-heading text-lg font-bold text-gold tabular-nums">{value}</p>
    </div>
  );
}