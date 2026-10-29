import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, Loader2, MonitorSmartphone, Pencil, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import { peekPendingLink, clearPendingLink } from "@/lib/assistantLink";
import { cn } from "@/lib/utils";
import RemotePanel from "@/components/assistant/RemotePanel";
import LootPanel from "@/components/assistant/LootPanel";

const fmt = (n) => Number(n || 0).toLocaleString();
const isPhone = (d) => d && d.platform === "android";
const onAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
// 6.47: opens the Assistant in the BLACKLIST Android app (or does nothing when it isn't installed)
const OPEN_APP = "intent://assistant#Intent;scheme=introboys;package=com.blacklistintroboys.guild;end";
const WHY = {
  no_license: "No license yet. Buy days in the guild shop.",
  expired: "Your Assistant time has run out. Buy more days in the guild shop.",
  revoked: "Your license was switched off by the Guild Leader."
};

// IntroBoys Assistant: the license (bought in the guild shop), the device lock, and the page where
// the desktop app's sign-in code is approved. The app itself is a program on the member's own PC.
export default function Assistant() {
  const { account, loading } = useGuild();
  const linked = !!(account && account.linked);
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // 6.43: a busy moment (the site's shared database budget) is waited out: up to 4 more tries over ~15 s before an error shows
  const load = useCallback(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await base44.functions.invoke("botAuth", { action: "status" });
        setData(res.data);
        setError("");
        return;
      } catch (e) {
        const text = errorText(e, "Couldn't load your Assistant license.");
        const status = e && e.response && e.response.status;
        const busy = status === 429 || status === 500 || /rate limit|busy/i.test(text);
        if (!busy || attempt >= 4) { setError(text); return; }
        await new Promise((r) => setTimeout(r, [1500, 2500, 4000, 6000][attempt]));
      }
    }
  }, []);
  useEffect(() => { if (linked) load(); }, [linked, load]);

  // A code that arrived through /link-app before the member had signed in
  const [code] = useState(() => params.get("link") || peekPendingLink());
  useEffect(() => { clearPendingLink(); if (params.get("link")) { const n = new URLSearchParams(params); n.delete("link"); setParams(n, { replace: true }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LanternSpinner label="Opening the Assistant" className="py-24" />;
  if (!linked) return <Navigate to="/link-discord" replace />;

  const lic = data && data.license;
  return (
    <div className="mx-auto max-w-[44rem] space-y-5">
      <header className="text-center">
        <h1 className="font-heading text-3xl font-extrabold gilt-text">IntroBoys Assistant</h1>
        <p className="mt-1 text-sm text-mist">The Labyrinth helper for your PC, and auto attack on your phone. Buy days in the guild shop, sign the app in with a code, and it runs for as long as your days last.</p>
      </header>

      {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>}
      {!data && !error ? <LanternSpinner label="Checking your license" className="py-10" /> : data && (
        <>
          <LinkApp code={code} onDone={load} license={lic} />
          <Devices data={data} onChange={load} />
          <PhonePanel allowed={!!data.mobile_allowed} />
          <RemotePanel licensed={!!(lic && lic.active)} />
          <LootPanel licensed={!!(data.devices && data.devices.length)} />
        </>
      )}

      <Panel title="How it works">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-mist">
          <li>Buy Assistant days in the <Link to="/shop" className="text-gold underline">guild shop</Link>. They switch on the moment you pay, and more days add to the time you have left.</li>
          <li>Open IntroBoys Assistant on your PC and press <b className="text-white">Sign in with Discord</b>. Your browser opens this page with a code.</li>
          <li>Check that the <b className="text-white">device ID</b> matches the one in the app, then press Approve.</li>
          <li>The app runs while you have days left and still hold the guild member role. It checks in every couple of minutes; if it can't, it stops.</li>
          <li>Each device is a license for one PC: it is locked to the first PC that uses it, and can be moved to another PC once a week.</li>
          <li>Want the app on more PCs (up to 5)? Move some of your days to a new device below, or buy days for a new device in the shop. Each PC then runs on its own device's days.</li>
        </ol>
      </Panel>
    </div>
  );
}

// 6.41: the member's devices. Each one is a license for one PC with its own days; days can be moved between them.
function Devices({ data, onChange }) {
  const lic = data.license;
  const devices = data.devices || [];
  const max = data.max_devices || 5;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [renaming, setRenaming] = useState(null);       // { seat, label }
  const firstWithDays = devices.find((d) => d.whole_days > 0);
  const [mv, setMv] = useState({ from: firstWithDays ? String(firstWithDays.seat) : "1", to: "new", days: "" });
  const fromDev = devices.find((d) => String(d.seat) === mv.from);

  const run = async (key, body, done) => {
    setBusy(key); setError(""); setMsg("");
    try { await base44.functions.invoke("botAuth", body); if (done) setMsg(done); await onChange(); return true; }
    catch (e) { setError(errorText(e, "That didn't work.")); return false; }
    finally { setBusy(""); }
  };
  const reset = (d) => {
    if (!window.confirm(`Move ${d.label} to another PC? The app on PC ${d.device_tag} is signed out, and the next PC that signs in without a device takes it.`)) return;
    run(`reset${d.seat}`, { action: "resetDevice", seat: d.seat }, `${d.label} is free: the next PC that signs in takes it.`);
  };
  const move = async (e) => {
    e.preventDefault();
    const days = Number(mv.days);
    const to = mv.to === "new" ? "new" : Number(mv.to);
    const ok = await run("move", { action: "moveDays", from: Number(mv.from), to, days },
      `${days} day${days === 1 ? "" : "s"} moved to ${to === "new" ? "a new device" : (devices.find((d) => d.seat === to) || {}).label}.`);
    if (ok) setMv((m) => ({ ...m, days: "" }));
  };

  return (
    <Panel title={`Your devices (${devices.length} of ${max})`}>
      {devices.length === 0 ? (
        <p className="text-sm text-mist">{WHY[lic.reason] || WHY.no_license}</p>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <li key={d.seat} className="rounded-md border border-bronze/50 bg-black/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <MonitorSmartphone className="h-4 w-4 text-gold" aria-hidden="true" />
                {renaming && renaming.seat === d.seat ? (
                  <form onSubmit={(e) => { e.preventDefault(); run(`name${d.seat}`, { action: "renameDevice", seat: d.seat, label: renaming.label }).then(() => setRenaming(null)); }} className="flex gap-1.5">
                    <input autoFocus value={renaming.label} onChange={(e) => setRenaming({ ...renaming, label: e.target.value })} maxLength={24} className="field h-8 w-40 text-sm" aria-label="Device name" />
                    <button className="btn-seal h-8 px-2 text-xs">Save</button>
                    <button type="button" onClick={() => setRenaming(null)} className="text-xs text-mist underline">Cancel</button>
                  </form>
                ) : (
                  <button type="button" onClick={() => setRenaming({ seat: d.seat, label: d.label })} className="group flex items-center gap-1.5 font-bold text-white" title="Rename">
                    {d.label}<Pencil className="h-3 w-3 text-mist opacity-60 group-hover:opacity-100" aria-hidden="true" />
                  </button>
                )}
                <span className={cn("rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase", d.active ? "border-white/70 text-white" : "border-ember/60 text-ember")}>
                  {d.active ? `${fmt(d.days_left)} day${d.days_left === 1 ? "" : "s"}` : d.revoked ? "Switched off" : "No days"}
                </span>
                {d.online && <span className="ml-auto flex items-center gap-1.5 text-xs text-mist"><span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" /> App running</span>}
              </div>
              <p className="mt-1 text-mist">
                {d.device_bound ? <>Locked to the {isPhone(d) ? "phone" : "PC"} with device ID <b className="font-mono text-gold">{d.device_tag}</b>.</> : "Not locked yet: the next PC or phone that signs in without a device takes it."}
                {d.active && <> Runs until {new Date(d.expires_at).toLocaleDateString()}.</>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {d.device_bound && (
                  <button onClick={() => reset(d)} disabled={!!busy} className="btn-bronze h-8 px-2.5 text-xs">
                    {busy === `reset${d.seat}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPhone(d) ? "Move to another phone or PC" : "Move to another PC"}
                  </button>
                )}
                {d.seat > 1 && d.whole_days < 1 && (
                  <button onClick={() => run(`rm${d.seat}`, { action: "removeDevice", seat: d.seat }, `${d.label} removed.`)} disabled={!!busy} className="btn-bronze h-8 px-2.5 text-xs !text-ember">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {devices.some((d) => d.whole_days > 0) && (
        <form onSubmit={move} className="mt-3 rounded-md border border-bronze/40 p-3 text-sm">
          <p className="mb-2 font-bold text-white">Divide your days between devices</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="mv-from" className="label">From</label>
              <select id="mv-from" value={mv.from} onChange={(e) => setMv({ ...mv, from: e.target.value })} className="field h-10">
                {devices.filter((d) => d.whole_days > 0).map((d) => <option key={d.seat} value={String(d.seat)}>{d.label} ({d.whole_days} d)</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mv-days" className="label">Days</label>
              <input id="mv-days" type="number" min="1" max={fromDev ? fromDev.whole_days : 1} step="1" value={mv.days} onChange={(e) => setMv({ ...mv, days: e.target.value })} className="field h-10 w-24" required />
            </div>
            <ArrowRight className="mb-3 h-4 w-4 text-mist" aria-hidden="true" />
            <div>
              <label htmlFor="mv-to" className="label">To</label>
              <select id="mv-to" value={mv.to} onChange={(e) => setMv({ ...mv, to: e.target.value })} className="field h-10">
                {devices.filter((d) => String(d.seat) !== mv.from).map((d) => <option key={d.seat} value={String(d.seat)}>{d.label}</option>)}
                {devices.length < max && <option value="new">A new device (another PC)</option>}
              </select>
            </div>
            <button disabled={!!busy || !(Number(mv.days) >= 1)} className="btn-seal h-10 px-4 text-sm">{busy === "move" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move days"}</button>
          </div>
          <p className="mt-2 text-xs text-mist">A new device is ready for the next PC that signs in. Each PC runs on its own device&apos;s days.</p>
        </form>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-gold">{msg}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}

      {data.shop_items.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-mist">
          <span>In the shop:</span>
          {data.shop_items.map((it) => <span key={it.id} className="rounded border border-bronze/60 px-2 py-0.5 text-white">{it.name}</span>)}
          <Link to="/shop" className="btn-seal ml-auto h-9 px-4 text-sm leading-9">Buy days</Link>
        </div>
      ) : (
        <p className="mt-3 text-sm text-mist">The Guild Leader hasn&apos;t put Assistant days in the shop yet.</p>
      )}
      {data.shop_items.length > 0 && <p className="mt-1 text-xs text-mist">When you buy, you pick which device gets the days, or a new device for another PC.</p>}
    </Panel>
  );
}

// Type or paste the code the app shows, check it, and approve it.
function LinkApp({ code: initial, onDone, license }) {
  const [code, setCode] = useState(initial || "");
  const [found, setFound] = useState(null);       // what the code belongs to
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const look = useCallback(async (c) => {
    setBusy(true); setError(""); setFound(null);
    try {
      const res = await base44.functions.invoke("botAuth", { action: "describe", code: c });
      setFound(res.data);
    } catch (e) { setError(errorText(e, "Couldn't check that code.")); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (initial) look(initial); }, [initial, look]);

  const approve = async () => {
    setBusy(true); setError("");
    try {
      await base44.functions.invoke("botAuth", { action: "approve", code: found.code, deviceTag: found.device_tag });
      setDone(true); setFound(null); setCode("");
      await onDone();
    } catch (e) { setError(errorText(e, "Couldn't approve it.")); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <Panel title="Sign in the app">
        <p className="flex items-center gap-2 text-sm text-white"><CheckCircle2 className="h-5 w-5 text-gold" aria-hidden="true" /> Approved. Go back to the app, it signs in by itself in a few seconds.</p>
        <button onClick={() => setDone(false)} className="btn-bronze mt-3 h-9 px-3 text-sm">Sign in another PC</button>
      </Panel>
    );
  }
  return (
    <Panel title="Sign in the app">
      {found ? (
        <div className="space-y-3 text-sm">
          <p className="text-mist">{found.platform === "android" ? "The Assistant on a phone" : "An app on a PC"} is asking to sign in as you.</p>
          {found.mobile_off && <p className="text-ember">The phone Assistant isn&apos;t switched on for you yet, so it will sign in but not run. Ask the Guild Leader to allow it.</p>}
          <p className="rounded-md border border-bronze/50 bg-black/30 px-3 py-2 text-white">
            Device ID <b className="font-mono text-lg text-gold">{found.device_tag}</b>
            {found.app_version && <span className="ml-2 text-xs text-mist">app {found.app_version}</span>}
          </p>
          <p className="flex items-start gap-2 text-mist"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            Only approve it if the same device ID is showing in <b className="text-white">your own</b> app. If someone sent you this code, press Cancel.</p>
          {found.device && <p className="text-mist">This PC will run on <b className="text-white">{found.device}</b>.</p>}
          {found.other_device && <p className="text-ember">Every device with days is in use on another PC, so the app on this one will not run yet. Move some days to a new device (below), or buy days for a new device in the shop.</p>}
          {!license.active && <p className="text-mist">You have no active days, so the app will sign in but not run until you buy some.</p>}
          {error && <p role="alert" className="text-ember">{error}</p>}
          <div className="flex gap-2">
            <button onClick={approve} disabled={busy} className="btn-seal h-10 flex-1 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}</button>
            <button onClick={() => { setFound(null); setError(""); }} disabled={busy} className="btn-bronze h-10 flex-1 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); look(code); }} className="space-y-2">
          <label htmlFor="as-code" className="label">The code shown in the app (like K7QM-4TXD)</label>
          <div className="flex gap-2">
            <input id="as-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="field font-mono tracking-widest" placeholder="XXXX-XXXX" required />
            <button type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 8} className="btn-seal h-10 px-4 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}</button>
          </div>
          {error && <p role="alert" className="text-sm text-ember">{error}</p>}
        </form>
      )}
    </Panel>
  );
}

// 6.47: the phone Assistant (the BLACKLIST Android app). The Guild Leader switches it on per member; it runs on a device's days like a PC.
function PhonePanel({ allowed }) {
  const { settings } = useGuild();
  // only members the Guild Leader allowed see the phone app and its download
  const url = (settings && settings.app_download_url) || "/app/introboys.apk";
  if (!allowed) return null;
  return (
    <Panel title="On your phone">
      <div className="flex items-start gap-3 text-sm">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <div className="min-w-0 space-y-2 text-mist">
          <p><b className="text-white">The phone Assistant is on for you.</b> It presses the game buttons you put bubbles on (attack, skills, buffs, auto loot), on your phone, while you have days.</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Install the BLACKLIST app on your Android phone (Android 10 or newer). You get two icons: BLACKLIST (the guild hall) and <b className="text-white">IntroBoys Assistant</b>.</li>
            <li>Open IntroBoys Assistant and tap <b className="text-white">Sign in with the guild</b>: this page opens with the code to approve.</li>
            <li><b className="text-white">Allow restricted settings</b> (Android 13 and newer): Android blocks the tap permission for apps installed from a file. Tap <b className="text-white">App info</b> in the app, then the <b className="text-white">⋮</b> at the top right, then <b className="text-white">Allow restricted settings</b>. If there&apos;s no such option yet, do step 4 once (Android says it was denied) and come back.</li>
            <li>Tap <b className="text-white">Accessibility</b> in the app, then Installed apps, then <b className="text-white">IntroBoys Assistant taps</b>, and switch it on.</li>
            <li>Tap <b className="text-white">Show the floating S</b>, open the game, tap the S, then Bubbles: drag a bubble onto each game button and Save. Then tap the S and Start.</li>
          </ol>
          <p className="text-xs">You set it up once per phone. New versions install from inside the app (an Update button appears) and keep your permission and bubbles. Don&apos;t uninstall to update.</p>
          <p className="text-xs">A phone takes one of your devices, like a PC. To run it next to your PC, move some days to a new device above.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={url} className="btn-seal inline-flex h-9 items-center gap-1.5 px-3 text-sm"><Download className="h-4 w-4" aria-hidden="true" /> Download the app</a>
            {onAndroid() && <a href={OPEN_APP} className="btn-bronze inline-flex h-9 items-center px-3 text-sm">Open the Assistant</a>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
