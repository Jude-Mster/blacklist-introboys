import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Swords, History, Radio, Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { useGuild, errorText } from "@/lib/GuildContext";
import { simulate, normValues, LIMIT, ENGINE_VERSION } from "@/lib/arenaEngine";
import { cn } from "@/lib/utils";
import { ArenaStage, ReplayStage, FighterCard, BetSlip, MyBets, BetBoard, asFighter, fmt, fmtPrice, useServerClock, useWide } from "./arenaUi";
import { TitleTag, countdown } from "./TourExtras";

// 6.22 Grudge matches: challenge a member to a 1-on-1 for an equal points stake. Both fighters get equal
// random builds (same size, weapon, pet, mount level and number of skills; only which stats and skills come
// up is luck). Once accepted, everyone can bet for 60 seconds, then it's fought live. The winner takes both
// stakes less 5%.
const VALUES = normValues();
const OWED_KEY = "bi.arena.tour.owed";
const phaseOf = (g, sn) => (g.status !== "running" ? g.status : sn < Date.parse(g.close_at) ? "betting" : g.outcome || (g.end_at && sn >= Date.parse(g.end_at)) ? "result" : "fighting");
const fightersOf = (g) => (g.fighters ? g.fighters.map((x, i) => asFighter({ ...x, title: i ? g.opponent.title : g.challenger.title })) : null);

export default function GrudgeView({ balance, member, focusId, onCloseLink }) {
  const { setBalance, reload } = useGuild();
  const { now: sn, sync, serverNow } = useServerClock();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const inFlight = useRef(false), last = useRef(0), dataRef = useRef(null), withMembers = useRef(true);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; last.current = Date.now();
    const asked = Date.now();
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "grudges", members: withMembers.current });
      const d = res.data;
      sync(d.server_now, asked);
      setData((old) => { const n = { ...d, members: d.members || (old && old.members) || [] }; dataRef.current = n; return n; });
      withMembers.current = false;
      setErr("");
    } catch (e) { if (!dataRef.current) setErr(errorText(e, "Couldn't load the grudge matches.")); }
    finally { inFlight.current = false; }
  }, [sync]);
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.hidden) return;
      const d = dataRef.current, now = serverNow();
      let wait = 12000;
      const running = d && d.grudges.filter((g) => g.status === "running");
      if (running && running.length) {
        const marks = running.flatMap((g) => [g.close_at, g.end_at].filter(Boolean).map((x) => Date.parse(x))).filter((x) => x > now - 200).sort((a, b) => a - b);
        wait = marks.length ? Math.min(5000, Math.max(400, marks[0] - now + 400)) : 1500;
      }
      if (Date.now() - last.current >= wait) refresh();
    }, 300);
    return () => clearInterval(id);
  }, [refresh, serverNow]);

  // grudge bets are paid like tournament bets
  const collect = useCallback(async () => {
    try { const res = await base44.functions.invoke("tournamentAction", { action: "settle" }); if (!(res.data && res.data.pending)) { try { localStorage.removeItem(OWED_KEY); } catch { /* */ } } reload(); } catch { /* later */ }
  }, [reload]);
  const doneIds = data ? data.grudges.filter((g) => g.status === "done").map((g) => g.id).join() : "";
  useEffect(() => { let owed = false; try { owed = !!localStorage.getItem(OWED_KEY); } catch { /* */ } if (owed && doneIds) collect(); }, [doneIds, collect]);

  const [replay, setReplay] = useState(null);
  useEffect(() => { if (focusId && data) { const g = data.grudges.find((x) => x.id === focusId); if (g && g.status === "done") setReplay({ id: g.id, started: Date.now() }); } }, [focusId, !!data]);

  if (!data) {
    return <Panel title="Grudge matches">{err ? <p role="alert" className="text-sm text-ember">{err}</p> : <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>}</Panel>;
  }
  const gs = data.grudges;
  const live = gs.filter((g) => g.status === "running").sort((a, b) => Date.parse(a.open_at) - Date.parse(b.open_at));
  const incoming = gs.filter((g) => g.status === "open" && g.opponent.member_id === member.id);
  const outgoing = gs.filter((g) => g.status === "open" && g.challenger.member_id === member.id);
  const others = gs.filter((g) => g.status === "open" && g.opponent.member_id !== member.id && g.challenger.member_id !== member.id);
  const done = gs.filter((g) => g.status === "done");
  const shown = live.find((g) => g.id === focusId) || live[0] || null;
  const replayG = replay ? gs.find((g) => g.id === replay.id) : null;
  const focusDone = focusId && !live.some((g) => g.id === focusId) && !gs.some((g) => g.id === focusId);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0 space-y-4">
        {replayG ? <GrudgeReplay g={replayG} started={replay.started} onClose={() => { setReplay(null); if (focusId) onCloseLink(); }} />
          : shown ? <LiveGrudge key={shown.id} g={shown} sn={sn} serverNow={serverNow} balance={balance} setBalance={setBalance} refresh={refresh} />
          : (
            <Panel title="Grudge matches">
              <p className="text-sm">Settle it in the arena. Challenge any member to a 1-on-1 for an equal points stake. Both fighters get <b className="text-white">equal random builds</b>: the same number of random stats, the same weapon level, pet and mount level and the same number of skills; only which stats and skills come up is luck. Once accepted, everyone can bet for 60 seconds, then it's fought live. The winner takes both stakes less 5%.</p>
              {focusDone && <p className="mt-2 text-sm text-mist">That grudge match is older than the list here.</p>}
            </Panel>
          )}
        {live.length > 1 && <p className="text-sm text-mist">{live.length - 1} more grudge match{live.length > 2 ? "es" : ""} on after this one.</p>}
        {(incoming.length > 0 || outgoing.length > 0) && <Waiting incoming={incoming} outgoing={outgoing} sn={sn} balance={balance} setBalance={setBalance} refresh={refresh} reload={reload} />}
        <Panel title="Recent grudge matches">
          {done.length ? (
            <ul className="divide-y divide-bronze/25">
              {done.map((g) => {
                const w = g.winner === 0 ? g.challenger : g.opponent, l = g.winner === 0 ? g.opponent : g.challenger;
                return (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Avatar url={w.avatar} name={w.name} size={24} />
                    <span className="min-w-0 flex-1"><b className="text-gold">{w.name}</b> beat {l.name} · {fmt(g.stake)} each · {g.size} stats · won {fmt(g.prize)}</span>
                    {(g.engine || ENGINE_VERSION) === ENGINE_VERSION && <button type="button" onClick={() => { setReplay({ id: g.id, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="bk-watch h-7 px-2"><History className="h-3.5 w-3.5" /> Watch</button>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-mist">No grudge matches yet.</p>}
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        <Challenge data={data} balance={balance} setBalance={setBalance} refresh={refresh} />
        {others.length > 0 && (
          <Panel title="Waiting for an answer">
            <ul className="space-y-1.5 text-sm">
              {others.map((g) => <li key={g.id}><b>{g.challenger.name}</b> challenged <b>{g.opponent.name}</b> · {fmt(g.stake)} each · {g.size} stats{g.message ? <span className="block truncate text-xs italic text-mist">"{g.message}"</span> : null}</li>)}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Challenge({ data, balance, setBalance, refresh }) {
  const R = data.rules || { minStake: 100, maxStake: 50000, sizes: [10, 25, 50] };
  const [q, setQ] = useState("");
  const [opp, setOpp] = useState("");
  const [stake, setStake] = useState("1000");
  const [size, setSize] = useState(R.sizes[1] || 25);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const list = useMemo(() => (data.members || []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40), [data.members, q]);
  const n = Number(stake);
  const bad = !Number.isInteger(n) || n < R.minStake || n > R.maxStake;
  const send = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "challenge", opponent: opp, stake: n, size, message });
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      setMsg("Challenge sent. They have 24 hours to accept; your stake comes back if they don't."); setMessage(""); setOpp("");
      refresh();
    } catch (e) { setErr(errorText(e, "The challenge didn't go through.")); }
    finally { setBusy(false); }
  };
  const target = (data.members || []).find((m) => m.id === opp);
  return (
    <Panel title="Challenge someone">
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="g-q">Who</label>
          <input id="g-q" className="field h-10 w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" />
          <ul className="mt-1.5 max-h-40 overflow-auto rounded border border-bronze/40" role="listbox" aria-label="Members">
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" role="option" aria-selected={opp === m.id} onClick={() => setOpp(m.id)} className={cn("flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-gold/10", opp === m.id && "bg-gold/15 text-gold")}>
                  <Avatar url={m.avatar} name={m.name} size={20} /><span className="truncate">{m.name}</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="px-2 py-1.5 text-sm text-mist">No one found.</li>}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-mist">Stake each (points)
            <input type="text" inputMode="numeric" className="field mt-1 h-10 w-full tabular-nums" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} />
          </label>
          <div className="text-xs text-mist">Random stats each
            <div className="mt-1 flex gap-1" role="group" aria-label="Build size">
              {R.sizes.map((s) => <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)} className={cn("h-10 flex-1 rounded border text-sm font-bold", size === s ? "border-gold bg-gold/15 text-gold" : "border-bronze/50 text-mist")}>{s}</button>)}
            </div>
          </div>
        </div>
        <input className="field h-10 w-full" maxLength={120} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Trash talk (optional)" aria-label="Message" />
        <p className="text-xs text-mist">{fmt(R.minStake)} to {fmt(R.maxStake)} points. The winner gets {bad ? "both stakes" : fmt(Math.floor(n * 2 * 0.95))} (both stakes less 5%).</p>
        <button type="button" onClick={send} disabled={busy || !opp || bad || n > balance} className="btn-seal h-11 w-full px-4">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Swords className="h-4 w-4" /> {target ? `Challenge ${target.name} · ${fmt(n || 0)} pts` : "Pick someone to challenge"}</>}
        </button>
        {msg && <p role="status" className="text-sm text-gold">{msg}</p>}
        {err && <p role="alert" className="text-sm text-ember">{err}</p>}
      </div>
    </Panel>
  );
}

function Waiting({ incoming, outgoing, sn, balance, setBalance, refresh, reload }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const act = async (action, g) => {
    setBusy(action + g.id); setErr("");
    try {
      const res = await base44.functions.invoke("tournamentAction", { action, id: g.id });
      if (typeof res.data.balance === "number") setBalance(res.data.balance); else reload();
      refresh();
    } catch (e) { setErr(errorText(e, "That didn't go through.")); }
    finally { setBusy(""); }
  };
  const row = (g, mine) => (
    <li key={g.id} className="space-y-2 rounded border border-bronze/45 bg-black/30 p-3">
      <p className="text-sm">{mine ? <>You challenged <b>{g.opponent.name}</b></> : <><b className="text-gold">{g.challenger.name}</b><TitleTag text={g.challenger.title} /> challenges you</>} · <b>{fmt(g.stake)}</b> points each · {g.size} random stats</p>
      {g.message && <p className="text-sm italic text-mist">"{g.message}"</p>}
      <p className="text-xs text-mist">Expires in {countdown(Date.parse(g.expires_at) - sn)}</p>
      <div className="flex flex-wrap gap-2">
        {mine
          ? <button type="button" disabled={!!busy} onClick={() => act("grudge_cancel", g)} className="btn-bronze h-10 px-3 text-sm">{busy === "grudge_cancel" + g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Withdraw (stake back)"}</button>
          : <>
            <button type="button" disabled={!!busy || balance < g.stake} onClick={() => act("grudge_accept", g)} className="btn-seal h-10 px-4 text-sm">{busy === "grudge_accept" + g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Accept · {fmt(g.stake)} pts</>}</button>
            <button type="button" disabled={!!busy} onClick={() => act("grudge_decline", g)} className="btn-bronze h-10 px-3 text-sm"><X className="h-4 w-4" /> Decline</button>
          </>}
      </div>
    </li>
  );
  return (
    <Panel title="Your challenges">
      <ul className="space-y-2">{incoming.map((g) => row(g, false))}{outgoing.map((g) => row(g, true))}</ul>
      {err && <p role="alert" className="mt-2 text-sm text-ember">{err}</p>}
    </Panel>
  );
}

function LiveGrudge({ g, sn, serverNow, balance, setBalance, refresh }) {
  const [fa, fb] = useMemo(() => fightersOf(g), [g.id]);
  const seed = g.seed;
  const fight = useMemo(() => (seed != null ? simulate(fa, fb, seed, { draws: false, limit: LIMIT }) : simulate(fa, fb, 1, { draws: false, ot: false, limit: 0.2 })), [seed, fa, fb]);
  const spec = useMemo(() => ({ key: `grudge-${g.id}-${seed != null ? "f" : "s"}`, a: fa, b: fb, fight, values: VALUES }), [fight]);
  const gRef = useRef(g); gRef.current = g;
  const clock = useCallback(() => {
    const x = gRef.current, now = serverNow(), close = Date.parse(x.close_at);
    if (now < close) return { betting: true, betLeft: (close - now) / 1000 };
    if (x.seed == null) return { idle: true, banner: "Betting is closed · the fight is about to start" };
    return { t: (now - close) / 1000 - 3 };
  }, [serverNow]);
  const phase = phaseOf(g, sn);
  const open = phase === "betting" && Date.parse(g.close_at) - sn > 500;
  const names = [fa.name, fb.name];
  const [board, setBoard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadBoard = useCallback(async () => {
    try { const res = await base44.functions.invoke("tournamentAction", { action: "grudge_board", id: g.id }); setBoard(res.data.board); } catch { /* next time */ }
  }, [g.id]);
  useEffect(() => { loadBoard(); const id = setInterval(() => { if (!document.hidden) loadBoard(); }, 3000); return () => clearInterval(id); }, [loadBoard]);
  const place = async (lines) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "grudge_bet", id: g.id, lines });
      try { localStorage.setItem(OWED_KEY, "1"); } catch { /* */ }
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      setNotice("Your bet is on."); loadBoard();
      return true;
    } catch (e) { setError(errorText(e, "That bet didn't go on.")); return false; }
    finally { setBusy(false); }
  };
  const remove = async (payload) => {
    setBusy(true); setError("");
    try { const res = await base44.functions.invoke("tournamentAction", { action: "grudge_remove", id: g.id, ...payload }); if (typeof res.data.balance === "number") setBalance(res.data.balance); loadBoard(); }
    catch (e) { setError(errorText(e, "That bet couldn't be taken back.")); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (phase === "result") refresh(); }, [phase, refresh]);
  const wide = useWide();
  const mine = board ? board.mine : null;
  const outcome = g.outcome;
  const slip = (
    <>
      <BetSlip fightKey={`grudge-${g.id}`} odds={g.odds} names={names} draws={false} open={open} mineLines={mine ? mine.lines : []}
        closedText={phase === "betting" ? "Betting is closing" : "Betting is closed"} limit={5000} minBet={1} placed={mine ? mine.amount || 0 : 0} balance={balance} onPlace={place} busy={busy} error={error} notice={notice} />
      <MyBets mine={mine} names={names} outcome={phase === "result" ? outcome : null} open={open} busy={busy} onRemove={remove} />
    </>
  );
  return (
    <>
      <div className="rounded-md border border-[#5a4724] bg-gradient-to-b from-[#1a1b24] to-[#13141b] p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-crimson arena-label">Grudge match · {fmt(g.stake)} points each · {g.size} random stats</p>
        <h2 className="arena-display mt-1 text-2xl font-black text-[#f1d38c] sm:text-3xl">{g.challenger.name} vs {g.opponent.name}</h2>
        {g.message && <p className="mt-1 text-sm italic text-mist">"{g.message}"</p>}
        <p className="mt-2 text-sm">Winner takes <b className="text-gold">{fmt(Math.floor(g.stake * 2 * 0.95))}</b> points.</p>
      </div>
      <ArenaStage spec={spec} clock={clock} chip={phase === "betting" ? { text: "Bets open" } : phase === "fighting" ? { text: "Live", live: true } : { text: "Result" }} />
      <div className="rounded-md border border-bronze/45 bg-black/40 px-3 py-2.5 text-sm" aria-live="polite">
        {phase === "betting" && `Betting closes in ${Math.max(0, Math.ceil((Date.parse(g.close_at) - sn) / 1000))} s`}
        {phase === "fighting" && "Fight in progress"}
        {phase === "result" && outcome && `${names[g.winner]} wins ${outcome.how === "ko" ? (outcome.ot ? "by KO in overtime" : "by KO") : "on HP left after overtime"}`}
      </div>
      {!wide && <div className="space-y-3">{slip}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[fa, fb].map((f, i) => (
          <FighterCard key={i} f={f} values={VALUES} highlight={phase === "result" && g.winner === i}>
            {g.odds && <p className="mt-2 flex items-center justify-between border-t border-bronze/25 pt-2 text-sm"><span className="text-mist">To win</span><b className="font-heading text-gold">{fmtPrice(i ? g.odds.b : g.odds.a)}</b></p>}
          </FighterCard>
        ))}
      </div>
      {wide && <div className="space-y-3">{slip}</div>}
      <BetBoard board={board} names={names} done={phase === "result"} />
    </>
  );
}

function GrudgeReplay({ g, started, onClose }) {
  const spec = useMemo(() => {
    const [a, b] = fightersOf(g);
    return { key: `grudge-replay-${g.id}-${started}`, a, b, values: VALUES, fight: simulate(a, b, g.seed, { draws: false, limit: LIMIT }), label: `BLACKLIST INTROBOYS · Grudge match: ${a.name} vs ${b.name}`, fileName: `grudge-${a.name}-vs-${b.name}` };
  }, [g.id, started]);
  return (
    <>
      <ReplayStage key={spec.key} spec={spec} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/50 bg-gold/10 px-3 py-2 text-sm">
        <span>Replay: grudge match {spec.a.name} vs {spec.b.name} · {fmt(g.stake)} each</span>
        <button type="button" onClick={onClose} className="btn-seal h-9 px-4 text-sm"><Radio className="h-4 w-4" /> Close</button>
      </div>
    </>
  );
}
