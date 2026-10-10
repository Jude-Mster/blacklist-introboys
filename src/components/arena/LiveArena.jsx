import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, History, Radio } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { useGuild, errorText } from "@/lib/GuildContext";
import { simulate, LIMIT, DRAW_REFUND } from "@/lib/arenaEngine";
import { cn } from "@/lib/utils";
import { ArenaStage, FighterCard, BetSlip, MyBets, BetBoard, asFighter, fmt, fmtPrice, lookColor, useServerClock } from "./arenaUi";

// The Live Arena: one shared fight every few minutes between two members of the site, picked at random with
// random builds. Betting is open first, then every screen plays the same fight from the seed the server
// sends once betting closes. 180 seconds without a knockout is a Draw.
const OWED_KEY = "bi.arena.owed";

export default function LiveArena({ balance }) {
  const { setBalance, reload } = useGuild();
  const { now: sn, sync, serverNow } = useServerClock();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const tableRef = useRef(null), lastPoll = useRef(0), inFlight = useRef(false), changedAt = useRef(0), loaded = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [replay, setReplay] = useState(null);   // a past fight being watched again

  const collecting = useRef(false);
  const collect = useCallback(async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const res = await base44.functions.invoke("arenaAction", { action: "settle" });
      if (!(res.data && res.data.pending)) { try { localStorage.removeItem(OWED_KEY); } catch { /* private mode */ } }
      reload();
    } catch { /* tried again later */ } finally { setTimeout(() => { collecting.current = false; }, 2500); }
  }, [reload]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const asked = Date.now();
    lastPoll.current = asked;
    try {
      const res = await base44.functions.invoke("arenaAction", { action: "state" });
      const d = res.data;
      if (d && d.table && asked < changedAt.current) return;
      if (d && d.table) { sync(d.table.server_now); tableRef.current = d.table; loaded.current = true; setState(d); setLoadError(""); }
    } catch (e) {
      if (!loaded.current && !(e && e.rateLimited)) setLoadError(errorText(e, "Couldn't reach the arena."));
    } finally { inFlight.current = false; }
  }, [sync]);

  const jitter = useRef(400 + Math.floor(Math.random() * 1600));
  useEffect(() => {
    refresh();
    const poll = setInterval(() => {
      const t = tableRef.current, sn = serverNow();
      let wait = 3000;
      if (t) {
        const close = Date.parse(t.bets_close_at);
        const end = t.fight ? Date.parse(t.fight.ends_at) : 0, next = t.fight ? Date.parse(t.fight.next_at) : 0;
        // Before the close we don't know when the fight ends (that would give a Draw away): ask right after the close.
        const until = sn < close ? close : end && sn < end ? end : next || close;
        const every = sn < close ? 4000 : end && sn < end ? 15000 : 6000;
        const left = until - sn;
        wait = left > 0 ? Math.min(every, left + (until === next ? jitter.current : 300)) : 1500;
        // the fight is over on screen but the result hasn't been fetched yet
        if (end && sn >= end && !t.outcome) wait = Math.min(wait, 900);
      }
      if (Date.now() - lastPoll.current >= wait) refresh();
    }, 250);
    return () => clearInterval(poll);
  }, [refresh, serverNow]);

  const table = state && state.table;
  const owed = !!(state && state.owed);
  useEffect(() => { if (owed) collect(); }, [owed, state, collect]);
  useEffect(() => { try { if (localStorage.getItem(OWED_KEY)) collect(); } catch { /* private mode */ } }, [collect]);
  const round = table ? table.round_no : 0;
  useEffect(() => { setError(""); setNotice(""); }, [round]);

  const closeAt = table ? Date.parse(table.bets_close_at) : 0;
  const endAt = table && table.fight ? Date.parse(table.fight.ends_at) : 0;
  const nextAt = table && table.fight ? Date.parse(table.fight.next_at) : 0;
  const status = !table ? "" : sn < closeAt ? "betting" : !table.fight || sn < endAt ? "fighting" : "result";
  const open = status === "betting" && closeAt - sn > 700;

  // The two fighters, and the fight: a still one while betting is open, the real one once the seed is out.
  const fighters = useMemo(() => (table ? table.fighters.map((f) => asFighter(f)) : null), [table && table.round_no]);  
  const seed = table && table.fight ? table.fight.seed : null;
  const fight = useMemo(() => {
    if (!fighters) return null;
    return seed != null ? simulate(fighters[0], fighters[1], seed, { draws: true, limit: table.limit_seconds || LIMIT })
      : simulate(fighters[0], fighters[1], 1, { draws: true, limit: 0.2 });
  }, [fighters, seed]);  

  const liveSpec = useMemo(() => (fighters && fight ? { key: `live-${round}-${seed != null ? "fight" : "still"}`, a: fighters[0], b: fighters[1], fight } : null), [fighters, fight, round, seed]);
  const liveClock = useCallback(() => {
    const t = tableRef.current, now = serverNow();
    if (!t) return { idle: true };
    const close = Date.parse(t.bets_close_at);
    if (now < close) return { betting: true, betLeft: (close - now) / 1000 };
    if (!t.fight) return { idle: true, banner: "Betting is closed · the fight is about to start" };
    return { t: (now - close) / 1000 - (t.intro || 3) };
  }, [serverNow]);

  // A past fight, watched again from its seed.
  const replaySpec = useMemo(() => {
    if (!replay) return null;
    const a = { ...replay.builds[0], name: replay.f[0].name, look: replay.f[0].look, avatar: replay.f[0].avatar };
    const b = { ...replay.builds[1], name: replay.f[1].name, look: replay.f[1].look, avatar: replay.f[1].avatar };
    return { key: `replay-${replay.r}-${replay.started}`, a, b, fight: simulate(a, b, replay.seed, { draws: true }) };
  }, [replay]);
  const replayClock = useCallback(() => (replay ? { t: (Date.now() - replay.started) / 1000 - 3 } : { idle: true }), [replay]);

  if (!table) {
    return (
      <Panel title="Live Arena">
        {loadError ? (
          <div className="py-6 text-center">
            <p role="alert" className="text-sm text-ember">{loadError}</p>
            <button type="button" onClick={refresh} className="btn-bronze mx-auto mt-4 h-10 px-5 text-sm">Try again</button>
          </div>
        ) : <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Opening the arena</p>}
      </Panel>
    );
  }

  const names = fighters.map((f) => f.name);
  const outcome = status === "result" ? table.outcome : null;
  const mine = state.mine;
  const placed = mine ? mine.amount || 0 : 0;
  const myRow = (state.bets || []).find((p) => p.mine);
  const myNet = outcome && myRow && myRow.done ? myRow.net : null;

  const place = async (lines) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await base44.functions.invoke("arenaAction", { action: "bet", round, lines });
      try { localStorage.setItem(OWED_KEY, "1"); } catch { /* private mode */ }
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      changedAt.current = Date.now();
      setState((s) => (s ? { ...s, mine: res.data.mine } : s));
      setNotice(lines.length > 1 ? `${lines.length} bets are on.` : "Your bet is on.");
      refresh();
      return true;
    } catch (e) {
      setError(errorText(e, "That bet didn't go on. Try again."));
      changedAt.current = Date.now(); setTimeout(refresh, 300);
      return false;
    } finally { setBusy(false); }
  };
  const remove = async (payload) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await base44.functions.invoke("arenaAction", { action: "remove", round, ...payload });
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      changedAt.current = Date.now();
      setState((s) => (s ? { ...s, mine: res.data.mine } : s));
      refresh();
    } catch (e) { setError(errorText(e, "That bet couldn't be taken back.")); changedAt.current = Date.now(); setTimeout(refresh, 300); }
    finally { setBusy(false); }
  };

  const closeIn = Math.max(0, Math.ceil((closeAt - sn) / 1000));
  const nextIn = Math.max(0, Math.ceil((nextAt - sn) / 1000));
  const resultText = outcome ? (outcome.draw ? `Draw: no knockout in ${table.limit_seconds || LIMIT} seconds` : `${names[outcome.winner]} wins ${outcome.how === "ko" ? "by KO" : "on time"} in ${outcome.length.toFixed(1)} s`) : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <ArenaStage spec={replaySpec || liveSpec} clock={replaySpec ? replayClock : liveClock} logTitle={replaySpec ? "Fight log (replay)" : "Fight log"} />
        {replay && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/50 bg-gold/10 px-3 py-2 text-sm">
            <span>Replay of fight {fmt(replay.r)}: {replay.f[0].name} vs {replay.f[1].name}</span>
            <button type="button" onClick={() => setReplay(null)} className="btn-seal h-9 px-4 text-sm"><Radio className="h-4 w-4" /> Back to live</button>
          </div>
        )}

        <div className={cn("rounded-md border border-bronze/45 bg-black/40 px-3 py-2.5", myNet > 0 && "win-glow")} aria-live="polite">
          {status === "betting" && (open ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-sm text-mist">Fight {fmt(round)} · betting closes in <span className="font-heading text-xl font-extrabold tabular-nums text-gold">{closeIn}</span> s</p>
              <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-black/60">
                <div className="h-full bg-gold/80 transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (closeIn / (table.bet_seconds || 120)) * 100)}%` }} />
              </div>
            </div>
          ) : <p className="font-heading text-base font-bold text-gold">Betting is closed. The fighters step into the ring.</p>)}
          {status === "fighting" && <p className="font-heading text-base font-bold text-gold">Fight {fmt(round)} in progress · {names[0]} vs {names[1]}</p>}
          {status === "result" && (
            <div className="space-y-1">
              <p className="font-heading text-base font-bold text-gold">{resultText}</p>
              <p className="text-xs text-mist">
                {myNet !== null && <b className={cn("mr-2 font-heading text-sm", myNet > 0 ? "text-gold" : myNet < 0 ? "text-ember" : "text-mist")}>{myNet > 0 ? `You won +${fmt(myNet)} points!` : myNet === 0 ? "You broke even." : `You lost ${fmt(Math.abs(myNet))} points.`}</b>}
                Next fight in {nextIn} s
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fighters.map((f, i) => (
            <FighterCard key={i} f={f} side={i ? "Fighter B" : "Fighter A"} highlight={outcome && outcome.winner === i}>
              <p className="mt-2 flex items-center justify-between border-t border-bronze/25 pt-2 text-sm">
                <span className="text-mist">To win</span><b className="font-heading text-gold">{fmtPrice(i ? table.odds.b : table.odds.a)}</b>
              </p>
            </FighterCard>
          ))}
        </div>

        {table.recent && table.recent.length > 0 && (
          <Panel title="Match history">
            <ul className="divide-y divide-bronze/25">
              {table.recent.map((r) => (
                <li key={r.r} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-mist">Fight {fmt(r.r)}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {r.f.map((f, i) => (
                      <React.Fragment key={i}>
                        {i === 1 && <span className="text-xs text-mist">vs</span>}
                        <span className={cn("flex min-w-0 items-center gap-1", r.winner === i ? "font-bold text-gold" : r.winner === -1 ? "" : "text-mist")}>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: lookColor(f.look) }} aria-hidden="true" />
                          <span className="truncate">{f.name}</span>
                        </span>
                      </React.Fragment>
                    ))}
                  </span>
                  <span className="shrink-0 text-xs text-mist">{r.winner === -1 ? "Draw" : r.how === "ko" ? "KO" : "Time"} · {Number(r.length).toFixed(0)} s</span>
                  {r.seed != null && r.builds && (
                    <button type="button" onClick={() => setReplay({ ...r, started: Date.now() })} className="flex h-8 shrink-0 items-center gap-1 rounded border border-bronze/45 px-2 text-xs text-mist hover:border-gold hover:text-gold">
                      <History className="h-3.5 w-3.5" /> Watch
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <BetSlip fightKey={round} odds={table.odds} names={names} draws open={open} closedText={status === "betting" ? "Betting is closing" : "Wait for the next fight"}
          limit={table.limit || 5000} minBet={table.min_bet || 1} placed={placed} balance={balance} onPlace={place} busy={busy} error={error} notice={notice} />
        <MyBets mine={mine} names={names} outcome={outcome} open={open} busy={busy} onRemove={remove} />
        <BetBoard board={state} names={names} done={!!outcome} />
        <details className="rounded border border-bronze/30 bg-black/30 px-2.5 py-2">
          <summary className="cursor-pointer text-sm text-gold">How the Live Arena works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-mist">
            <li>A new fight about every 3 minutes between two members of the site picked at random, each with a random build: entries, weapon level, buff skills, pet and mount.</li>
            <li>Betting is open for {table.bet_seconds || 120} seconds. Then every screen plays the same fight, decided by the server before betting opened.</li>
            <li>Bet on {names[0]}, {names[1]} or a Draw, and add side bets. You can bet {fmt(table.min_bet || 1)} to {fmt(table.limit || 5000)} on one fight and take bets back until betting closes.</li>
            <li>A fight lasts at most {table.limit_seconds || LIMIT} seconds. No knockout by then is a <b className="text-[hsl(var(--foreground))]">Draw</b>: Draw bets win at their higher price, and bets on either fighter get {Math.round(DRAW_REFUND * 100)}% of the stake back.</li>
            <li>The price is what you get back for each point, your stake included: 100 at 1.80× returns 180. Winnings are paid as soon as the fight ends, even if you leave the page.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
