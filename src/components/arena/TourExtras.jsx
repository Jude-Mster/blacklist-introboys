import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trophy, History, Crown, Target, Sparkles, Wand2, Eraser, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";
import { simulate, normValues, ENGINE_VERSION, LIMIT } from "@/lib/arenaEngine";
import { sidesOf, championOf, scorePicks } from "@/lib/bracket";
import { cn } from "@/lib/utils";
import { ReplayStage, asFighter, fmt, fmtPrice, lookColor } from "./arenaUi";

// 6.22: seeded double elimination (the bracket and the prediction picker), titles, and replays opened from
// a link (the ones posted on Discord).

export function TitleTag({ text, className }) {
  if (!text) return null;
  return <span className={cn("ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-sm border border-gold/60 bg-gold/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-gold", className)}><Crown className="h-3 w-3" aria-hidden="true" />{text}</span>;
}

export const countdown = (ms) => {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 3600000);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
};
export function matchState(m, sn) {
  if (m.skipped) return "skipped";
  return !m.open_at || sn < Date.parse(m.open_at) ? "waiting" : sn < Date.parse(m.close_at) ? "betting" : m.outcome ? "done" : "fighting";
}
const SECTIONS = [["W", "Winners' bracket", "Win and stay here. Lose once and you drop to the losers' bracket."], ["L", "Losers' bracket", "One more loss and you're out."], ["G", "Grand final", "The winners' champion against the losers' champion. If the losers' side wins, both have lost once: a reset decides it."]];

// After a pick changes, drop the later picks it made impossible (a fighter no longer in that match).
export function tidyPicks(ms, picks) {
  const out = { ...picks };
  for (let pass = 0; pass < 3; pass++) {
    const sides = sidesOf(ms, out);
    for (const m of ms) {
      const s = sides[m.no], p = out[m.no];
      if (p == null) continue;
      if (s === "skip" || !s || (p !== s[0] && p !== s[1])) delete out[m.no];
    }
  }
  return out;
}
export function picksComplete(ms, picks) {
  const sides = sidesOf(ms, picks);
  return ms.every((m) => sides[m.no] === "skip" || (picks[m.no] != null && sides[m.no] && sides[m.no].includes(picks[m.no])));
}

// The double-elimination bracket: the winners' bracket, the losers' bracket and the grand final, each a row
// of rounds. In pick mode the names are the predicted ones and tapping a name picks that fighter to win.
export function DoubleBracket({ t, field, sn, curNo = 0, memberId, watching = 0, onWatch, picks, onPick, myPicks }) {
  const ms = t.matches || [];
  const pickMode = !!onPick;
  const mineIdx = field.findIndex((f) => f.member_id === memberId);
  const predicted = useMemo(() => (pickMode ? sidesOf(ms, picks || {}) : null), [pickMode, ms, picks]);
  const watchable = !!onWatch && (t.engine || ENGINE_VERSION) === ENGINE_VERSION;
  const scroller = useRef(null);
  const focusNo = curNo || watching || 0;
  useEffect(() => {
    const box = scroller.current;
    if (!box || !focusNo) return;
    const el = box.querySelector(`[data-match="${focusNo}"]`);
    if (el) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [focusNo]);
  const refName = (ref) => (ref.s !== undefined ? field[ref.s].name : ref.w !== undefined ? `Winner of ${ref.w}` : `Loser of ${ref.l}`);
  const champ = useMemo(() => {
    if (pickMode) { const c = championOf(ms, picks || {}); return c == null ? null : field[c]; }
    const last = ms.filter((m) => m.sec === "G" && !m.skipped && matchState(m, sn) === "done").pop();
    const reset = ms.find((m) => m.reset);
    if (!last) return null;
    if (!last.reset && reset && !reset.skipped) return null;   // the reset is still to come
    return field[last.winner];
  }, [pickMode, ms, picks, sn, field]);

  const card = (m) => {
    const st = pickMode ? "pick" : matchState(m, sn), live = st === "fighting" || st === "betting";
    const sidesP = pickMode ? predicted[m.no] : null;
    if (pickMode && sidesP === "skip") {
      return (
        <div key={m.no} data-match={m.no} className="bk-card dbk-card skipped">
          <div className="bk-head"><span>{m.no} · {m.stage}</span></div>
          <p className="px-2 py-2 text-xs italic text-mist">Not needed: the winners' champion won the grand final.</p>
        </div>
      );
    }
    if (!pickMode && m.skipped) {
      return (
        <div key={m.no} data-match={m.no} className="bk-card dbk-card skipped">
          <div className="bk-head"><span>{m.no} · {m.stage}</span><span>Not needed</span></div>
          <p className="px-2 py-2 text-xs italic text-mist">The winners' champion won the grand final.</p>
        </div>
      );
    }
    const side = (k) => {
      const i = pickMode ? (sidesP ? sidesP[k] : null) : (k ? m.b : m.a);
      const name = i != null ? field[i].name : refName(m.refs[k]);
      const win = st === "done" && m.winner === i, lose = st === "done" && m.winner !== i;
      const mine = i != null && i === mineIdx;
      const picked = pickMode && i != null && (picks || {})[m.no] === i;
      const myPick = !pickMode && myPicks && myPicks[m.no] != null && myPicks[m.no] === i;
      const inner = (
        <>
          {i != null ? <span className="dot" style={{ background: lookColor(field[i].look) }} aria-hidden="true" /> : <span className="dot empty" aria-hidden="true" />}
          <span className={cn("nm", i == null && "tbd")}>{i != null && field[i].seed ? <span className="seed">{field[i].seed}</span> : null}{name}{mine ? " (you)" : ""}</span>
          {!pickMode && m.odds && i != null && st !== "done" && <span className="px">{fmtPrice(k ? m.odds.b : m.odds.a)}</span>}
          {myPick && <span className={cn("mypick", st === "done" && (win ? "ok" : "no"))} title="Your prediction">{st === "done" ? (win ? "✓" : "✗") : "★"}</span>}
          {win && <Trophy className="h-3.5 w-3.5 shrink-0" aria-label="winner" />}
          {picked && <Target className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="your pick" />}
        </>
      );
      const cls = cn("bk-side", k && "b", win && "win", lose && "lose", mine && "mine", picked && "picked", pickMode && i != null && "pickable");
      return pickMode && i != null
        ? <button type="button" className={cls} onClick={() => onPick(m.no, i)} aria-pressed={picked} aria-label={`Match ${m.no}: pick ${name} to win`}>{inner}</button>
        : <div className={cls}>{inner}</div>;
    };
    const status = pickMode ? ((picks || {})[m.no] != null ? "Picked" : "Pick one")
      : st === "waiting" ? (m.open_at ? new Date(Date.parse(m.open_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Later") : st === "betting" ? "Bets open" : st === "fighting" ? "Live" : m.outcome.how === "ko" ? (m.outcome.ot ? "KO · OT" : "KO") : "OT · HP";
    return (
      <div key={m.no} data-match={m.no} className={cn("bk-card dbk-card", live && "live", (curNo === m.no || watching === m.no) && "focus", pickMode && (picks || {})[m.no] == null && "need")}>
        <div className="bk-head">
          <span>{m.no} · {m.reset ? "Reset" : m.sec === "G" ? "Grand final" : `R${m.round}`}</span>
          <span className="flex items-center gap-1.5">
            <span className={cn("st", st)}>{st === "fighting" && <i className="pulse" aria-hidden="true" />}{status}</span>
            {st === "done" && m.seed != null && watchable && (
              <button type="button" onClick={() => onWatch(m)} className="bk-watch" aria-label={`Watch match ${m.no} again`}><History className="h-3 w-3" /> Watch</button>
            )}
          </span>
        </div>
        {side(0)}{side(1)}
      </div>
    );
  };

  return (
    <div ref={scroller} className="dbk bk-board" role="region" aria-label="Double elimination bracket">
      {SECTIONS.map(([sec, title, help]) => {
        const list = ms.filter((m) => m.sec === sec);
        if (!list.length) return null;
        const rounds = [...new Set(list.map((m) => (m.reset ? 99 : m.round)))].sort((a, b) => a - b);
        return (
          <section key={sec} className="dbk-sec">
            <div className="dbk-sec-head"><h4>{title}</h4><p>{help}</p></div>
            <div className="bk-scroll">
              <div className="dbk-cols">
                {rounds.map((r) => {
                  const col = list.filter((m) => (m.reset ? 99 : m.round) === r);
                  return (
                    <div key={r} className="dbk-col">
                      <p className="dbk-col-head">{col[0].stage}</p>
                      <div className="dbk-col-body">{col.map(card)}</div>
                    </div>
                  );
                })}
                {sec === "G" && (
                  <div className="dbk-col">
                    <p className="dbk-col-head">{pickMode ? "Your champion" : "Champion"}</p>
                    <div className="dbk-col-body">
                      <div className={cn("bk-champ dbk-champ", champ && "won")}>
                        <Trophy className="h-5 w-5 shrink-0" aria-hidden="true" />
                        {champ ? <><span className="dot" style={{ background: lookColor(champ.look) }} aria-hidden="true" /><span className="nm">{champ.name}{champ.member_id === memberId ? " (you)" : ""}</span></> : <span className="nm tbd">{pickMode ? "Pick every match" : "To be decided"}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// The prediction window: the bracket is drawn, nothing is fought yet. Members predict every match (free);
// a perfect bracket wins the GP code pot.
export function PredictView({ data, t, sn, member, refresh, Header, leaderPanel }) {
  const ms = t.matches || [];
  const field = useMemo(() => (t.field || []).map((x) => asFighter(x)), [t.id]);
  const saved = data.my_prediction;
  const [picks, setPicks] = useState(() => (saved ? { ...saved.picks } : {}));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const until = Date.parse(t.predict_until || 0), left = until - sn;
  const complete = picksComplete(ms, picks);
  const need = useMemo(() => { const sides = sidesOf(ms, picks); return ms.filter((m) => sides[m.no] !== "skip" && picks[m.no] == null).length; }, [ms, picks]);
  const changed = !saved || JSON.stringify(tidyPicks(ms, picks)) !== JSON.stringify(saved.picks);
  const champ = championOf(ms, picks);
  const pick = (no, i) => { setMsg(""); setErr(""); setPicks((p) => tidyPicks(ms, { ...p, [no]: i })); };
  // fill the rest with the favourites (the better seed wins every match still open)
  const fillSeeds = () => {
    setPicks((p) => {
      let cur = { ...p };
      for (let k = 0; k < ms.length + 2; k++) {
        const sides = sidesOf(ms, cur);
        const m = ms.find((x) => sides[x.no] !== "skip" && cur[x.no] == null && sides[x.no] && sides[x.no][0] != null && sides[x.no][1] != null);
        if (!m) break;
        const [a, b] = sides[m.no];
        cur = { ...cur, [m.no]: (field[a].seed || 99) <= (field[b].seed || 99) ? a : b };
      }
      return cur;
    });
  };
  const send = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "predict", picks });
      setPicks({ ...res.data.picks });
      setMsg("Your prediction is in. You can change it until the window closes.");
      refresh();
    } catch (e) { setErr(errorText(e, "Your prediction didn't save. Try again.")); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="min-w-0 space-y-4">
        <Header t={t} sn={sn} />
        <Panel title="Predict the bracket">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div><p className="text-[11px] uppercase tracking-[0.16em] text-mist">Predictions close in</p><p className="font-heading text-2xl font-bold tabular-nums text-[#f1d38c]">{countdown(left)}</p></div>
              <div><p className="text-[11px] uppercase tracking-[0.16em] text-mist">Predictions in</p><p className="font-heading text-2xl font-bold tabular-nums text-white">{fmt(data.prediction_count || 0)}</p></div>
              <div className="min-w-0"><p className="text-[11px] uppercase tracking-[0.16em] text-mist">Prize for a perfect bracket</p><p className="font-heading text-lg font-bold text-gold">{(data.pot || []).length ? data.pot.map((x) => x.label).join(" + ") : "No GP code in the pot yet"}</p></div>
            </div>
            <p className="text-sm text-mist">It's free. Tap the fighter you think wins each match: your picks carry forward, so later matches fill in with the fighters you sent through. Get <b className="text-white">every match and the champion</b> right to win the GP code pot. If nobody is perfect, the pot rolls over to the next tournament; if several are, one of them is drawn at random.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={send} disabled={busy || !complete || !changed || left <= 0} className="btn-seal h-11 px-5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved && !changed ? "Prediction saved" : saved ? "Save my changes" : complete ? "Lock in my prediction" : `${need} match${need === 1 ? "" : "es"} to pick`}
              </button>
              <button type="button" onClick={fillSeeds} disabled={busy || complete} className="btn-bronze h-11 px-4 text-sm"><Wand2 className="h-4 w-4" /> Fill the rest with favourites</button>
              <button type="button" onClick={() => { setPicks({}); setMsg(""); }} disabled={busy || !Object.keys(picks).length} className="btn-bronze h-11 px-4 text-sm"><Eraser className="h-4 w-4" /> Clear</button>
              {champ != null && <span className="text-sm">Your champion: <b className="text-gold">{field[champ].name}</b></span>}
            </div>
            {msg && <p role="status" className="text-sm text-gold">{msg}</p>}
            {err && <p role="alert" className="text-sm text-ember">{err}</p>}
          </div>
        </Panel>
        <Panel title="Bracket">
          <p className="-mt-1 mb-2 text-xs text-mist">{field.length} fighters, seeded by strength from practice fights between the real builds (the number by each name): the top seeds can only meet late. Out after two losses.</p>
          <DoubleBracket t={t} field={field} sn={sn} memberId={member.id} picks={picks} onPick={left > 0 ? pick : undefined} />
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        <Panel title="Seeds">
          <ol className="space-y-1 text-sm">
            {field.slice().sort((a, b) => (a.seed || 99) - (b.seed || 99)).map((f) => (
              <li key={f.member_id} className={cn("flex items-center gap-2", f.member_id === member.id && "text-[#9fdcff]")}>
                <span className="w-6 text-right font-heading font-bold tabular-nums text-gold">{f.seed}</span>
                <span className="h-2 w-2 rounded-full" style={{ background: lookColor(f.look) }} aria-hidden="true" />
                <span className="min-w-0 truncate">{f.name}</span>
                <TitleTag text={f.title} />
              </li>
            ))}
          </ol>
        </Panel>
        {leaderPanel}
      </div>
    </>
  );
}

// How my prediction is going while the matches are fought.
export function MyPrediction({ t, mine, sn }) {
  if (!mine) return null;
  const ms = (t.matches || []).map((m) => (matchState(m, sn) === "done" ? m : { ...m, winner: null }));
  const fought = ms.filter((m) => !m.skipped && m.winner != null);
  const right = fought.filter((m) => mine.picks[m.no] === m.winner).length;
  const alive = right === fought.length && !ms.some((m) => m.skipped && mine.picks[m.no] != null);
  const field = t.field || [];
  return (
    <Panel title="Your prediction">
      <p className="text-sm"><b className="font-heading text-xl text-gold">{right}</b> of {fought.length} right so far · champion pick <b>{mine.champion != null && field[mine.champion] ? field[mine.champion].name : "—"}</b></p>
      <p className={cn("mt-1 text-sm", alive ? "text-[#8fe39a]" : "text-mist")}>{alive ? (fought.length ? "Still perfect. Every match so far went your way." : "Waiting for the first match.") : "Not perfect any more, but you can still see how close you get."}</p>
    </Panel>
  );
}

// The prediction result under a finished tournament.
export function PredictionResult({ t }) {
  const p = t.prediction;
  if (!p || !p.settled) return null;
  return (
    <Panel title="Bracket prediction">
      {p.winner_name
        ? <p className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-gold" aria-hidden="true" /><span><b className="text-gold">{p.winner_name}</b> predicted the whole bracket and won {p.pot.join(" + ")}{p.perfect_count > 1 ? ` (drawn from ${p.perfect_count} perfect brackets)` : ""}.</span></p>
        : <p className="text-sm">{p.entries ? `No one got the whole bracket right (${p.entries} tried).` : "No one predicted this bracket."}{p.pot && p.pot.length ? ` The pot rolls over: ${p.pot.join(" + ")}.` : ""}</p>}
      {p.top && p.top.length > 0 && (
        <ol className="mt-2 space-y-1 text-sm">
          {p.top.slice(0, 5).map((x, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{i + 1}. {x.name}</span><span className="tabular-nums text-mist">{x.right}/{x.played}{x.perfect ? " · perfect" : ""}</span></li>)}
        </ol>
      )}
    </Panel>
  );
}

// A match or a grudge opened from a link (?tab=tournament&tour=…&match=… or ?tab=grudge&grudge=…).
export function LinkReplay({ q, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("tournamentAction", { action: "replay", ...q });
        if (live) setState({ data: res.data });
      } catch (e) { if (live) setState({ error: errorText(e, "That replay couldn't be loaded.") }); }
    })();
    return () => { live = false; };
  }, [JSON.stringify(q)]);
  const spec = useMemo(() => {
    const d = state.data;
    if (!d) return null;
    if (d.grudge) {
      const g = d.grudge;
      if (!g.fighters || g.seed == null) return null;
      const [a, b] = g.fighters.map((x) => asFighter(x));
      return { key: `link-grudge-${g.id}`, a, b, values: normValues(), fight: simulate(a, b, g.seed, { draws: false, limit: LIMIT }), label: `BLACKLIST INTROBOYS · Grudge match: ${a.name} vs ${b.name}`, fileName: `grudge-${a.name}-vs-${b.name}`, engine: g.engine };
    }
    const tr = d.tour, m = d.match, values = normValues(tr.values);
    const a = asFighter(tr.field[m.a]), b = asFighter(tr.field[m.b]);
    return { key: `link-${tr.id}-${m.no}`, a, b, values, fight: simulate(a, b, m.seed, { draws: false, values }), label: `BLACKLIST INTROBOYS · ${tr.title} · ${m.stage || `Match ${m.no}`}: ${a.name} vs ${b.name}`, fileName: `${tr.title}-match-${m.no}-${a.name}-vs-${b.name}`, engine: tr.engine };
  }, [state.data]);
  if (state.loading) return <Panel><p className="flex items-center justify-center gap-2 py-6 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading the replay</p></Panel>;
  if (state.error) return <Panel><div className="flex flex-wrap items-center justify-between gap-2"><p role="alert" className="text-sm text-ember">{state.error}</p><button type="button" onClick={onClose} className="btn-bronze h-9 px-3 text-sm">Close</button></div></Panel>;
  if (!spec) return null;
  const old = spec.engine && spec.engine !== ENGINE_VERSION;
  return (
    <div className="space-y-2">
      <ReplayStage key={spec.key} spec={spec} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/50 bg-gold/10 px-3 py-2 text-sm">
        <span>{state.data.grudge ? "Grudge match" : `${state.data.tour.title} · ${state.data.match.stage}`}: {spec.a.name} vs {spec.b.name}{old ? " · fought on an older version of the arena, so this replay may differ" : ""}</span>
        <button type="button" onClick={onClose} className="btn-bronze h-9 px-3 text-sm"><X className="h-4 w-4" /> Close</button>
      </div>
    </div>
  );
}

// The final, recorded on the Guild Leader's screen and posted to Discord as a video.
export async function sendFinalVideo(tourId, blob, ext) {
  if (blob.size > 9.5 * 1024 * 1024) throw new Error("The video is over 9.5 MB, too big for Discord. Use Download instead.");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  try {
    await base44.functions.invoke("tournamentAction", { action: "final_video", tour: tourId, data: btoa(bin), mime: ext === "mp4" ? "video/mp4" : "video/webm" });
  } catch (e) { throw new Error(errorText(e, "The video didn't send.")); }
}

export { scorePicks };
