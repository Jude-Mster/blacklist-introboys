import React, { useEffect, useState } from "react";
import Panel from "@/components/Panel";
import GameControls from "./GameControls";
import useGame from "./useGame";
import { coinMultiplier, edgeOf } from "@/lib/games";
import { cn } from "@/lib/utils";

const SIDES = [
  { id: "heads", name: "Yang", glyph: "陽" },
  { id: "tails", name: "Yin", glyph: "陰" }
];
const SPIN_MS = 1500;

export default function CoinFlip({ settings, balance }) {
  const [choice, setChoice] = useState("heads");
  const [wager, setWager] = useState(settings.min_bet);
  const [rotation, setRotation] = useState(0);
  const game = useGame("coinflip", { revealMs: SPIN_MS });
  const mult = coinMultiplier(edgeOf(settings));

  // When the server answers, spin six full turns and land on the right face.
  useEffect(() => {
    if (!game.landing) return;
    setRotation((r) => {
      const base = Math.ceil(r / 360) * 360 + 360 * 6;
      return base + (game.landing.outcome.side === "tails" ? 180 : 0);
    });
  }, [game.landing]);

  const landed = game.result && game.result.outcome.side;

  return (
    <Panel title="Yin Yang Toss">
      <div
        className={cn(
          "relative mx-auto mb-5 flex h-52 items-center justify-center rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_40%,hsl(205_35%_16%),hsl(192_26%_6%))]",
          game.result && (game.result.won ? "win-glow" : "loss-shake")
        )}
        style={{ perspective: 800 }}
      >
        <div
          className="relative h-32 w-32"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateY(${rotation}deg)`,
            transition: game.busy ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.6, 0.2, 1)` : "none"
          }}
        >
          <Face side={SIDES[0]} />
          <Face side={SIDES[1]} back />
        </div>
        {landed && (
          <p className="absolute bottom-3 text-sm text-mist">
            Landed on <span className="font-bold text-gold">{landed === "heads" ? "Yang" : "Yin"}</span>
          </p>
        )}
      </div>

      <GameControls
        settings={settings}
        balance={balance}
        wager={wager}
        setWager={setWager}
        game={game}
        onPlay={() => game.play(wager, choice)}
        playLabel="Toss the coin"
        busyLabel="Tossing"
        potential={Math.round(wager * mult)}
      >
        <div>
          <p className="label">Your call · pays {mult}×</p>
          <div className="grid grid-cols-2 gap-2">
            {SIDES.map((s) => (
              <button
                key={s.id}
                type="button"
                data-on={choice === s.id}
                aria-pressed={choice === s.id}
                onClick={() => setChoice(s.id)}
                disabled={game.busy}
                className="btn-bronze h-12 text-base"
              >
                <span className="font-heading text-lg" lang="zh-Hant">{s.glyph}</span> {s.name}
              </button>
            ))}
          </div>
        </div>
      </GameControls>
    </Panel>
  );
}

function Face({ side, back }) {
  const yang = side.id === "heads";
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-full"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
        background: yang
          ? "radial-gradient(circle at 35% 30%, #F6E2A8, #D8B46A 45%, #8A6A3E)"
          : "radial-gradient(circle at 35% 30%, #4A5A62, #1E282C 55%, #0B1012)",
        border: `3px solid ${yang ? "#8A6A3E" : "#D8B46A"}`,
        boxShadow: "inset 0 0 0 6px rgba(0,0,0,0.18), 0 10px 30px -8px rgba(0,0,0,0.8)"
      }}
    >
      <span className="absolute inset-3 rounded-full border" style={{ borderColor: yang ? "#8A6A3E99" : "#D8B46A66" }} />
      {/* square hole of an old cash coin */}
      <span className="absolute h-5 w-5 border-2" style={{ borderColor: yang ? "#8A6A3E" : "#D8B46A88", background: yang ? "#B8934F" : "#141C1E" }} />
      <span
        className="absolute top-4 font-heading text-2xl font-extrabold"
        style={{ color: yang ? "#5A4020" : "#D8B46A" }}
        lang="zh-Hant"
      >
        {side.glyph}
      </span>
      <span className="absolute bottom-4 text-[11px] font-bold tracking-[0.2em]" style={{ color: yang ? "#5A4020" : "#D8B46Acc" }}>
        {side.name.toUpperCase()}
      </span>
    </div>
  );
}