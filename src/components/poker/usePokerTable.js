import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { errorText } from "@/lib/GuildContext";

const BETTING = ["preflop", "flop", "turn", "river"];

// Live state for one poker table: realtime updates, a slow poll as backup, and
// a nudge to the server when a turn timer or the next-hand pause runs out.
export default function usePokerTable(tableId) {
  const [state, setState] = useState(null); // { table, my_seat, my_cards }
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const inflight = useRef(false);
  const queued = useRef(false);
  const lastNudge = useRef(0);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    try {
      const res = await base44.functions.invoke("pokerAction", { action: "state", tableId });
      setState(res.data);
      setError("");
    } catch (e) {
      setError(errorText(e, "Lost the table. Retrying."));
    } finally {
      inflight.current = false;
      if (queued.current) {
        queued.current = false;
        refresh();
      }
    }
  }, [tableId]);

  useEffect(() => {
    refresh();
    let timer = null;
    let unsub = () => {};
    try {
      unsub = base44.entities.PokerTable.subscribe((ev) => {
        if ((ev.id || (ev.data && ev.data.id)) !== tableId) return;
        clearTimeout(timer);
        timer = setTimeout(refresh, 150); // lock writes come in bursts
      });
    } catch {
      /* polling below keeps things moving */
    }
    const poll = setInterval(refresh, 5000);
    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      unsub && unsub();
    };
  }, [tableId, refresh]);

  // One-second clock for the turn timer; ask the server to move on when time is up.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = state && state.table;
    if (!t) return;
    const due =
      (BETTING.includes(t.phase) && t.deadline && Date.parse(t.deadline) <= now) ||
      (t.phase === "showdown" && t.next_hand_at && Date.parse(t.next_hand_at) <= now);
    if (due && now - lastNudge.current > 2000) {
      lastNudge.current = now;
      refresh();
    }
  }, [now, state, refresh]);

  const send = useCallback(
    async (action, extra = {}) => {
      const res = await base44.functions.invoke("pokerAction", { action, tableId, ...extra });
      if (res.data && res.data.table) {
        setState((s) => ({ ...(s || {}), ...res.data, my_cards: res.data.my_cards ?? (s && s.my_cards) }));
      }
      refresh();
      return res.data;
    },
    [tableId, refresh]
  );

  return { state, error, now, refresh, send };
}