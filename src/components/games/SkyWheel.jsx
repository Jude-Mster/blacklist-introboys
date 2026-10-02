import React, { useEffect, useState } from "react";
import Panel from "@/components/Panel";
import GameControls from "./GameControls";
import useGame from "./useGame";
import Wheel, { angleFor } from "./Wheel";
import { WHEEL_SEGMENTS, FACTIONS, wheelMultiplier, edgeOf } from "@/lib/games";
import { cn } from "@/lib/utils";

const SPIN_MS = 3200;
const SEGMENTS = WHEEL_SEGMENTS.map((id) => ({ label: FACTIONS[id].glyph, color: FACTIONS[id].color }));
const PICKS = ["guanyin", "fujin", "jinong", "dragon"];

export default function SkyWheel({ settings, balance }) {
  const [pick, setPick] = useState("guanyin");
  const [wager, setWager] = useState(settings.min_bet);
  const [rotation, setRotation] = useState(0);
  const game = useGame("skywheel", { revealMs: SPIN_MS + 100 });
  const edge = edgeOf(settings);
  const mult = wheelMultiplier(pick, edge);

  useEffect(() => {
    if (!game.landing) return;
    setRotation((r) => angleFor(game.landing.outcome.index, r, WHEEL_SEGMENTS.length));
  }, [game.landing]);

  const landed = game.result ? game.result.outcome.landed : null;

  return (
    <Panel title="Blacklist Twelve Skies Wheel">
      <div
        className={cn(
          "mb-5 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_45%,hsl(0_0%_16%),hsl(0_0%_6%))] py-5",
          game.result && (game.result.won ? "win-glow" : "loss-shake")
        )}
      >
        <Wheel
          segments={SEGMENTS}
          rotation={rotation}
          spinMs={SPIN_MS}
          spinning={game.busy}
          size={250}
          highlight={game.result ? game.result.outcome.index : null}
        />
        <p className="mt-3 text-center text-sm text-mist" aria-live="polite">
          {landed ? (
            <>
              The sky chose <span className="font-bold" style={{ color: FACTIONS[landed].color }}>{FACTIONS[landed].name}</span>
            </>
          ) : (
            "Four Guanyin, four Fujin, three Jinong and one Dragon."
          )}
        </p>
      </div>

      <GameControls
        settings={settings}
        balance={balance}
        wager={wager}
        setWager={setWager}
        game={game}
        onPlay={() => game.play(wager, pick)}
        playLabel="Spin the wheel"
        busyLabel="The sky turns"
        potential={Math.round(wager * mult)}
      >
        <div>
          <p className="label">Back a faction</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PICKS.map((id) => {
              const f = FACTIONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  data-on={pick === id}
                  aria-pressed={pick === id}
                  onClick={() => setPick(id)}
                  disabled={game.busy}
                  className="btn-bronze h-14 flex-col gap-0 text-sm"
                  style={pick === id ? { borderColor: f.color, boxShadow: `inset 0 0 0 1px ${f.color}55` } : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-heading text-base font-extrabold" style={{ color: f.color }} lang="zh-Hant">
                      {f.glyph}
                    </span>
                    {f.name}
                  </span>
                  <span className="text-xs text-mist">{wheelMultiplier(id, edge)}×</span>
                </button>
              );
            })}
          </div>
        </div>
      </GameControls>
    </Panel>
  );
}