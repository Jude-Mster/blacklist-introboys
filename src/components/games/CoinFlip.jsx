import React, { useEffect, useState } from "react";
import Panel from "@/components/Panel";
import GameControls from "./GameControls";
import useGame from "./useGame";
import { coinMultiplier, edgeOf } from "@/lib/games";
import Coin, { SIDES, landOn } from "./Coin";
import CoinDuels from "./CoinDuels";
import { cn } from "@/lib/utils";

const SPIN_MS = 1500;

export default function CoinFlip({ settings, balance }) {
  const [mode, setMode] = useState("house");
  return (
    <Panel title="Blacklist Yin Yang Toss">
      <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Game mode">
        <button role="tab" aria-selected={mode === "house"} data-on={mode === "house"} onClick={() => setMode("house")} className="btn-bronze h-10 text-sm">
          Against the house
        </button>
        <button role="tab" aria-selected={mode === "duel"} data-on={mode === "duel"} onClick={() => setMode("duel")} className="btn-bronze h-10 text-sm">
          Duel a member
        </button>
      </div>
      {mode === "house" ? <HouseToss settings={settings} balance={balance} /> : <CoinDuels settings={settings} balance={balance} />}
    </Panel>
  );
}

function HouseToss({ settings, balance }) {
  const [choice, setChoice] = useState("heads");
  const [wager, setWager] = useState(settings.min_bet);
  const [rotation, setRotation] = useState(0);
  const game = useGame("coinflip", { revealMs: SPIN_MS });
  const mult = coinMultiplier(edgeOf(settings));

  // When the server answers, spin six full turns and land on the right face.
  useEffect(() => {
    if (!game.landing) return;
    setRotation((r) => landOn(r, game.landing.outcome.side));
  }, [game.landing]);

  const landed = game.result && game.result.outcome.side;

  return (
    <>
      <div
        className={cn(
          "relative mx-auto mb-5 flex h-52 items-center justify-center rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_40%,hsl(205_35%_16%),hsl(192_26%_6%))]",
          game.result && (game.result.won ? "win-glow" : "loss-shake")
        )}
        style={{ perspective: 800 }}
      >
        <Coin rotation={rotation} spinMs={SPIN_MS} spinning={game.busy} />
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
    </>
  );
}