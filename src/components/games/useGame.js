import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useGuild, errorText } from "@/lib/GuildContext";

// Shared play loop for every game.
// 1. send the bet; the server decides the result
// 2. `landing` holds the result while the animation plays
// 3. after `revealMs`, `result` is set, the balance updates, and the result joins the history strip
export default function useGame(game, { revealMs = 900 } = {}) {
  const { setBalance, reload } = useGuild();
  const [busy, setBusy] = useState(false);
  const [landing, setLanding] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const play = useCallback(
    async (wager, choice) => {
      if (busy) return null;
      setBusy(true);
      setError("");
      setResult(null);
      try {
        const res = await base44.functions.invoke("playGame", { game, wager, choice });
        const r = res.data;
        setLanding(r);
        await new Promise((resolve) => {
          timer.current = setTimeout(resolve, revealMs);
        });
        setResult(r);
        setBalance(r.balance);
        setHistory((h) => [{ won: r.won, net: r.net, key: Date.now() }, ...h].slice(0, 14));
        reload();
        return r;
      } catch (e) {
        setError(errorText(e, "The bet didn't go through. Try again."));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, game, revealMs, setBalance, reload]
  );

  return { play, busy, landing, result, error, history };
}