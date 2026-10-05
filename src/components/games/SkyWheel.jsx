import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import WagerInput from "./WagerInput";
import Wheel, { angleFor } from "./Wheel";
import { useGuild, errorText } from "@/lib/GuildContext";
import { WHEEL_SEGMENTS, FACTIONS, wheelMultiplier, edgeOf } from "@/lib/games";
import { cn } from "@/lib/utils";

const SPIN_MS = 4500;
const POLL_MS = 2500;
const SEGMENTS = WHEEL_SEGMENTS.map((id) => ({ label: FACTIONS[id].glyph, color: FACTIONS[id].color }));
const PICKS = ["guanyin", "fujin", "jinong", "dragon"];

// One shared wheel for the whole guild. The server runs the rounds on a timer:
// betting -> spin -> result -> next round. Everyone sees the same spin.
export default function SkyWheel({ settings, balance }) {
  const { setBalance, reload } = useGuild();
  const [pick, setPick] = useState("guanyin");
  const [wager, setWager] = useState(settings.min_bet);
  const [state, setState] = useState(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const seenBetting = useRef(0);
  const animated = useRef(0);
  const inFlight = useRef(false);
  const edge = edgeOf(settings);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await base44.functions.invoke("wheelAction", { action: "state" });
      const d = res.data;
      if (d && d.table) {
        setOffset(Date.parse(d.table.server_now) - Date.now());
        setState(d);
        setLoadError("");
      }
    } catch (e) {
      setLoadError(errorText(e, "Couldn't reach the wheel."));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 250);
    let unsub = () => {};
    try {
      unsub = base44.entities.WheelTable.subscribe(() => refresh());
    } catch {
      /* polling covers it */
    }
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      unsub && unsub();
    };
  }, [refresh]);

  const table = state && state.table;
  const round = table ? table.round_no : 0;
  const serverNow = now + offset;

  // Spin the wheel when a round we watched gets its result.
  useEffect(() => {
    if (!table) return;
    if (table.status === "betting") {
      seenBetting.current = table.round_no;
      return;
    }
    if (animated.current === table.round_no) return;
    animated.current = table.round_no;
    const fresh = seenBetting.current === table.round_no || Date.now() + offset - Date.parse(table.settled_at) < 4000;
    if (!fresh) {
      setRotation((r) => angleFor(table.result_index, r, WHEEL_SEGMENTS.length, 0));
      setRevealed(table.round_no);
      return;
    }
    setSpinning(true);
    setRotation((r) => angleFor(table.result_index, r, WHEEL_SEGMENTS.length, 6));
    const t = setTimeout(() => {
      setSpinning(false);
      setRevealed(table.round_no);
      reload();
    }, SPIN_MS + 100);
    return () => {
      clearTimeout(t);
      setSpinning(false);
      animated.current = 0;
    };
  }, [table && table.round_no, table && table.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setError("");
  }, [round]);

  const betting = !!table && table.status === "betting";
  const closeIn = betting ? Math.max(0, Math.ceil((Date.parse(table.bets_close_at) - serverNow) / 1000)) : 0;
  const open = betting && Date.parse(table.bets_close_at) - serverNow > 1500;
  const showResult = !!table && table.status === "settled" && revealed === table.round_no;
  const nextIn = table && table.status === "settled" && table.next_at ? Math.max(0, Math.ceil((Date.parse(table.next_at) - serverNow) / 1000)) : 0;
  const betSeconds = 10; // must match BET_SECONDS in wheelAction

  const mine = state && state.mine && state.mine.round_no === round ? state.mine : null;
  const myBets = useMemo(() => Object.fromEntries(((mine && mine.bets) || []).map((b) => [b.faction, b.amount])), [mine]);
  const placedTotal = mine ? mine.amount : 0;
  const landed = showResult ? table.result_faction : null;

  const submit = async () => {
    if (!open || placing) return;
    setPlacing(true);
    setError("");
    try {
      const res = await base44.functions.invoke("wheelAction", { action: "bet", faction: pick, amount: wager });
      setBalance(res.data.balance);
      setState((s) => (s ? { ...s, mine: res.data.mine } : s));
      refresh();
    } catch (e) {
      setError(errorText(e, "That bet didn't go through. Try again."));
    } finally {
      setPlacing(false);
    }
  };

  if (!table) {
    return (
      <Panel title="Blacklist Twelve Skies Wheel">
        {loadError ? (
          <div className="py-6 text-center">
            <p role="alert" className="text-sm text-ember">{loadError}</p>
            <p className="mt-2 text-xs text-mist">If this keeps happening, the Guild Leader can run the system check in the admin hall.</p>
            <button onClick={refresh} className="btn-bronze mx-auto mt-4 h-10 px-5 text-sm">Try again</button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Finding the wheel</p>
        )}
      </Panel>
    );
  }

  const players = (state.bets || []).slice().sort((a, b) => b.amount - a.amount);
  const myRow = players.find((p) => p.mine);
  const myNet = showResult && myRow && myRow.settled ? myRow.net : null;
  const room = Math.max(0, settings.max_bet - placedTotal);
  const canBet = open && wager >= 1 && placedTotal + wager >= settings.min_bet && wager <= room && wager <= balance;

  return (
    <Panel title="Blacklist Twelve Skies Wheel">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-mist">Round {round.toLocaleString()}</span>
        <span className="flex items-center gap-1.5 text-mist"><Users className="h-4 w-4" aria-hidden="true" /> {players.length} in this spin</span>
      </div>
      <div
        className={cn(
          "mb-4 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_45%,hsl(0_0%_16%),hsl(0_0%_6%))] py-5",
          myNet !== null && (myNet > 0 ? "win-glow" : myNet < 0 ? "loss-shake" : "")
        )}
      >
        <Wheel segments={SEGMENTS} rotation={rotation} spinMs={SPIN_MS} spinning={spinning} size={250} highlight={showResult ? table.result_index : null} />
        <div className="mt-3 px-4 text-center" aria-live="polite">
          {betting && open && (
            <>
              <p className="text-sm text-mist">
                Bets close in <span className="font-heading text-xl font-extrabold text-gold tabular-nums">{closeIn}</span> s
              </p>
              <div className="mx-auto mt-2 h-1.5 max-w-[220px] overflow-hidden rounded-full bg-black/50">
                <div className="h-full bg-gold/80 transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (closeIn / betSeconds) * 100)}%` }} />
              </div>
            </>
          )}
          {((betting && !open) || spinning) && <p className="font-heading text-base font-bold text-gold">No more bets. The sky turns.</p>}
          {showResult && !spinning && (
            <p className="text-sm text-mist">
              The sky chose <span className="font-bold" style={{ color: FACTIONS[landed].color }}>{FACTIONS[landed].name}</span>
              <span className="ml-2">Next spin in {nextIn} s</span>
            </p>
          )}
        </div>
      </div>

      {myNet !== null && (
        <p className={cn("mb-3 text-center font-heading text-lg font-bold", myNet >= 0 ? "text-jade" : "text-ember")} aria-live="polite">
          {myNet > 0 ? `Victory! +${myNet.toLocaleString()} points` : myNet === 0 ? "You broke even." : `Defeat. −${Math.abs(myNet).toLocaleString()} points`}
        </p>
      )}

      {table.recent.length > 0 && (
        <div className="mb-4 flex items-center gap-1.5 overflow-hidden" aria-label="Recent results, newest first">
          <span className="shrink-0 text-xs text-mist">Last</span>
          {table.recent.slice(showResult || betting ? 0 : 1).map((f, i) => (
            <span
              key={`${f}-${i}`}
              title={FACTIONS[f].name}
              lang="zh-Hant"
              className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", i === 0 && "ring-1 ring-gold")}
              style={{ background: FACTIONS[f].color }}
            >
              {FACTIONS[f].glyph}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <p className="label">Back a faction</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PICKS.map((id) => {
              const f = FACTIONS[id];
              const on = myBets[id] || 0;
              return (
                <button
                  key={id}
                  type="button"
                  data-on={pick === id}
                  aria-pressed={pick === id}
                  onClick={() => setPick(id)}
                  className={cn("btn-bronze relative h-16 flex-col gap-0 text-sm", landed && landed !== id && "opacity-60")}
                  style={pick === id ? { borderColor: f.color, boxShadow: `inset 0 0 0 2px ${f.color}` } : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-heading text-base font-extrabold" style={{ color: f.color }} lang="zh-Hant">{f.glyph}</span>
                    {f.name}
                  </span>
                  <span className={cn("text-xs", pick === id ? "text-black/70" : "text-mist")}>{wheelMultiplier(id, edge)}×</span>
                  {on > 0 && (
                    <span className="absolute -right-1.5 -top-2 rounded-full border border-white bg-crimson px-1.5 text-[10px] font-bold leading-4 text-white">
                      {on.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={settings.max_bet} balance={balance} disabled={placing} />

        {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

        <button onClick={submit} disabled={!canBet || placing} className="btn-seal h-12 w-full text-base">
          {placing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Placing bet</>
          ) : !open ? (
            "Bets are closed for this spin"
          ) : (
            `Bet ${wager.toLocaleString()} on ${FACTIONS[pick].name} · win ${Math.round(wager * wheelMultiplier(pick, edge)).toLocaleString()}`
          )}
        </button>
        <p className="text-xs text-mist/80">
          {placedTotal > 0
            ? `You have ${placedTotal.toLocaleString()} on this spin. You can add more, or back another faction, until bets close.`
            : "Four Guanyin, four Fujin, three Jinong and one Dragon. A new spin starts by itself every round."}
        </p>
      </div>

      <div className="mt-5 border-t border-bronze/30 pt-3">
        <p className="label">In this spin · {Number(players.reduce((t, p) => t + p.amount, 0)).toLocaleString()} points in play</p>
        {players.length === 0 ? (
          <p className="text-sm text-mist">Nobody has bet on this spin yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {players.slice(0, 12).map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-sm">
                <Avatar url={p.avatar} name={p.name} size={22} />
                <span className={cn("min-w-0 flex-1 truncate", p.mine && "font-bold text-gold")}>{p.name}{p.mine ? " (you)" : ""}</span>
                <span className="flex shrink-0 gap-1" lang="zh-Hant">
                  {(p.bets || []).map((b) => (
                    <span key={b.faction} title={`${FACTIONS[b.faction].name}: ${b.amount}`} className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: FACTIONS[b.faction].color }}>
                      {FACTIONS[b.faction].glyph}
                    </span>
                  ))}
                </span>
                <span className="w-14 text-right tabular-nums text-mist">{p.amount.toLocaleString()}</span>
                {showResult && p.settled && (
                  <span className={cn("w-16 text-right font-bold tabular-nums", p.net > 0 ? "text-jade" : p.net < 0 ? "text-ember" : "text-mist")}>
                    {p.net > 0 ? "+" : p.net < 0 ? "−" : ""}{Math.abs(p.net).toLocaleString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}