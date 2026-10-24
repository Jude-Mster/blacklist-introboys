import React, { useCallback, useEffect, useRef, useState } from "react";
import { Home, Loader2, Play, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;            // while the app is online: the live view
const IDLE_POLL_MS = 20000;      // 6.43: while it is offline (every look costs the site's shared database budget)
const CMD_LABEL = { start: "Start", stop: "Stop", return_town: "Return to town", upgrade: "Upgrade", enhance: "Enhance" };   // the last two: old commands, shown in the history only
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
    if (cmd === "stop" || cmd === "return_town") { /* no confirmation: these are the safe ones */ }
    else if (!window.confirm(`Send "${CMD_LABEL[cmd]}" to the Assistant on your PC? The game must be open and in front on that PC.`)) return;
    setBusy(cmd); setError(""); setMsg("");
    try {
      await base44.functions.invoke("botAuth", { action: "remoteCommand", cmd, args, seat: (view && view.seat) || 1 });
      setMsg(`"${CMD_LABEL[cmd]}" sent - your PC picks it up within a few seconds.`);
      await load();
    } catch (e) { setError(errorText(e, "Couldn't send that.")); }
    finally { setBusy(""); }
  };

  if (!licensed) return null;
  const st = (view && view.state) || {};
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
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-xs font-bold uppercase", online ? "border-emerald-400/70 text-emerald-300" : "border-ember/60 text-ember")}>
          <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-400" : "bg-ember")} aria-hidden="true" />
          {online ? "Online" : "Offline"}
        </span>
        {online && <span className="font-heading text-lg font-extrabold text-gold">{st.state || "-"}</span>}
        {online && st.boss ? <span className="text-mist">{st.boss}{st.hp >= 0 ? ` · ${Math.round(st.hp * 100)}% HP` : ""}</span> : null}
        {online && st.version && <span className="ml-auto text-xs text-mist">app {st.version}</span>}
      </div>
      {!view && !error && <p className="mt-2 flex items-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Looking for your Assistant…</p>}
      {view && !online && (
        <p className="mt-2 text-sm text-mist">
          Your Assistant is not reporting. Open IntroBoys Assistant on your PC (signed in, on the PC your license is locked to) and keep "Allow control from the guild website" ticked.
          {view.updated_at && <> Last seen {new Date(view.updated_at).toLocaleString()}.</>}
        </p>
      )}

      {online && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-mist">Game</dt><dd className={st.game ? "text-white" : "text-ember"}>{st.game ? "found" : "not found"}</dd></div>
            <div><dt className="text-xs text-mist">Dungeon</dt><dd className="text-white">{st.dungeon === "den" ? "Den (LOD)" : "Labyrinth"}</dd></div>
            <div><dt className="text-xs text-mist">This session</dt><dd className="text-white">{st.cycles || 0} cycles · {st.kills || 0} kills</dd></div>
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
                  <option value="labyrinth">Labyrinth</option>
                  <option value="den">Den (LOD)</option>
                </select>
              </div>
              <div>
                <label htmlFor="rc-runs" className="label">Runs (0 = until stopped)</label>
                <input id="rc-runs" type="number" min="0" max="999" value={runs} onChange={(e) => setRuns(e.target.value)} className="field h-10 w-28" />
              </div>
              {dungeon === "labyrinth" && (
                <div>
                  <label htmlFor="rc-boss" className="label">Start at boss</label>
                  <select id="rc-boss" value={startBoss} onChange={(e) => setStartBoss(e.target.value)} className="field h-10">
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button disabled={!!busy || running} onClick={() => send("start", { dungeon, runs: Number(runs) || 0, start_boss: Number(startBoss) || 1 })} className="btn-seal flex h-10 items-center justify-center gap-2 px-5 text-sm">
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
