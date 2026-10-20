import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import { peekPendingLink, clearPendingLink } from "@/lib/assistantLink";
import { cn } from "@/lib/utils";

const fmt = (n) => Number(n || 0).toLocaleString();
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

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("botAuth", { action: "status" });
      setData(res.data);
      setError("");
    } catch (e) {
      setError(errorText(e, "Couldn't load your Assistant license."));
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
        <p className="mt-1 text-sm text-mist">The Labyrinth helper for your PC. Buy days in the guild shop, sign the app in with a code, and it runs for as long as your days last.</p>
      </header>

      {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>}
      {!data && !error ? <LanternSpinner label="Checking your license" className="py-10" /> : data && (
        <>
          <LinkApp code={code} onDone={load} license={lic} />
          <License data={data} onChange={load} />
        </>
      )}

      <Panel title="How it works">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-mist">
          <li>Buy Assistant days in the <Link to="/shop" className="text-gold underline">guild shop</Link>. They switch on the moment you pay, and more days add to the time you have left.</li>
          <li>Open IntroBoys Assistant on your PC and press <b className="text-white">Sign in with Discord</b>. Your browser opens this page with a code.</li>
          <li>Check that the <b className="text-white">device ID</b> matches the one in the app, then press Approve.</li>
          <li>The app runs while you have days left and still hold the guild member role. It checks in every couple of minutes; if it can't, it stops.</li>
          <li>Your license is locked to the first PC that uses it. You can move it to another PC once a week.</li>
        </ol>
      </Panel>
    </div>
  );
}

function License({ data, onChange }) {
  const lic = data.license;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reset = async () => {
    if (!window.confirm("Move your license to another PC? The app is signed out here and the next PC that signs in gets the license.")) return;
    setBusy(true); setError("");
    try { await base44.functions.invoke("botAuth", { action: "resetDevice" }); await onChange(); }
    catch (e) { setError(errorText(e, "Couldn't move the license.")); }
    finally { setBusy(false); }
  };
  return (
    <Panel title="Your license">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("rounded-[3px] border px-2 py-0.5 text-xs font-bold uppercase", lic.active ? "border-white/70 text-white" : "border-ember/60 text-ember")}>
          {lic.active ? "Active" : lic.revoked ? "Switched off" : lic.total_days ? "Expired" : "No license"}
        </span>
        {lic.active && <span className="font-heading text-2xl font-extrabold text-gold">{fmt(lic.days_left)} day{lic.days_left === 1 ? "" : "s"} left</span>}
        {data.app_online && <span className="ml-auto flex items-center gap-1.5 text-xs text-mist"><span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" /> App running</span>}
      </div>
      {lic.active && <p className="mt-1 text-sm text-mist">Runs until {new Date(lic.expires_at).toLocaleString()}.</p>}
      {!lic.active && <p className="mt-2 text-sm text-mist">{WHY[lic.reason] || WHY.no_license}{lic.revoked && lic.revoked_reason ? ` (${lic.revoked_reason})` : ""}</p>}

      <div className="mt-3 rounded-md border border-bronze/50 bg-black/30 p-3 text-sm">
        <p className="flex items-center gap-2 font-bold text-white"><MonitorSmartphone className="h-4 w-4 text-gold" aria-hidden="true" /> Locked PC</p>
        {lic.device_bound ? (
          <>
            <p className="mt-1 text-mist">Locked to the PC with device ID <b className="font-mono text-gold">{lic.device_tag}</b>.</p>
            {data.next_reset_at && <p className="text-xs text-mist/80">You can move it again after {new Date(data.next_reset_at).toLocaleDateString()}.</p>}
            <button onClick={reset} disabled={busy || !data.can_reset} className="btn-bronze mt-2 h-9 px-3 text-sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move to another PC"}
            </button>
          </>
        ) : (
          <p className="mt-1 text-mist">Not locked yet. The first PC that runs the app with your license keeps it.</p>
        )}
        {error && <p role="alert" className="mt-2 text-ember">{error}</p>}
      </div>

      {data.shop_items.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-mist">
          <span>In the shop:</span>
          {data.shop_items.map((it) => <span key={it.id} className="rounded border border-bronze/60 px-2 py-0.5 text-white">{it.name}</span>)}
          <Link to="/shop" className="btn-seal ml-auto h-9 px-4 text-sm leading-9">Buy days</Link>
        </div>
      ) : (
        <p className="mt-3 text-sm text-mist">The Guild Leader hasn't put Assistant days in the shop yet.</p>
      )}
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
          <p className="text-mist">An app on a PC is asking to sign in as you.</p>
          <p className="rounded-md border border-bronze/50 bg-black/30 px-3 py-2 text-white">
            Device ID <b className="font-mono text-lg text-gold">{found.device_tag}</b>
            {found.app_version && <span className="ml-2 text-xs text-mist">app {found.app_version}</span>}
          </p>
          <p className="flex items-start gap-2 text-mist"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            Only approve it if the same device ID is showing in <b className="text-white">your own</b> app. If someone sent you this code, press Cancel.</p>
          {found.other_device && <p className="text-ember">Your license is locked to another PC, so the app on this one will not run until you move the license (below).</p>}
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
