import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Home, Loader2, Play, Shield, Square, Stethoscope, Swords } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;            // while the app is online: the live view
const IDLE_POLL_MS = 20000;      // 6.43: while it is offline (every look costs the site's shared database budget)
const CMD_LABEL = {
  start: "Start", stop: "Stop", return_town: "Return to town", upgrade: "Upgrade", enhance: "Enhance",
  set_mode: "Change mode", set_runs: "Change runs", war_break: "War break", auto_hunt: "Auto hunt", check_phone: "Check phone"
};
// 6.50: the war break: Regular Battle every 2 hours (even UTC hours); the Assistant leaves the dungeon at :27 and goes back at :49
const HOUR = 3600000, MIN = 60000;
function warBreakTimes(now = Date.now()) {
  const block = now - (now % (2 * HOUR));
  const start = block + 27 * MIN, back = block + 49 * MIN;
  if (now < start) return { on: false, start, back };
  if (now < back) return { on: true, start, back };
  return { on: false, start: start + 2 * HOUR, back: back + 2 * HOUR };
}
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`; };
const hhmm = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });   // the last two: old commands, shown in the history only
const STATUS_LABEL = { pending: "sent", taken: "received", done: "done", failed: "failed", expired: "not picked up" };

// Remote control of the member's own IntroBoys Assistant: what it is doing, a small picture of the game while this page is open,
// and a fixed set of commands. The app on the PC picks the commands up within a few seconds.
export default function RemotePanel({ licensed }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [dungeon, setDungeon] = useState("labyrinth");
  const [runs, setRuns] = useState("1");
  const [startBoss, setStartBoss] = useState("1");
  const [warOn, setWarOn] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const [seat, setSeat] = useState(0);              // 6.41: which device (0 = the one online, picked by the site)
  const seatRef = useRef(0); seatRef.current = seat;
  const timer = useRef(null);
  const onlineRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("botAuth", { action: "remoteView", ...(seatRef.current ? { seat: seatRef.current } : {}) });
      setView(res.data); setError("");
      onlineRef.current = !!(res.data && (res.data.online || (res.data.devices || []).some((d) => d.online)));
    } catch (e) { setError(errorText(e, "Couldn't reach your Assistant.")); }
  }, []);

  // poll only while the page is visible (the app sends pictures only while someone watches);
  // 6.43: every 3 s while an app is online, every 20 s while none is
  useEffect(() => {
    if (!licensed) return undefined;
    let stop = false;
    const next = () => { if (!stop) timer.current = setTimeout(tick, onlineRef.current ? POLL_MS : IDLE_POLL_MS); };
    const tick = async () => { if (document.visibilityState === "visible") await load(); next(); };
    tick();
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearTimeout(timer.current); document.removeEventListener("visibilitychange", vis); };
  }, [licensed, load]);

  const send = async (cmd, args) => {
    if (cmd === "stop" || cmd === "return_town" || cmd === "set_mode" || cmd === "set_runs" || cmd === "war_break" || cmd === "check_phone") { /* no confirmation: these are the safe ones */ }
    else if (!window.confirm(`Send "${CMD_LABEL[cmd]}" to the Assistant on your ${view && view.platform === "android" ? "phone? The game must be open on the phone." : "PC? The game must be open and in front on that PC."}`)) return;
    setBusy(cmd); setError(""); setMsg("");
    try {
      await base44.functions.invoke("botAuth", { action: "remoteCommand", cmd, args, seat: (view && view.seat) || 1 });
      setMsg(`"${CMD_LABEL[cmd]}" sent - your ${view && view.platform === "android" ? "phone" : "PC"} picks it up within a few seconds.`);
      await load();
    } catch (e) { setError(errorText(e, "Couldn't send that.")); }
    finally { setBusy(""); }
  };

  if (!licensed) return null;
  const st = (view && view.state) || {};
  // 6.47: the device being watched is a phone (the Android app) or a PC
  const phone = !!(view && view.platform === "android");
  const where = phone ? "phone" : "PC";
  const online = !!(view && view.online);
  const running = !!st.running;
  return (
    <Panel title="Remote control">
      {view && view.devices && view.devices.length > 1 && (
        <div role="tablist" aria-label="Device" className="mb-3 flex flex-wrap gap-1.5">
          {view.devices.map((d) => (
            <button key={d.seat} type="button" role="tab" aria-selected={view.seat === d.seat} onClick={() => { setSeat(d.seat); seatRef.current = d.seat; setView(null); load(); }}
              className={cn("flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm", view.seat === d.seat ? "border-gold text-gold" : "border-bronze/50 text-mist hover:text-white")}>
              <span className={cn("h-2 w-2 rounded-full", d.online ? "bg-emerald-400" : "bg-white/20")} aria-hidden="true" />{d.label}
              {d.platform && <span className={cn("rounded-[3px] border px-1 text-[10px] font-bold uppercase", d.platform === "android" ? "border-gold/70 text-gold" : "border-white/40 text-mist")}>{d.platform === "android" ? "Mobile" : "PC"}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-xs font-bold uppercase", online ? "border-emerald-400/70 text-emerald-300" : "border-ember/60 text-ember")}>
          <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-400" : "bg-ember")} aria-hidden="true" />
          {online ? "Online" : "Offline"}
        </span>
        {view && <span className={cn("rounded-[3px] border px-2 py-0.5 text-xs font-bold uppercase", phone ? "border-gold/70 text-gold" : "border-white/40 text-mist")}>{phone ? "Mobile" : "PC"}</span>}
        {online && <span className="font-heading text-lg font-extrabold text-gold">{st.state || "-"}</span>}
        {online && st.boss ? <span className="text-mist">{st.boss}{st.hp >= 0 ? ` · ${Math.round(st.hp * 100)}% HP` : ""}</span> : null}
        {online && st.version && <span className="ml-auto text-xs text-mist">app {st.version}</span>}
      </div>
      {!view && !error && <p className="mt-2 flex items-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Looking for your Assistant…</p>}
      {view && !online && (
        <p className="mt-2 text-sm text-mist">
          {phone
            ? <>Your phone Assistant is not reporting. Open IntroBoys Assistant on the phone (signed in, with days on this device). For the picture, tap Allow on &quot;See the game&quot; in the app.</>
            : <>Your Assistant is not reporting. Open IntroBoys Assistant on your PC (signed in, on the PC your license is locked to) and keep &quot;Allow control from the guild website&quot; ticked.</>}
          {view.updated_at && <> Last seen {new Date(view.updated_at).toLocaleString()}.</>}
        </p>
      )}

      {online && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-mist">{phone ? "Sees the game" : "Game"}</dt><dd className={st.game ? "text-white" : "text-ember"}>{phone ? (st.game ? "yes" : "no (Android 9/10: needs Live record)") : st.game ? "found" : "not found"}</dd></div>
            <div><dt className="text-xs text-mist">{phone ? "Mode" : "Dungeon"}</dt><dd className="text-white">{st.dungeon === "den" ? "Den (LOD)" : st.dungeon === "attack" ? "Auto attack" : "Labyrinth"}</dd></div>
            {phone
              ? <div><dt className="text-xs text-mist">Runs done</dt><dd className="text-white">Labyrinth {st.total_labyrinth || 0} · Den {st.total_den || 0}{st.running ? ` · ${st.presses || 0} presses` : ""}</dd></div>
              : <div><dt className="text-xs text-mist">This session</dt><dd className="text-white">{st.cycles || 0} cycles · {st.kills || 0} kills</dd></div>}
            <div><dt className="text-xs text-mist">Time left</dt><dd className="text-white">{st.time_left || "-"}</dd></div>
          </dl>
          {st.locked && <p className="mt-2 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">Your PC looks locked or asleep: the Assistant cannot see the game or press keys until it is unlocked.</p>}

          <div className="mt-3 overflow-hidden rounded-md border border-bronze/50 bg-black">
            {view.picture || view.picture_url
              ? <img src={view.picture ? `data:image/${view.picture_type || "jpeg"};base64,${view.picture}` : view.picture_url} alt="Your game, as the Assistant sees it" className="block w-full" />
              : <div className="px-3 py-10 text-center text-sm text-mist">
                  <p>The picture of your game shows here in a few seconds.</p>
                  {view.picture_note && view.picture_note !== "waiting for the first picture" && <p className="mt-2 text-xs text-ember">No picture yet: {view.picture_note}.</p>}
                </div>}
          </div>
          {view.picture_at && <p className="mt-1 text-right text-[11px] text-mist">picture from {new Date(view.picture_at).toLocaleTimeString()}</p>}

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <div>
                <label htmlFor="rc-dungeon" className="label">Dungeon</label>
                <select id="rc-dungeon" value={dungeon} onChange={(e) => setDungeon(e.target.value)} className="field h-10">
                  {phone && <option value="attack">Auto attack</option>}
                  <option value="labyrinth">Labyrinth</option>
                  <option value="den">Den (LOD)</option>
                </select>
              </div>
              <div>
                <label htmlFor="rc-runs" className="label">Runs (0 = until stopped)</label>
                <input id="rc-runs" type="number" min="0" max="999" value={runs} onChange={(e) => setRuns(e.target.value)} className="field h-10 w-28" />
              </div>
              {dungeon !== "attack" && (
                <label className="flex h-10 items-center gap-2 text-sm text-white">
                  <input type="checkbox" checked={warOn} onChange={(e) => setWarOn(e.target.checked)} className="h-4 w-4 accent-[#c9a227]" />
                  With war break
                </label>
              )}
              {dungeon === "labyrinth" && (
                <div>
                  <label htmlFor="rc-boss" className="label">Start at boss</label>
                  <select id="rc-boss" value={startBoss} onChange={(e) => setStartBoss(e.target.value)} className="field h-10">
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button disabled={!!busy || running} onClick={() => send("start", { dungeon, runs: Number(runs) || 0, start_boss: Number(startBoss) || 1, war_break: dungeon !== "attack" ? warOn : undefined })} className="btn-seal flex h-10 items-center justify-center gap-2 px-5 text-sm">
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" aria-hidden="true" />} Start
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button disabled={!!busy || !running} onClick={() => send("stop")} className="btn-bronze flex h-10 items-center justify-center gap-2 text-sm !text-ember">
              {busy === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" aria-hidden="true" />} Stop
            </button>
            <button disabled={!!busy || running} onClick={() => send("return_town")} className="btn-bronze flex h-10 items-center justify-center gap-2 text-sm">
              {busy === "return_town" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Home className="h-4 w-4" aria-hidden="true" />} Return to town
            </button>
          </div>
          <p className="mt-2 text-xs text-mist">Stop works any time; Start and Return to town only when the Assistant is idle.</p>

          {/* 6.50: the war break and its timer */}
          {(() => {
            const w = warBreakTimes(now);
            const enabled = !!st.war_break;
            const onBreak = !!st.on_war_break || (enabled && running && w.on);
            return (
              <div className={cn("mt-3 rounded-md border p-3", onBreak ? "border-crimson/70 bg-crimson/10" : "border-bronze/50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Shield className="h-4 w-4 text-gold" aria-hidden="true" />
                  <span className="font-heading font-bold text-white">War break</span>
                  <span className={cn("rounded-[3px] border px-1.5 text-[10px] font-bold uppercase", enabled ? "border-emerald-400/70 text-emerald-300" : "border-white/30 text-mist")}>{enabled ? "on" : "off"}</span>
                  <span className="ml-auto font-heading text-lg font-extrabold tabular-nums text-gold">
                    {onBreak ? `back in ${clock(w.back - now)}` : `${clock(w.start - now)}`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-mist">
                  {onBreak
                    ? <>On the war: auto hunt is on and joins the battle. Back to the {st.dungeon === "den" ? "Den" : "Labyrinth"} at {hhmm(w.back)}, from boss 1.</>
                    : <>Next war break at {hhmm(w.start)} (the entrance opens at {hhmm(w.start + 3 * MIN)}): return to town, auto hunt on through the war (the war pop-up is left alone), auto hunt off at {hhmm(w.back)} and back to the run from boss 1.</>}
                </p>
                <button disabled={!!busy} onClick={() => send("war_break", { on: !enabled })} className="btn-bronze mt-2 flex h-9 items-center gap-2 px-3 text-sm">
                  {busy === "war_break" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" aria-hidden="true" />} {enabled ? "Turn the war break off" : "Turn the war break on"}
                </button>
              </div>
            );
          })()}

          {/* 6.50: more remote options */}
          <details className="mt-3 rounded-md border border-bronze/50 p-3 text-sm" open>
            <summary className="cursor-pointer font-heading font-bold text-white">Remote options</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-mist">Mode:</span>
                {[...(phone ? [["attack", "Auto attack"]] : []), ["labyrinth", "Labyrinth"], ["den", "Den"]].map(([v, l]) => (
                  <button key={v} disabled={!!busy || running} onClick={() => send("set_mode", { dungeon: v })}
                    className={cn("h-8 rounded-md border px-2.5 text-xs", st.dungeon === v ? "border-gold text-gold" : "border-bronze/50 text-mist hover:text-white")}>{l}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-mist">Runs in a row:</span>
                {[1, 3, 5, 10, 0].map((n) => (
                  <button key={n} disabled={!!busy} onClick={() => send("set_runs", { runs: n })}
                    className={cn("h-8 min-w-8 rounded-md border px-2 text-xs", Number(st.runs) === n ? "border-gold text-gold" : "border-bronze/50 text-mist hover:text-white")}>{n === 0 ? "∞" : n}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-mist">Auto hunt:</span>
                <button disabled={!!busy || running} onClick={() => send("auto_hunt", { on: true })} className="h-8 rounded-md border border-bronze/50 px-2.5 text-xs text-mist hover:text-white"><Crosshair className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Press once</button>
              </div>
              {phone && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-mist">Set-up:</span>
                  <button disabled={!!busy || running} onClick={() => send("check_phone")} className="h-8 rounded-md border border-bronze/50 px-2.5 text-xs text-mist hover:text-white"><Stethoscope className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Check phone</button>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-mist">Mode, runs and the war break are remembered by the {where}; they apply to the next Start (runs and the war break also to a run that is going).</p>
          </details>

          {view.log && (
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-bronze/40 bg-black/50 p-2 font-mono text-[11px] leading-snug text-mist">{view.log}</pre>
          )}
        </>
      )}

      {msg && <p role="status" className="mt-2 text-sm text-gold">{msg}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}

      {view && view.commands && view.commands.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-mist hover:text-gold">Recent commands</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-mist">
            {view.commands.map((c) => (
              <li key={c.id}>{new Date(c.created_at).toLocaleTimeString()} · {CMD_LABEL[c.cmd] || c.cmd} · <span className={c.status === "failed" ? "text-ember" : c.status === "done" ? "text-emerald-300" : ""}>{STATUS_LABEL[c.status] || c.status}</span>{c.result ? ` · ${c.result}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
